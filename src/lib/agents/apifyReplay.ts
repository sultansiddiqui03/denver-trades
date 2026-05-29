import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { generateJSON } from '@/lib/ai/gemini';
import { computeAndStoreCompanyEmbedding } from '@/lib/ai/embedCompany';
import { scoreOrgCompanies } from '@/lib/scoring/runScoring';
import { computeAndStoreSourcingSignal } from '@/lib/signals/runSignals';
import { detectFromCompany } from '@/lib/opportunities/runDetect';
import type { Database, Json } from '@/lib/supabase/database.types';
import {
  buildEnrichmentSource,
  DEFAULT_SCRAPER_ACTOR_ID,
  mapItems,
  pickActor,
  type ScraperDataKind,
} from '@/lib/agents/scraperActors';

/** One supplier/buyer relationship pulled from customs records. */
export interface ScrapedSupplier {
  name: string;
  country?: string;
  shipments?: number;
}

/** One HS-coded product line from a customs profile. */
export interface ScrapedHsCode {
  code?: string;
  description?: string;
  shipments?: number;
}

/** A top trading partner (counterparty) from customs records. */
export interface ScrapedTradingPartner {
  name: string;
  country?: string;
  role?: string;
}

/** One per-shipment / contract-level customs record, when the actor exposes it. */
export interface ScrapedShipment {
  product?: string;
  hsCode?: string;
  supplier?: string;
  originCountry?: string;
  destinationCountry?: string;
  portLoading?: string;
  portDischarge?: string;
  quantityMt?: number;
  weightKg?: number;
  valueUsd?: number;
  incoterm?: string;
  date?: string;
  carrier?: string;
  /** Bill-of-lading number — the canonical customs-record id, when exposed. */
  billOfLading?: string;
}

/**
 * A shipment row from a *shipments-mode* actor. Unlike {@link ScrapedShipment}
 * (which hangs off a company record), this carries the buyer identity so the
 * shipments ingestion can group a flat list of shipments into companies.
 */
export interface ScrapedShipmentRow extends ScrapedShipment {
  buyerName: string;
  buyerCountry?: string;
  buyerCity?: string;
}

/**
 * Normalised shape of one scraped business record that the enrichment prompt
 * consumes. Different Apify actors return wildly different fields — the
 * adapter layer in [src/lib/agents/scraperActors.ts](./scraperActors.ts) maps
 * each actor's raw record into this shape so downstream code (the Gemini
 * enrichment prompt, the companies insert, the embedding job) only sees one
 * stable contract.
 *
 * Two tiers of fields:
 *   1. Directory fields (title…description) — present for every actor; the
 *      free-text `description` is what the LLM classifies on.
 *   2. Structured customs intelligence (totalShipments…trademarks) — present
 *      only for customs-grade actors (ImportYeti). These are HARD FACTS and
 *      must be persisted verbatim, NOT laundered through the LLM. They are the
 *      defensible signal that proves "this buyer actually buys what we sell".
 */
export interface ScrapedPlace {
  title?: string;
  categoryName?: string;
  website?: string;
  phone?: string;
  city?: string;
  countryCode?: string;
  street?: string;
  address?: string;
  description?: string;
  // --- structured customs intelligence (optional) ---
  totalShipments?: number;
  /** Date of most recent shipment, normalised to YYYY-MM-DD where possible. */
  lastShipmentDate?: string;
  topSuppliers?: ScrapedSupplier[];
  hsCodes?: ScrapedHsCode[];
  topTradingPartners?: ScrapedTradingPartner[];
  trademarks?: string[];
  /** Canonical source profile URL (e.g. ImportYeti detailUrl). */
  sourceUrl?: string;
  /** Catch-all for additional raw metrics not promoted to a named field. */
  rawMetrics?: Record<string, unknown>;
  /** Per-shipment / contract-level rows, when the source actor exposes them. */
  shipments?: ScrapedShipment[];
}

/**
 * Enrichment target shape. Mirrors the company columns the LLM is responsible
 * for populating from a raw scraped place. Defaults keep downstream inserts
 * type-safe even when Gemini omits optional fields.
 */
export const EnrichedCompanySchema = z.object({
  name: z.string(),
  type: z.enum(['Importer', 'Exporter', 'Broker']),
  hq_country: z.string().default(''),
  hq_city: z.string().default(''),
  origin_countries: z.array(z.string()).default([]),
  destination_countries: z.array(z.string()).default([]),
  products_dealt: z.array(z.string()).default([]),
  website: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

export type EnrichedCompany = z.infer<typeof EnrichedCompanySchema>;

export interface EnrichDatasetResult {
  processed: number;
  created: number;
}

const ENRICH_SYSTEM_PROMPT = `You are a B2B trade intelligence enrichment system.
Analyze the raw scraped business record and transform it into a structured B2B Company record.
Clean company name (remove random suffixes).
Classify type as 'Importer' if they buy or import, 'Exporter' if they sell, distribute, or grow, or 'Broker' as fallback.
Output JSON schema matching:
{
  "name": "Clean Company Name",
  "type": "Importer" | "Exporter" | "Broker",
  "hq_country": "Country Name (resolve country code)",
  "hq_city": "City Name",
  "origin_countries": ["array of countries they source from"],
  "destination_countries": ["array of countries they sell to"],
  "products_dealt": ["array of products like Pepper, Spices, Grains"],
  "website": "url if valid, or null",
  "description": "A high-quality 2-3 sentence overview of this business based on the crawl data."
}`;

/**
 * ImportYeti's `type` is the AUTHORITATIVE buyer/seller classification, derived
 * straight from US bills of lading: a `company` is a US IMPORTER (a BUYER), a
 * `supplier` is the overseas EXPORTER they buy from. The free-text enrichment
 * LLM cannot infer this reliably — it labelled "McCormick" (a US importer with
 * 10k+ inbound shipments) as an Exporter purely because the name reads like a
 * brand that "sells" spices. That silently inverts the core wedge (the buyer
 * never shows up as a buyer). So for customs records we OVERRIDE the LLM's
 * guess with the customs ground truth. `mapImportYetiRecord` stores the raw
 * ImportYeti `type` in `categoryName`. Returns null for unknown tokens so
 * non-customs / unrecognised records keep the LLM classification.
 */
function customsTypeOverride(
  categoryName: string | undefined,
): EnrichedCompany['type'] | null {
  const t = (categoryName ?? '').toLowerCase().trim();
  if (t === 'company') return 'Importer';
  if (t === 'supplier') return 'Exporter';
  return null;
}

function buildEnrichmentPrompt(item: ScrapedPlace): string {
  return `Analyze and structure the following scraped business details:
Name: ${item.title || 'Unknown'}
Website: ${item.website || 'N/A'}
Category: ${item.categoryName || 'N/A'}
Phone: ${item.phone || 'N/A'}
Address: ${item.address || item.street || 'N/A'}
City: ${item.city || 'N/A'}
Country Code: ${item.countryCode || 'N/A'}`;
}

/** Parse any source date string into a YYYY-MM-DD column value, or null. */
function normaliseShipmentDate(value?: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Derive a 0-1 confidence score from the *source quality*, not a hardcoded
 * constant. A customs record with hundreds of verified shipments is far more
 * trustworthy than a bare directory listing — the score should say so.
 */
function deriveConfidence(item: ScrapedPlace, dataKind: ScraperDataKind): number {
  let score = dataKind === 'customs' ? 0.82 : 0.6;
  const shipments = item.totalShipments ?? 0;
  if (shipments >= 500) score += 0.15;
  else if (shipments >= 100) score += 0.1;
  else if (shipments >= 10) score += 0.05;
  if (item.website) score += 0.02;
  if (item.hsCodes && item.hsCodes.length > 0) score += 0.02;
  return Math.min(0.99, Number(score.toFixed(2)));
}

/**
 * Coerce our structured DTO values into the Supabase `Json` column type.
 * The DTO interfaces (ScrapedSupplier etc.) are structurally valid JSON but
 * lack the index signature `Json` requires, so a cast is unavoidable here.
 * Empty arrays / undefined collapse to null to keep jsonb columns clean.
 */
function toJson(value: unknown): Json {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value) && value.length === 0) return null;
  return value as Json;
}

/**
 * Fetch the raw items of a finished Apify dataset using the configured token.
 * Centralised so the webhook receiver and the admin replay endpoint share the
 * same auth + error surface.
 *
 * Returns `unknown[]` deliberately: each registered actor in
 * [scraperActors.ts](./scraperActors.ts) produces a different per-record
 * shape, so the caller MUST pass these through `mapItems(rawItems, actorId)`
 * before feeding them to the enrichment pass.
 */
export async function fetchApifyDatasetItems(datasetId: string): Promise<unknown[]> {
  const token = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN;
  if (!token) {
    throw new Error('APIFY_TOKEN is missing in environment variables');
  }

  const datasetUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}`;
  const datasetResponse = await fetch(datasetUrl);
  if (!datasetResponse.ok) {
    throw new Error(`Failed to fetch Apify dataset items: ${await datasetResponse.text()}`);
  }

  const parsed = (await datasetResponse.json()) as unknown;
  return Array.isArray(parsed) ? parsed : [];
}

export interface EnrichAndInsertOptions {
  /** Maximum number of scraped items to enrich + persist (default 5). */
  limit?: number;
  /** Apify dataset id — used to build the `enrichment_source` tag. */
  datasetId?: string;
  /**
   * Apify actor id used to produce these items. Drives:
   *   - which `ScraperActor.mapItem` is applied to each record
   *   - the `:<actorId>` suffix on `enrichment_source` so the dossier can
   *     show "Source: Customs data — ImportYeti".
   * Defaults to the registry default (Google Maps) for backward compatibility
   * with pre-refactor replays that don't carry an actor id.
   */
  actorId?: string;
}

/**
 * Take a raw list of Apify dataset records, enrich the first N of them via
 * Gemini, insert them as companies under the supplied org, and compute
 * embeddings.
 *
 * - Used by the webhook receiver (POST /api/webhooks/apify) and the manual
 *   replay endpoint (POST /api/admin/apify/replay).
 * - Raw items are mapped to {@link ScrapedPlace} via the actor adapter in
 *   {@link scraperActors}. Items whose `mapItem` returns `null` are dropped
 *   silently and don't count toward `processed`.
 * - Per-item errors (enrichment OR insert OR embedding) are logged and skipped
 *   so a single bad record cannot poison the whole batch — matches existing
 *   webhook behaviour (Apify would otherwise retry and we'd risk duplicates).
 * - `processed` reflects ALL mapped items (not just the sliced top-N), so the
 *   agent run row records the true scrape volume.
 * - When `datasetId` is supplied, each inserted company is tagged with
 *   `enrichment_source = 'apify:<datasetId>:<actorId>'` so the
 *   agent-run-leads-preview on /dashboard/agents can look up exactly which
 *   companies belong to a run AND the dossier can show the data source.
 */
export async function enrichAndInsertScrapedItems(
  supabase: SupabaseClient<Database>,
  orgId: string,
  rawItems: unknown[],
  options: EnrichAndInsertOptions = {},
): Promise<EnrichDatasetResult> {
  const { limit = 5, datasetId, actorId } = options;
  const effectiveActorId = actorId ?? DEFAULT_SCRAPER_ACTOR_ID;
  const actor = pickActor(effectiveActorId);
  const items = mapItems(rawItems, effectiveActorId);
  const itemsToProcess = items.slice(0, limit);
  let createdCount = 0;
  const insertedIds: string[] = [];
  const enrichmentSource = datasetId
    ? buildEnrichmentSource(datasetId, effectiveActorId)
    : `apify-lead-scraper:${effectiveActorId}`;

  for (const item of itemsToProcess) {
    try {
      const enriched: EnrichedCompany = await generateJSON(
        buildEnrichmentPrompt(item),
        EnrichedCompanySchema,
        ENRICH_SYSTEM_PROMPT,
      );

      const contacts = item.phone
        ? [{ name: 'Main Office', phone: item.phone, email: null }]
        : [];

      // Customs `type` is a hard fact — never let the LLM's guess override it.
      const customsType =
        actor.dataKind === 'customs' ? customsTypeOverride(item.categoryName) : null;

      const { data: inserted, error: dbError } = await supabase
        .from('companies')
        .insert({
          org_id: orgId,
          name: enriched.name,
          type: customsType ?? enriched.type,
          hq_country: enriched.hq_country,
          hq_city: enriched.hq_city,
          origin_countries: enriched.origin_countries,
          destination_countries: enriched.destination_countries,
          products_dealt: enriched.products_dealt,
          website: enriched.website || null,
          description: enriched.description || 'Scraped and enriched via Apify Lead Scraper.',
          contacts: contacts,
          is_enriched: true,
          enriched_at: new Date().toISOString(),
          enrichment_source: enrichmentSource,
          confidence_score: deriveConfidence(item, actor.dataKind),
          // Structured customs intelligence — persisted verbatim from source,
          // never LLM-laundered. Empty arrays collapse to null.
          total_shipments: item.totalShipments ?? null,
          last_shipment_date: normaliseShipmentDate(item.lastShipmentDate),
          top_suppliers: toJson(item.topSuppliers),
          hs_codes: toJson(item.hsCodes),
          top_trading_partners: toJson(item.topTradingPartners),
          trademarks: toJson(item.trademarks),
          source_url: item.sourceUrl ?? null,
          trade_metrics: toJson(item.rawMetrics),
        })
        .select('id')
        .single();

      if (dbError || !inserted) {
        console.error(`Error saving enriched company ${enriched.name}:`, dbError);
        continue;
      }

      createdCount++;
      insertedIds.push(inserted.id);

      // Best-effort embedding so the company is searchable via
      // /api/search/semantic. A missing OPENAI_API_KEY or provider
      // hiccup must not fail the surrounding flow — log and continue.
      try {
        await computeAndStoreCompanyEmbedding(supabase, inserted.id);
      } catch (embedError) {
        console.error(
          `Apify enrich: embedding failed for company ${inserted.id} (${enriched.name}):`,
          embedError,
        );
      }

      // Persist per-shipment / contract rows when the actor exposed them, then
      // derive the supplier-shift signal from this company's shipment history.
      if (item.shipments && item.shipments.length > 0) {
        try {
          const shipRows = item.shipments.slice(0, 200).map((sh) => ({
            org_id: orgId,
            company_id: inserted.id,
            product: sh.product || enriched.products_dealt[0] || enriched.name,
            hs_code: sh.hsCode ?? null,
            supplier_name: sh.supplier ?? null,
            origin_country: sh.originCountry ?? null,
            destination_country: sh.destinationCountry ?? null,
            port_loading: sh.portLoading ?? null,
            port_discharge: sh.portDischarge ?? null,
            quantity_mt: sh.quantityMt ?? null,
            weight_kg: sh.weightKg ?? null,
            value_usd: sh.valueUsd ?? null,
            incoterm: sh.incoterm ?? null,
            shipment_date: normaliseShipmentDate(sh.date),
            carrier: sh.carrier ?? null,
            source_reference: sh.billOfLading ?? enrichmentSource,
          }));
          const { error: shipError } = await supabase.from('shipments').insert(shipRows);
          if (shipError) {
            console.error(`Apify enrich: shipment insert failed for ${inserted.id}:`, shipError);
          } else {
            await computeAndStoreSourcingSignal(supabase, inserted.id);
          }
        } catch (shipErr) {
          console.error(`Apify enrich: shipment/signal step failed for ${inserted.id}:`, shipErr);
        }
      }
    } catch (enrichError) {
      console.error('Failed to enrich scraped item:', item, enrichError);
    }
  }

  // Auto-score the freshly inserted companies for buyer-fit so they surface
  // in the Buyer-Match engine immediately. Best-effort: a scoring hiccup must
  // not fail the scrape ingest.
  if (insertedIds.length > 0) {
    try {
      await scoreOrgCompanies(supabase, orgId, { companyIds: insertedIds });
    } catch (scoreError) {
      console.error('Apify enrich: buyer-fit scoring failed:', scoreError);
    }
    // Real-time: surface any high-fit / switching buyers as opportunities.
    for (const id of insertedIds) {
      try {
        await detectFromCompany(supabase, orgId, id);
      } catch (oppError) {
        console.error(`Apify enrich: opportunity detection failed for ${id}:`, oppError);
      }
    }
  }

  return { processed: items.length, created: createdCount };
}

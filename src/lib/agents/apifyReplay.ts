import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { generateJSON } from '@/lib/ai/gemini';
import { computeAndStoreCompanyEmbedding } from '@/lib/ai/embedCompany';
import type { Database } from '@/lib/supabase/database.types';
import {
  buildEnrichmentSource,
  DEFAULT_SCRAPER_ACTOR_ID,
  mapItems,
} from '@/lib/agents/scraperActors';

/**
 * Normalised shape of one scraped business record that the enrichment prompt
 * consumes. Different Apify actors return wildly different fields — the
 * adapter layer in [src/lib/agents/scraperActors.ts](./scraperActors.ts) maps
 * each actor's raw record into this shape so downstream code (the Gemini
 * enrichment prompt, the companies insert, the embedding job) only sees one
 * stable contract.
 *
 * Treat this as a presentation-layer DTO: optional fields are filled when the
 * source actor has them, omitted when it doesn't. Don't add fields that only
 * one actor produces — push that into the actor's `mapItem` description text
 * instead so the LLM gets the signal without coupling the schema.
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
  const items = mapItems(rawItems, effectiveActorId);
  const itemsToProcess = items.slice(0, limit);
  let createdCount = 0;
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

      const { data: inserted, error: dbError } = await supabase
        .from('companies')
        .insert({
          org_id: orgId,
          name: enriched.name,
          type: enriched.type,
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
          confidence_score: 0.92,
        })
        .select('id')
        .single();

      if (dbError || !inserted) {
        console.error(`Error saving enriched company ${enriched.name}:`, dbError);
        continue;
      }

      createdCount++;

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
    } catch (enrichError) {
      console.error('Failed to enrich scraped item:', item, enrichError);
    }
  }

  return { processed: items.length, created: createdCount };
}

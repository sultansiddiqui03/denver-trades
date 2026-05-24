import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import {
  enrichAndInsertScrapedItems,
  type EnrichDatasetResult,
  type ScrapedShipmentRow,
} from './apifyReplay';
import {
  buildEnrichmentSource,
  pickActor,
  mapShipmentRows,
  DEFAULT_SCRAPER_ACTOR_ID,
} from './scraperActors';
import { computeAndStoreCompanyEmbedding } from '@/lib/ai/embedCompany';
import { scoreOrgCompanies } from '@/lib/scoring/runScoring';
import { computeAndStoreSourcingSignal } from '@/lib/signals/runSignals';

const toJson = (v: unknown): Json => (v === undefined || v === null ? null : (v as Json));

function normaliseDate(value?: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

const normKey = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Recompute a company's customs aggregates (total_shipments, last_shipment_date,
 * top_suppliers, hs_codes, top_trading_partners, origin_countries,
 * products_dealt) from its shipment rows, then refresh buyer-fit + sourcing
 * signal. Shared by the shipments ingest and the signals backfill so the
 * derivation never drifts.
 */
export async function recomputeCompanyTradeAggregates(
  supabase: SupabaseClient<Database>,
  orgId: string,
  companyId: string,
): Promise<void> {
  const { data: rows } = await supabase
    .from('shipments')
    .select(
      'product, hs_code, supplier_name, origin_country, quantity_mt, weight_kg, shipment_date',
    )
    .eq('company_id', companyId)
    .order('shipment_date', { ascending: false })
    .limit(1000);

  const shipments = rows ?? [];
  if (shipments.length === 0) return;

  const supMap = new Map<string, { name: string; country?: string; shipments: number }>();
  const hsMap = new Map<string, { code?: string; description?: string; shipments: number }>();
  const originSet = new Set<string>();
  const productSet = new Set<string>();
  let lastDate: string | null = null;

  for (const s of shipments) {
    if (s.supplier_name) {
      const k = normKey(s.supplier_name);
      const e = supMap.get(k) ?? {
        name: s.supplier_name,
        country: s.origin_country ?? undefined,
        shipments: 0,
      };
      e.shipments += 1;
      supMap.set(k, e);
    }
    const hsKey = (s.hs_code ?? s.product ?? '').trim();
    if (hsKey) {
      const k = normKey(hsKey);
      const e = hsMap.get(k) ?? {
        code: s.hs_code ?? undefined,
        description: s.product ?? undefined,
        shipments: 0,
      };
      e.shipments += 1;
      hsMap.set(k, e);
    }
    if (s.origin_country) originSet.add(s.origin_country);
    if (s.product) productSet.add(s.product);
    if (s.shipment_date && (!lastDate || s.shipment_date > lastDate)) lastDate = s.shipment_date;
  }

  const topSuppliers = [...supMap.values()].sort((a, b) => b.shipments - a.shipments).slice(0, 8);
  const hsCodes = [...hsMap.values()].sort((a, b) => b.shipments - a.shipments).slice(0, 10);
  const topTradingPartners = topSuppliers
    .slice(0, 6)
    .map((s) => ({ name: s.name, country: s.country, role: 'Supplier' }));

  await supabase
    .from('companies')
    .update({
      total_shipments: shipments.length,
      last_shipment_date: lastDate,
      top_suppliers: toJson(topSuppliers),
      hs_codes: toJson(hsCodes),
      top_trading_partners: toJson(topTradingPartners),
      origin_countries: [...originSet].slice(0, 12),
      products_dealt: [...productSet].slice(0, 12),
    })
    .eq('id', companyId)
    .eq('org_id', orgId);

  try {
    await scoreOrgCompanies(supabase, orgId, { companyIds: [companyId] });
  } catch (e) {
    console.error(`Aggregates: scoring failed for ${companyId}:`, e);
  }
  try {
    await computeAndStoreSourcingSignal(supabase, companyId);
  } catch (e) {
    console.error(`Aggregates: signal failed for ${companyId}:`, e);
  }
}

/**
 * Ingest a shipments-mode Apify dataset: group the flat shipment rows by buyer,
 * upsert each buyer as a company, insert the shipment rows, then derive
 * aggregates + buyer-fit + sourcing signal. Caps companies per run.
 */
export async function enrichAndInsertShipments(
  supabase: SupabaseClient<Database>,
  orgId: string,
  rawItems: unknown[],
  options: { datasetId?: string; actorId?: string; companyLimit?: number } = {},
): Promise<EnrichDatasetResult> {
  const { datasetId, actorId, companyLimit = 8 } = options;
  const effectiveActorId = actorId ?? DEFAULT_SCRAPER_ACTOR_ID;
  const enrichmentSource = datasetId
    ? buildEnrichmentSource(datasetId, effectiveActorId)
    : `apify-shipments:${effectiveActorId}`;

  const rows = mapShipmentRows(rawItems, effectiveActorId);
  if (rows.length === 0) return { processed: 0, created: 0 };

  const groups = new Map<string, ScrapedShipmentRow[]>();
  for (const r of rows) {
    const k = normKey(r.buyerName);
    const arr = groups.get(k) ?? [];
    arr.push(r);
    groups.set(k, arr);
  }

  // Largest buyers first; cap how many companies one run can create.
  const ordered = [...groups.values()]
    .sort((a, b) => b.length - a.length)
    .slice(0, companyLimit);

  let created = 0;
  for (const groupRows of ordered) {
    try {
      const buyerName = groupRows[0].buyerName;

      const { data: existing } = await supabase
        .from('companies')
        .select('id')
        .eq('org_id', orgId)
        .ilike('name', buyerName)
        .limit(1)
        .maybeSingle();

      let companyId: string;
      if (existing?.id) {
        companyId = existing.id;
      } else {
        const hqCountry =
          groupRows[0].buyerCountry ?? groupRows[0].destinationCountry ?? 'United States';
        const { data: inserted, error: insErr } = await supabase
          .from('companies')
          .insert({
            org_id: orgId,
            name: buyerName,
            type: 'Importer',
            hq_country: hqCountry,
            hq_city: groupRows[0].buyerCity ?? null,
            destination_countries: [hqCountry],
            description: `Importer identified from ${groupRows.length} customs shipment records.`,
            is_enriched: true,
            enriched_at: new Date().toISOString(),
            enrichment_source: enrichmentSource,
            confidence_score: 0.9,
          })
          .select('id')
          .single();
        if (insErr || !inserted) {
          console.error('Shipments ingest: company insert failed:', insErr);
          continue;
        }
        companyId = inserted.id;
        created++;
      }

      const shipRows = groupRows.slice(0, 500).map((r) => ({
        org_id: orgId,
        company_id: companyId,
        product: r.product || 'Unknown',
        hs_code: r.hsCode ?? null,
        supplier_name: r.supplier ?? null,
        origin_country: r.originCountry ?? null,
        destination_country: r.destinationCountry ?? null,
        port_loading: r.portLoading ?? null,
        port_discharge: r.portDischarge ?? null,
        quantity_mt: r.quantityMt ?? null,
        weight_kg: r.weightKg ?? null,
        value_usd: r.valueUsd ?? null,
        incoterm: r.incoterm ?? null,
        shipment_date: normaliseDate(r.date),
        carrier: r.carrier ?? null,
        source_reference: enrichmentSource,
      }));
      const { error: shipErr } = await supabase.from('shipments').insert(shipRows);
      if (shipErr) {
        console.error('Shipments ingest: shipment insert failed:', shipErr);
        continue;
      }

      await recomputeCompanyTradeAggregates(supabase, orgId, companyId);

      try {
        await computeAndStoreCompanyEmbedding(supabase, companyId);
      } catch (e) {
        console.error(`Shipments ingest: embedding failed for ${companyId}:`, e);
      }
    } catch (e) {
      console.error('Shipments ingest: group failed:', e);
    }
  }

  return { processed: rows.length, created };
}

/**
 * Single branch point: route a finished Apify dataset to the company-mode or
 * shipments-mode ingestion based on the resolved actor's `dataKind`. Used by
 * the webhook receiver and the admin replay endpoint so they stay in sync.
 */
export async function ingestApifyDataset(
  supabase: SupabaseClient<Database>,
  orgId: string,
  rawItems: unknown[],
  options: { datasetId?: string; actorId?: string } = {},
): Promise<EnrichDatasetResult> {
  const actor = pickActor(options.actorId ?? DEFAULT_SCRAPER_ACTOR_ID);
  if (actor.dataKind === 'shipments') {
    return enrichAndInsertShipments(supabase, orgId, rawItems, options);
  }
  return enrichAndInsertScrapedItems(supabase, orgId, rawItems, { ...options, limit: 5 });
}

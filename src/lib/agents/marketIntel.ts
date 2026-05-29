import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import { runApifyActorSync } from '@/lib/agents/dispatchScrape';
import { normalizeProductQuery } from '@/lib/agents/productQuery';

/**
 * Market-intelligence layer — price benchmarks + demand-by-destination.
 *
 * Built on Zauba (parseforge/zauba-scraper), which exposes Indian customs
 * shipment lines WITH invoice values (USD) and per-unit prices, plus a
 * market-level summary. The party names are anonymized (Indian customs masks
 * them), so this can't name a buyer — but it answers the exporter's other key
 * questions: what's this product's market worth, WHERE is the demand, and what
 * price clears? Cached in `market_intel` (global, like commodity_prices) with a
 * 7-day freshness window so repeated lookups are instant and don't re-pay Apify.
 */

export interface MarketSummary {
  totalTradeValueUsd?: string;
  averagePriceUsd?: string;
  totalCountries?: number;
  topCountry?: string;
  topCountryShare?: string;
  secondCountry?: string;
  secondCountryShare?: string;
  peakMonth?: string;
  mostFrequentHsCode?: string;
  totalExporters?: number;
  totalImporters?: number;
  totalRecords?: number;
}

export interface DestinationStat {
  country: string;
  shipments: number;
  totalValueUsd: number;
  avgPricePerUnitUsd: number | null;
}

export interface HsStat {
  code: string;
  description: string;
  shipments: number;
  totalValueUsd: number;
}

export interface SampleShipment {
  date?: string;
  product?: string;
  country?: string;
  hsCode?: string;
  quantity?: number;
  unit?: string;
  totalValueUsd?: number;
  pricePerUnitUsd?: number;
  port?: string;
}

export interface MarketIntelResult {
  product: string;
  tradeType: 'import' | 'export';
  source: string;
  fetchedAt: string;
  cached: boolean;
  totalRecords: number;
  summary: MarketSummary | null;
  topDestinations: DestinationStat[];
  hsBreakdown: HsStat[];
  sampleShipments: SampleShipment[];
}

const FRESH_MS = 7 * 24 * 60 * 60 * 1000;
const SOURCE = 'zauba';

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

type MarketIntelRow = Database['public']['Tables']['market_intel']['Row'];

function rowToResult(row: MarketIntelRow, cached: boolean): MarketIntelResult {
  return {
    product: row.product,
    tradeType: row.trade_type as 'import' | 'export',
    source: row.source,
    fetchedAt: row.fetched_at,
    cached,
    totalRecords: row.total_records ?? 0,
    summary: (row.summary as MarketSummary | null) ?? null,
    topDestinations: (row.top_destinations as unknown as DestinationStat[]) ?? [],
    hsBreakdown: (row.hs_breakdown as unknown as HsStat[]) ?? [],
    sampleShipments: (row.sample_shipments as unknown as SampleShipment[]) ?? [],
  };
}

/**
 * Get market intelligence for a product (export = where it ships TO / global
 * demand; import = who India sources from). Returns cached data when fresh,
 * otherwise scrapes Zauba, aggregates, caches, and returns. Pass a service-role
 * client — `market_intel` is a global table written outside RLS.
 */
export async function getMarketIntel(
  supabase: SupabaseClient<Database>,
  product: string,
  tradeType: 'import' | 'export',
  opts: { force?: boolean; maxItems?: number } = {},
): Promise<MarketIntelResult> {
  const cleanProduct = normalizeProductQuery(product);
  const normalizedProduct = cleanProduct.toLowerCase();

  if (!opts.force) {
    const { data: cached } = await supabase
      .from('market_intel')
      .select('*')
      .eq('product', normalizedProduct)
      .eq('trade_type', tradeType)
      .eq('source', SOURCE)
      .maybeSingle();
    if (cached && Date.now() - new Date(cached.fetched_at).getTime() < FRESH_MS) {
      return rowToResult(cached, true);
    }
  }

  const raw = await runApifyActorSync(
    'parseforge~zauba-scraper',
    { product: cleanProduct, tradeType, maxItems: opts.maxItems ?? 100 },
    { timeoutSecs: 150 },
  );

  let summary: MarketSummary | null = null;
  const destMap = new Map<string, { shipments: number; value: number; priceSum: number; priceN: number }>();
  const hsMap = new Map<string, { description: string; shipments: number; value: number }>();
  const samples: SampleShipment[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    if (!summary && obj.marketSummary && typeof obj.marketSummary === 'object') {
      summary = obj.marketSummary as MarketSummary;
    }
    const country = str(obj.country) ?? 'Unknown';
    const value = num(obj.totalValueUsd);
    const price = num(obj.pricePerUnitUsd);
    const d = destMap.get(country) ?? { shipments: 0, value: 0, priceSum: 0, priceN: 0 };
    d.shipments++;
    d.value += value;
    if (price > 0) {
      d.priceSum += price;
      d.priceN++;
    }
    destMap.set(country, d);

    const code = str(obj.hsCode) ?? 'n/a';
    const h = hsMap.get(code) ?? { description: str(obj.hsCodeDescription) ?? '', shipments: 0, value: 0 };
    h.shipments++;
    h.value += value;
    if (!h.description) h.description = str(obj.hsCodeDescription) ?? '';
    hsMap.set(code, h);

    if (samples.length < 12) {
      samples.push({
        date: str(obj.date),
        product: str(obj.productDescription),
        country,
        hsCode: code,
        quantity: num(obj.quantity) || undefined,
        unit: str(obj.unit),
        totalValueUsd: value || undefined,
        pricePerUnitUsd: price || undefined,
        port: str(obj.port),
      });
    }
  }

  const topDestinations: DestinationStat[] = [...destMap.entries()]
    .map(([country, d]) => ({
      country,
      shipments: d.shipments,
      totalValueUsd: Math.round(d.value),
      avgPricePerUnitUsd: d.priceN ? Math.round((d.priceSum / d.priceN) * 100) / 100 : null,
    }))
    .sort((a, b) => b.shipments - a.shipments)
    .slice(0, 12);

  const hsBreakdown: HsStat[] = [...hsMap.entries()]
    .map(([code, h]) => ({
      code,
      description: h.description,
      shipments: h.shipments,
      totalValueUsd: Math.round(h.value),
    }))
    .sort((a, b) => b.shipments - a.shipments)
    .slice(0, 12);

  const totalRecords = raw.length;
  const fetchedAt = new Date().toISOString();

  const { error } = await supabase.from('market_intel').upsert(
    {
      product: normalizedProduct,
      trade_type: tradeType,
      source: SOURCE,
      summary: (summary ?? null) as Json,
      top_destinations: topDestinations as unknown as Json,
      hs_breakdown: hsBreakdown as unknown as Json,
      sample_shipments: samples as unknown as Json,
      total_records: totalRecords,
      fetched_at: fetchedAt,
    },
    { onConflict: 'product,trade_type,source' },
  );
  if (error) console.error('getMarketIntel: cache upsert failed:', error);

  return {
    product: normalizedProduct,
    tradeType,
    source: SOURCE,
    fetchedAt,
    cached: false,
    totalRecords,
    summary,
    topDestinations,
    hsBreakdown,
    sampleShipments: samples,
  };
}

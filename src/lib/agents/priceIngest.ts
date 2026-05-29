import { getSupabaseServiceClient } from '@/lib/supabase/admin';

export interface PriceIngestResult {
  processed: number;
  created: number;
}

/**
 * Generates a new price tick for the LATEST value of every commodity_prices
 * feed, applying small random volatility. This is a SIMULATED series — there is
 * no live exchange/port feed wired yet (a real one is a paid integration). For
 * real, customs-verified per-unit prices use the Market Intel page (Zauba).
 * Shared between the Vercel cron (/api/prices?cron=true) and the manual trigger.
 *
 * Per-row insert failures are logged and skipped — one bad row must not abort
 * the whole batch.
 */
export async function runPriceIngest(): Promise<PriceIngestResult> {
  const supabase = getSupabaseServiceClient();

  // Take the latest tick per commodity (avoid compounding volatility off every
  // historical row, which also re-inserted duplicates per commodity).
  const { data: prices, error: fetchError } = await supabase
    .from('commodity_prices')
    .select('commodity, origin_country, price_usd, unit, source, recorded_at')
    .order('recorded_at', { ascending: false });

  if (fetchError) throw fetchError;
  if (!prices || prices.length === 0) {
    return { processed: 0, created: 0 };
  }

  const latestByCommodity = new Map<string, (typeof prices)[number]>();
  for (const feed of prices) {
    if (!latestByCommodity.has(feed.commodity)) latestByCommodity.set(feed.commodity, feed);
  }

  let created = 0;
  for (const feed of latestByCommodity.values()) {
    const volatility = 1 + (Math.random() * 0.03 - 0.015);
    const newPrice = Math.round(Number(feed.price_usd) * volatility * 100) / 100;

    const { error: insertError } = await supabase
      .from('commodity_prices')
      .insert({
        commodity: feed.commodity,
        origin_country: feed.origin_country,
        price_usd: newPrice,
        unit: feed.unit,
        source: feed.source,
        recorded_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error(`Price ingest: failed to insert tick for ${feed.commodity}:`, insertError);
      continue;
    }
    created++;
  }

  return { processed: latestByCommodity.size, created };
}

import { getSupabaseServiceClient } from '@/lib/supabase/admin';

export interface PriceIngestResult {
  processed: number;
  created: number;
}

/**
 * Generates a new price tick for every existing commodity_prices feed, applying
 * a small random volatility. Shared between the Vercel cron (/api/prices?cron=true)
 * and the manual Price Ingest Agent trigger.
 */
export async function runPriceIngest(): Promise<PriceIngestResult> {
  const supabase = getSupabaseServiceClient();

  const { data: prices, error: fetchError } = await supabase
    .from('commodity_prices')
    .select('commodity, origin_country, price_usd, unit, source');

  if (fetchError) throw fetchError;
  if (!prices || prices.length === 0) {
    return { processed: 0, created: 0 };
  }

  let created = 0;
  for (const feed of prices) {
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

    if (insertError) throw insertError;
    created++;
  }

  return { processed: prices.length, created };
}

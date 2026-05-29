import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServiceClient } from '@/lib/supabase/admin';
import { getErrorMessage } from '@/lib/errors';
import { isAutomationAuthorized } from '@/lib/security/request';
import { parseBody } from '@/lib/validation';
import { getMarketIntel } from '@/lib/agents/marketIntel';

/**
 * Pre-populate the GLOBAL market_intel cache for common commodities so the
 * Market Intel page shows real data for EVERY customer from day one (the table
 * isn't org-scoped). Each product is one Zauba run (~30s), so a single call
 * handles a small batch under the 300s ceiling — invoke a few times to cover a
 * full list. Skips products already fresh in the cache unless `force`.
 *
 * Auth: Bearer ${CRON_SECRET}.
 *
 *   curl -X POST https://denver-trades.vercel.app/api/admin/market-intel/seed \
 *     -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" \
 *     -d '{"products":["black pepper","rice","turmeric"]}'
 */
export const maxDuration = 300;

const DEFAULT_PRODUCTS = [
  'black pepper', 'rice', 'basmati rice', 'turmeric', 'cumin', 'cardamom',
  'sesame seeds', 'cashew', 'tea', 'coffee', 'ginger', 'chilli',
];

const SeedSchema = z.object({
  products: z.array(z.string().trim().min(1)).min(1).max(6).optional(),
  tradeType: z.enum(['import', 'export']).optional(),
  force: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    if (!isAutomationAuthorized(request)) {
      return NextResponse.json(
        { success: false, error: 'Admin authorization failed' },
        { status: 401 },
      );
    }

    let products = DEFAULT_PRODUCTS.slice(0, 4);
    let tradeType: 'import' | 'export' = 'export';
    let force = false;
    const contentLength = request.headers.get('content-length');
    if (contentLength && Number(contentLength) > 0) {
      const parsed = await parseBody(request, SeedSchema);
      if (!parsed.ok) return parsed.response;
      if (parsed.data.products) products = parsed.data.products;
      if (parsed.data.tradeType) tradeType = parsed.data.tradeType;
      force = parsed.data.force ?? false;
    }

    const supabase = getSupabaseServiceClient();
    const results: { product: string; records: number; ok: boolean }[] = [];
    for (const product of products) {
      try {
        const r = await getMarketIntel(supabase, product, tradeType, { force });
        results.push({ product, records: r.totalRecords, ok: true });
      } catch (e) {
        console.error(`market-intel seed: failed for "${product}":`, e);
        results.push({ product, records: 0, ok: false });
      }
    }

    return NextResponse.json({ success: true, tradeType, seeded: results });
  } catch (error: unknown) {
    console.error('Admin market-intel seed error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

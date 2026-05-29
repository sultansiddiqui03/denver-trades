import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getErrorMessage } from '@/lib/errors';
import { requireUserContext } from '@/lib/auth/server';
import { getSupabaseServiceClient } from '@/lib/supabase/admin';
import { parseBody } from '@/lib/validation';
import { getMarketIntel } from '@/lib/agents/marketIntel';
import { captureError } from '@/lib/observability/capture';

/**
 * Market intelligence for a product: total market value, demand by destination,
 * price benchmarks, and HS breakdown — from anonymized customs aggregates
 * (Zauba). Org-authenticated, but writes to the GLOBAL market_intel cache via
 * the service-role client (the table isn't org-scoped, same as commodity_prices).
 */
export const maxDuration = 300;

const Schema = z.object({
  product: z.string().trim().min(1).max(120),
  tradeType: z.enum(['import', 'export']).optional(),
  force: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;

    const parsed = await parseBody(request, Schema);
    if (!parsed.ok) return parsed.response;
    const { product, tradeType, force } = parsed.data;

    if (!process.env.APIFY_TOKEN && !process.env.APIFY_API_TOKEN) {
      return NextResponse.json(
        { success: false, error: 'Market intel needs APIFY_TOKEN to query customs data.' },
        { status: 503 },
      );
    }

    // market_intel is global reference data — write it with the service client.
    const service = getSupabaseServiceClient();
    const result = await getMarketIntel(service, product, tradeType ?? 'export', { force });

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    await captureError(error, { route: 'api/market-intel' });
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

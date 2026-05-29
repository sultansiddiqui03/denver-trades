import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServiceClient } from '@/lib/supabase/admin';
import { getErrorMessage } from '@/lib/errors';
import { isAutomationAuthorized } from '@/lib/security/request';
import { parseBody } from '@/lib/validation';
import { discoverBuyersForProduct } from '@/lib/agents/buyerDiscovery';

/**
 * Admin trigger for the product → buyer discovery engine. Given a product term,
 * runs a live ImportYeti product search, HS-chapter-filters the suppliers to
 * those that genuinely deal the commodity, harvests their US trading partners
 * as buyers, and ingests them as scored Importer leads under the org. Uses
 * production's own APIFY_TOKEN (never leaves the server) and runs synchronously.
 *
 * Auth: Bearer ${CRON_SECRET}, same shape as the other /api/admin endpoints.
 *
 *   curl -X POST https://denver-trades.vercel.app/api/admin/apify/discover-buyers \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"orgId":"<uuid>","product":"black pepper"}'
 */
// Discovery makes one product-search Apify run plus per-buyer DB work; give it
// generous headroom under Vercel's 300s function ceiling.
export const maxDuration = 300;

const DiscoverSchema = z.object({
  orgId: z.string().uuid(),
  product: z.string().trim().min(1).max(120),
  maxSuppliers: z.number().int().min(1).max(100).optional(),
  maxBuyers: z.number().int().min(1).max(50).optional(),
  enrichTop: z.number().int().min(0).max(6).optional(),
});

export async function POST(request: Request) {
  try {
    if (!isAutomationAuthorized(request)) {
      return NextResponse.json(
        { success: false, error: 'Admin authorization failed' },
        { status: 401 },
      );
    }

    const parsed = await parseBody(request, DiscoverSchema);
    if (!parsed.ok) return parsed.response;
    const { orgId, product, maxSuppliers, maxBuyers, enrichTop } = parsed.data;

    const supabase = getSupabaseServiceClient();
    const result = await discoverBuyersForProduct(supabase, orgId, product, {
      maxSuppliers,
      maxBuyers,
      enrichTop,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    console.error('Admin buyer-discovery error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

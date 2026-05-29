import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServiceClient } from '@/lib/supabase/admin';
import { getErrorMessage } from '@/lib/errors';
import { isAutomationAuthorized } from '@/lib/security/request';
import { parseBody } from '@/lib/validation';
import { enrichThinDiscoveryLeads } from '@/lib/agents/buyerDiscovery';

/**
 * Admin backfill: enrich thin buyer-discovery leads (still `is_enriched=false`
 * with an `apify-discovery:` source) into full customs profiles by re-running
 * the ImportYeti `type=company` lookup on each name. Each lead is one
 * synchronous Apify run, so cap `limit` modestly and stay under the 300s ceiling.
 *
 * Auth: Bearer ${CRON_SECRET}.
 *
 *   curl -X POST https://denver-trades.vercel.app/api/admin/apify/enrich-buyers \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"orgId":"<uuid>","limit":5}'
 */
export const maxDuration = 300;

const EnrichSchema = z.object({
  orgId: z.string().uuid(),
  limit: z.number().int().min(1).max(8).optional(),
});

export async function POST(request: Request) {
  try {
    if (!isAutomationAuthorized(request)) {
      return NextResponse.json(
        { success: false, error: 'Admin authorization failed' },
        { status: 401 },
      );
    }

    const parsed = await parseBody(request, EnrichSchema);
    if (!parsed.ok) return parsed.response;
    const { orgId, limit } = parsed.data;

    const supabase = getSupabaseServiceClient();
    const result = await enrichThinDiscoveryLeads(supabase, orgId, limit ?? 5);

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    console.error('Admin enrich-buyers error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

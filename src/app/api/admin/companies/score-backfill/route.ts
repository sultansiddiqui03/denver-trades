import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServiceClient } from '@/lib/supabase/admin';
import { getErrorMessage } from '@/lib/errors';
import { isAutomationAuthorized } from '@/lib/security/request';
import { parseBody } from '@/lib/validation';
import { scoreOrgCompanies } from '@/lib/scoring/runScoring';

/**
 * Admin escape hatch: (re)compute buyer-fit scores across companies. Useful
 * after seeding customs metrics or changing the scoring weights.
 *
 * Auth: Bearer ${CRON_SECRET}.
 *
 *   curl -X POST https://denver-trades.vercel.app/api/admin/companies/score-backfill \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{}'    # body optional; omit orgId to score every org
 */
const Schema = z.object({
  orgId: z.string().uuid().optional(),
  limit: z.number().int().positive().max(2000).optional(),
});

export async function POST(request: Request) {
  try {
    if (!isAutomationAuthorized(request)) {
      return NextResponse.json(
        { success: false, error: 'Admin authorization failed' },
        { status: 401 },
      );
    }

    let orgId: string | undefined;
    let limit: number | undefined;
    const contentLength = request.headers.get('content-length');
    if (contentLength && Number(contentLength) > 0) {
      const parsed = await parseBody(request, Schema);
      if (!parsed.ok) return parsed.response;
      orgId = parsed.data.orgId;
      limit = parsed.data.limit;
    }

    const supabase = getSupabaseServiceClient();

    let orgIds: string[];
    if (orgId) {
      orgIds = [orgId];
    } else {
      const { data: orgs, error } = await supabase.from('organizations').select('id');
      if (error) throw new Error(`Failed to list organizations: ${error.message}`);
      orgIds = (orgs ?? []).map((o) => o.id);
    }

    let processed = 0;
    let scored = 0;
    for (const id of orgIds) {
      const result = await scoreOrgCompanies(supabase, id, { limit });
      processed += result.processed;
      scored += result.scored;
    }

    return NextResponse.json({ success: true, orgs: orgIds.length, processed, scored });
  } catch (error: unknown) {
    console.error('Buyer-fit score backfill error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

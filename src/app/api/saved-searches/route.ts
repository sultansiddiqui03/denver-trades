import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserContext } from '@/lib/auth/server';
import { getErrorMessage } from '@/lib/errors';
import { parseBody } from '@/lib/validation';
import { countSavedSearchMatches } from '@/lib/search/savedSearch';

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  query: z.string().trim().min(1).max(200),
  filters: z.record(z.string(), z.unknown()).optional(),
  alert_enabled: z.boolean().optional(),
});

/** List the org's saved searches (most recent first). */
export async function GET() {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;

    const { data, error } = await context.supabase
      .from('saved_searches')
      .select('id, name, query, filters, alert_enabled, last_result_count, created_at')
      .eq('org_id', context.orgId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    return NextResponse.json({ success: true, searches: data ?? [] });
  } catch (error: unknown) {
    console.error('GET /api/saved-searches error:', error);
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}

/** Save a search. Seeds last_result_count with the current match count so the
 *  alert cron can later detect *new* matches. */
export async function POST(request: Request) {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;

    const parsed = await parseBody(request, CreateSchema);
    if (!parsed.ok) return parsed.response;
    const { name, query, filters, alert_enabled } = parsed.data;
    const { orgId, supabase, user } = context;

    const baseline = await countSavedSearchMatches(supabase, orgId, query);

    const { data, error } = await supabase
      .from('saved_searches')
      .insert({
        org_id: orgId,
        user_id: user.id,
        name,
        query,
        filters: (filters ?? {}) as never,
        alert_enabled: alert_enabled ?? true,
        last_result_count: baseline,
      })
      .select('id, name, query, alert_enabled, last_result_count, created_at')
      .single();
    if (error) throw error;

    return NextResponse.json({ success: true, search: data });
  } catch (error: unknown) {
    console.error('POST /api/saved-searches error:', error);
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}

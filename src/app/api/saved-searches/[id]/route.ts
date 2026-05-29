import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserContext } from '@/lib/auth/server';
import { getErrorMessage } from '@/lib/errors';
import { parseBody } from '@/lib/validation';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const PatchSchema = z.object({
  alert_enabled: z.boolean(),
});

/** Toggle alerting on a saved search. */
export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;
    const { id } = await params;

    const parsed = await parseBody(request, PatchSchema);
    if (!parsed.ok) return parsed.response;

    const { data, error } = await context.supabase
      .from('saved_searches')
      .update({ alert_enabled: parsed.data.alert_enabled, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('org_id', context.orgId)
      .select('id, alert_enabled')
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    return NextResponse.json({ success: true, search: data });
  } catch (error: unknown) {
    console.error('PATCH /api/saved-searches/[id] error:', error);
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}

/** Delete a saved search. */
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;
    const { id } = await params;

    const { error } = await context.supabase
      .from('saved_searches')
      .delete()
      .eq('id', id)
      .eq('org_id', context.orgId);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('DELETE /api/saved-searches/[id] error:', error);
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}

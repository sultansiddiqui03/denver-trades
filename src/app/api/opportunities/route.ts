import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';
import { requireUserContext } from '@/lib/auth/server';

/** List the org's open opportunities, hottest first. */
export async function GET() {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;
    const { supabase, orgId } = context;

    const { data, error } = await supabase
      .from('opportunities')
      .select('*')
      .eq('org_id', orgId)
      .neq('status', 'dismissed')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true, opportunities: data ?? [] });
  } catch (error: unknown) {
    console.error('List opportunities error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

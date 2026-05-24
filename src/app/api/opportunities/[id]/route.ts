import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getErrorMessage } from '@/lib/errors';
import { requireUserContext } from '@/lib/auth/server';
import { parseBody } from '@/lib/validation';

const Schema = z.object({
  status: z.enum(['new', 'viewed', 'acted', 'dismissed']),
});

// Next 16: params is a Promise.
interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Update an opportunity's status (viewed / acted / dismissed). */
export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;
    const { id } = await params;

    const parsed = await parseBody(request, Schema);
    if (!parsed.ok) return parsed.response;

    const { data, error } = await context.supabase
      .from('opportunities')
      .update({ status: parsed.data.status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('org_id', context.orgId)
      .select('id, status')
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json({ success: false, error: 'Opportunity not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, opportunity: data });
  } catch (error: unknown) {
    console.error('Update opportunity error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

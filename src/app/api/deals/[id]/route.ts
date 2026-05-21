import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserContext } from '@/lib/auth/server';
import { getErrorMessage } from '@/lib/errors';
import { parseBody } from '@/lib/validation';
import { DEAL_STAGES } from '@/lib/pipeline/stages';
import type { TablesUpdate } from '@/lib/supabase/database.types';

type DealUpdate = TablesUpdate<'deals_pipeline'>;

const DEAL_ID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Body for PATCH /api/deals/[id]. Today we only persist `stage`, but the
 * shape is open so we can fold in notes/tags/value edits without inventing
 * a new endpoint.
 */
const PatchDealSchema = z
  .object({
    stage: z.enum(DEAL_STAGES).optional(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  });

/**
 * Update fields on a single deal row. Auth-scoped to the caller's org so a
 * crafted id from another tenant can't be mutated.
 */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;

    const { id } = await ctx.params;
    if (!DEAL_ID_PATTERN.test(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid deal id' },
        { status: 400 }
      );
    }

    const parsed = await parseBody(request, PatchDealSchema);
    if (!parsed.ok) return parsed.response;

    const { orgId, supabase } = context;
    const updates: DealUpdate = {};
    if (parsed.data.stage) updates.stage = parsed.data.stage;

    const { data, error } = await supabase
      .from('deals_pipeline')
      .update(updates)
      .eq('id', id)
      .eq('org_id', orgId)
      .select('id, stage, deal_code, updated_at')
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Deal not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, deal: data });
  } catch (error: unknown) {
    console.error('PATCH /api/deals/[id] error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

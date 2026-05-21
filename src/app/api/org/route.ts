import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserContext } from '@/lib/auth/server';
import { getErrorMessage } from '@/lib/errors';
import { parseBody } from '@/lib/validation';
import type { TablesUpdate } from '@/lib/supabase/database.types';

type OrgUpdate = TablesUpdate<'organizations'>;

/**
 * Same regex as the DB CHECK constraint
 * (`20260522120000_per_org_deal_code.sql`). We validate client-side so we
 * can return a friendly 400 instead of a generic 23514 unique-constraint
 * error from Postgres. The DB check still backs us up as the source of
 * truth — anything that passes here must also pass there.
 */
const DEAL_CODE_PREFIX_PATTERN = /^[A-Z0-9-]{2,12}$/;

const PatchOrgSchema = z
  .object({
    deal_code_prefix: z
      .string()
      .trim()
      .transform((v) => v.toUpperCase())
      .refine((v) => DEAL_CODE_PREFIX_PATTERN.test(v), {
        message:
          'deal_code_prefix must be 2-12 chars, uppercase letters, digits, or dashes only',
      })
      .optional(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined), {
    message: 'At least one field must be provided',
  });

/**
 * Update fields on the caller's own organization. Today only
 * `deal_code_prefix` is editable — drives the pipeline ID format
 * (`<PREFIX>-<YEAR>-<NNNNN>`) minted by `POST /api/deals`.
 *
 * Gated to `owner` role since prefix changes are observable across every
 * deal card in the org and accidentally clobbering them would be annoying
 * to undo (existing deal_code values are NOT renumbered).
 *
 * Out of scope: a UI surface for this. Backend only — the way Acme Spice
 * Co goes from `LEAD-OPP-2026-00001` to `ACME-2026-00001` today is by
 * curling this endpoint with their session cookie.
 */
export async function PATCH(request: Request) {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;

    const { orgId, profile, supabase } = context;

    if (profile.role !== 'owner') {
      return NextResponse.json(
        { success: false, error: 'Only the org owner can edit organization settings' },
        { status: 403 }
      );
    }

    const parsed = await parseBody(request, PatchOrgSchema);
    if (!parsed.ok) return parsed.response;

    const updates: OrgUpdate = {};
    if (parsed.data.deal_code_prefix !== undefined) {
      updates.deal_code_prefix = parsed.data.deal_code_prefix;
    }

    const { data, error } = await supabase
      .from('organizations')
      .update(updates)
      .eq('id', orgId)
      .select('id, name, slug, deal_code_prefix, updated_at')
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Organization not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, organization: data });
  } catch (error: unknown) {
    console.error('PATCH /api/org error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

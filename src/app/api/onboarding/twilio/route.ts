import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOnboardingContext } from '@/lib/auth/server';
import { getSupabaseServiceClient } from '@/lib/supabase/admin';
import { getErrorMessage } from '@/lib/errors';
import { parseBody } from '@/lib/validation';

const TwilioSchema = z.object({
  twilio_whatsapp_number: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((v) => (typeof v === 'string' && v.length === 0 ? null : v ?? null)),
});

/**
 * Normalize whatever the user typed into the canonical `whatsapp:+<digits>`
 * shape Twilio expects. Accepts:
 *   - `+14155238886` → `whatsapp:+14155238886`
 *   - `whatsapp:+14155238886` → returned as-is (after lower-case prefix)
 *   - ` 14155238886` / `14155238886` → `whatsapp:+14155238886`
 * Returns null if the input does not parse to a phone shape — caller should
 * treat that as a validation error.
 */
export function normalizeTwilioNumber(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Strip an existing `whatsapp:` prefix (case-insensitive) so the digit
  // check works the same either way.
  const withoutPrefix = trimmed.replace(/^whatsapp:/i, '').trim();
  const withPlus = withoutPrefix.startsWith('+') ? withoutPrefix : `+${withoutPrefix}`;

  // Must be a `+` followed by 8-15 digits (E.164-ish).
  if (!/^\+\d{8,15}$/.test(withPlus)) {
    return null;
  }

  return `whatsapp:${withPlus}`;
}

/**
 * Onboarding Step 2 — wire up the org's Twilio WhatsApp number for inbound
 * RFQ routing. Skippable (null body is allowed). Bumps `onboarding_step` to
 * 3 either way.
 */
export async function POST(request: Request) {
  try {
    const { context, response } = await requireOnboardingContext();
    if (!context) return response;

    const parsed = await parseBody(request, TwilioSchema);
    if (!parsed.ok) return parsed.response;

    const { user, profile } = context;
    const orgId = profile.org_id;

    if (!orgId) {
      return NextResponse.json(
        { success: false, error: 'Create an organization first (step 1)' },
        { status: 409 }
      );
    }

    let normalized: string | null = null;
    if (parsed.data.twilio_whatsapp_number) {
      normalized = normalizeTwilioNumber(parsed.data.twilio_whatsapp_number);
      if (!normalized) {
        return NextResponse.json(
          {
            success: false,
            error:
              'twilio_whatsapp_number must look like +14155238886 or whatsapp:+14155238886',
          },
          { status: 400 }
        );
      }
    }

    // We need service-role here because the row's RLS scopes by
    // `auth.uid()` membership — which the user satisfies, but Step 1 just
    // linked them so the session JWT may still cache the old (null) claims
    // until the next refresh. Going through service-role keeps the wizard
    // resilient to that race.
    const admin = getSupabaseServiceClient();

    const { error: orgError } = await admin
      .from('organizations')
      .update({ twilio_whatsapp_number: normalized })
      .eq('id', orgId);

    if (orgError) {
      // The DB has a unique index on twilio_whatsapp_number (where not
      // null). Surface a friendly conflict on a duplicate number.
      if (orgError.code === '23505') {
        return NextResponse.json(
          {
            success: false,
            error:
              'That Twilio number is already linked to another organization. Use a different number or skip for now.',
          },
          { status: 409 }
        );
      }
      throw orgError;
    }

    const { error: userError } = await admin
      .from('users')
      .update({ onboarding_step: 3 })
      .eq('id', user.id);

    if (userError) throw userError;

    return NextResponse.json({
      success: true,
      twilio_whatsapp_number: normalized,
    });
  } catch (error: unknown) {
    console.error('POST /api/onboarding/twilio error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { requireOnboardingContext } from '@/lib/auth/server';
import { getSupabaseServiceClient } from '@/lib/supabase/admin';
import { getErrorMessage } from '@/lib/errors';

/**
 * Skip-sample-data finish path. Same effect as the success branch of
 * `/api/onboarding/seed` but without the seed inserts: marks the org's
 * `onboarding_complete = true` and clears the user's `onboarding_step`.
 */
export async function POST() {
  try {
    const { context, response } = await requireOnboardingContext();
    if (!context) return response;

    const { user, profile } = context;
    const orgId = profile.org_id;

    if (!orgId) {
      return NextResponse.json(
        { success: false, error: 'Create an organization first (step 1)' },
        { status: 409 }
      );
    }

    const admin = getSupabaseServiceClient();

    const { error: orgErr } = await admin
      .from('organizations')
      .update({ onboarding_complete: true })
      .eq('id', orgId);
    if (orgErr) throw orgErr;

    const { error: userErr } = await admin
      .from('users')
      .update({ onboarding_step: null })
      .eq('id', user.id);
    if (userErr) throw userErr;

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('POST /api/onboarding/complete error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

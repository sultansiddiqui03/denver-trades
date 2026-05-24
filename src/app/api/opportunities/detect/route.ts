import { NextResponse } from 'next/server';
import { getErrorMessage } from '@/lib/errors';
import { requireUserContext } from '@/lib/auth/server';
import { detectAndStoreForOrg } from '@/lib/opportunities/runDetect';

/**
 * Manual rescan: re-run opportunity detection across the org's demand signals +
 * companies. Real-time detection happens at ingest, but this lets a user force
 * a sweep (e.g. after onboarding or a bulk import).
 */
export async function POST() {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;
    const created = await detectAndStoreForOrg(context.supabase, context.orgId);
    return NextResponse.json({ success: true, created });
  } catch (error: unknown) {
    console.error('Detect opportunities error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

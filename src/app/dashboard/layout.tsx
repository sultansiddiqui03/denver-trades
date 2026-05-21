import React from 'react';
import { redirect } from 'next/navigation';
import { getOnboardingContext } from '@/lib/auth/server';
import { getSupabaseServiceClient } from '@/lib/supabase/admin';
import DashboardShell from './DashboardShell';

/**
 * Server-component gate for the authenticated app. Resolves the signed-in
 * user, then routes them based on onboarding state:
 *
 *   - no session                              → `/`
 *   - signed in, no `users.org_id`            → `/onboarding`
 *   - signed in, has org but `onboarding_complete` is false
 *                                              → `/onboarding`
 *   - signed in + org complete                → render the dashboard chrome
 *
 * Kept in the Server Component layer (not the proxy) so it can read user
 * context cleanly via the existing auth helpers. The proxy still handles
 * Supabase session refresh and pure auth redirects.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await getOnboardingContext();

  if (!context) {
    redirect('/');
  }

  const { profile } = context;

  if (!profile.org_id) {
    redirect('/onboarding');
  }

  const admin = getSupabaseServiceClient();
  const { data: org } = await admin
    .from('organizations')
    .select('onboarding_complete')
    .eq('id', profile.org_id)
    .maybeSingle();

  // Treat a missing row defensively — if the user's org pointer dangles
  // (FK should prevent this but belt-and-braces), force them back through
  // onboarding. Treat `null` onboarding_complete as incomplete; only an
  // explicit `true` lets them in.
  if (!org || org.onboarding_complete !== true) {
    redirect('/onboarding');
  }

  return <DashboardShell>{children}</DashboardShell>;
}

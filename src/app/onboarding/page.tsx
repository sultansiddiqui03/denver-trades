import { redirect } from 'next/navigation';
import { getOnboardingContext } from '@/lib/auth/server';
import { getSupabaseServiceClient } from '@/lib/supabase/admin';
import OnboardingWizard, { type WizardInitialState } from './OnboardingWizard';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

/**
 * Server-component shell for the onboarding wizard. Decides whether to:
 *  - bounce unauthenticated visitors to the landing page,
 *  - bounce users who have already finished onboarding to the dashboard,
 *  - or hand off to the client wizard with the right starting step.
 */
export default async function OnboardingPage() {
  const context = await getOnboardingContext();

  if (!context) {
    redirect('/');
  }

  const { user, profile } = context;

  // If they already have an org AND it's marked complete, they don't belong
  // here. Send them home.
  let orgName: string | null = null;
  if (profile.org_id) {
    const admin = getSupabaseServiceClient();
    const { data: org } = await admin
      .from('organizations')
      .select('name, onboarding_complete, twilio_whatsapp_number')
      .eq('id', profile.org_id)
      .maybeSingle();

    if (org?.onboarding_complete) {
      redirect('/dashboard');
    }

    orgName = org?.name ?? null;
  }

  // Pick the right step to land on. `onboarding_step` is the source of truth
  // for resume; fall back to 1 if missing.
  const initialStep = Math.min(3, Math.max(1, profile.onboarding_step ?? 1)) as 1 | 2 | 3;

  const initial: WizardInitialState = {
    initialStep: profile.org_id ? initialStep : 1,
    userName: profile.full_name ?? user.email?.split('@')[0] ?? 'there',
    existingOrgName: orgName,
  };

  return (
    <div className={`${styles.page} dot-grid`}>
      <div className={styles.shell}>
        <header className={styles.brandRow}>
          <div className={styles.logoIcon}>D</div>
          <span className={styles.logoText}>
            <span className={styles.logoAccent}>Denver</span>
            <span className={styles.logoWhite}>Trades</span>
          </span>
        </header>

        <OnboardingWizard initial={initial} />
      </div>
    </div>
  );
}

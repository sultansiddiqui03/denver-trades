import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/auth/server';
import type { Opportunity } from './OpportunitiesInbox';
import OpportunitiesInbox from './OpportunitiesInbox';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function OpportunitiesPage() {
  const context = await getUserContext();
  if (!context) redirect('/');

  const { orgId, supabase } = context;

  const { data } = await supabase
    .from('opportunities')
    .select('*')
    .eq('org_id', orgId)
    .neq('status', 'dismissed')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div className={`${styles.page} fade-in`}>
      <OpportunitiesInbox
        initialOpportunities={(data ?? []) as Opportunity[]}
        orgId={orgId}
      />
    </div>
  );
}

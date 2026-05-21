import 'server-only';
import type { UserContext } from '@/lib/auth/server';

export interface ActivityItem {
  id: string;
  type: 'agent' | 'deal' | 'document' | 'outreach' | 'price';
  title: string;
  description: string;
  timestamp: string;
  color: 'lime' | 'green' | 'blue' | 'purple' | 'yellow';
}

/**
 * Shared activity-feed aggregation used by both `/api/dashboard/activity`
 * and the Server-Component rendered `/dashboard` home page.
 */
export async function fetchActivityFeed(
  context: Pick<UserContext, 'orgId' | 'supabase'>
): Promise<ActivityItem[]> {
  const { orgId, supabase } = context;
  const activities: ActivityItem[] = [];

  // 1. Recent agent runs
  const { data: agentRuns } = await supabase
    .from('agent_runs')
    .select('*')
    .eq('org_id', orgId)
    .order('started_at', { ascending: false })
    .limit(5);

  if (agentRuns) {
    for (const run of agentRuns) {
      const ts = run.completed_at ?? run.started_at;
      if (!ts) continue;
      activities.push({
        id: `agent-${run.id}`,
        type: 'agent',
        title: run.agent_name,
        description:
          run.status === 'Success'
            ? `Processed ${run.records_processed ?? 0} records, created ${run.records_created ?? 0} new leads.`
            : run.status === 'Running'
              ? 'Currently executing in the background...'
              : `Run failed: ${run.error_log || 'Unknown error'}`,
        timestamp: ts,
        color:
          run.status === 'Success' ? 'lime' : run.status === 'Running' ? 'blue' : 'purple',
      });
    }
  }

  // 2. Recent deals activity
  const { data: recentDeals } = await supabase
    .from('deals_pipeline')
    .select('id, title, stage, product, value_usd, updated_at')
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false })
    .limit(3);

  if (recentDeals) {
    for (const deal of recentDeals) {
      if (!deal.updated_at) continue;
      const valueStr = deal.value_usd
        ? ` worth $${Number(deal.value_usd).toLocaleString()}`
        : '';
      activities.push({
        id: `deal-${deal.id}`,
        type: 'deal',
        title: deal.title,
        description: `Deal${valueStr} moved to "${deal.stage ?? 'unknown'}" stage.`,
        timestamp: deal.updated_at,
        color: 'green',
      });
    }
  }

  // 3. Recent document audits
  const { data: recentAudits } = await supabase
    .from('document_audits')
    .select('id, deal_id, status, summary, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(2);

  if (recentAudits) {
    for (const audit of recentAudits) {
      if (!audit.created_at) continue;
      const statusLabel = (audit.status ?? 'pending').toLowerCase();
      activities.push({
        id: `doc-${audit.id}`,
        type: 'document',
        title: 'Document Compliance Audit',
        description:
          audit.status === 'Complete'
            ? audit.summary || 'Audit completed successfully.'
            : `Audit ${statusLabel}.`,
        timestamp: audit.created_at,
        color: audit.status === 'Complete' ? 'green' : 'yellow',
      });
    }
  }

  // Sort all activities by timestamp descending
  activities.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return activities.slice(0, 8);
}

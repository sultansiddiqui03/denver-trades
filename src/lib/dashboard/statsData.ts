import 'server-only';
import type { UserContext } from '@/lib/auth/server';

export interface DashboardStats {
  totalCompanies: number;
  activeDeals: number;
  pipelineValue: string;
  enrichedLeads: number;
  /** New rows in the last 7 days — drives the trend line on each stat card. */
  newCompanies7d: number;
  newDeals7d: number;
  newEnriched7d: number;
  /** True when the org has effectively no data yet (drives the first-run UI). */
  isEmpty: boolean;
}

/**
 * Shared dashboard-stats aggregation used by both `/api/dashboard/stats`
 * and the Server-Component rendered `/dashboard` home page.
 */
export async function fetchDashboardStats(
  context: Pick<UserContext, 'orgId' | 'supabase'>
): Promise<DashboardStats> {
  const { orgId, supabase } = context;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    companiesRes,
    dealsRes,
    enrichedRes,
    pipelineValueRes,
    newCompaniesRes,
    newDealsRes,
    newEnrichedRes,
  ] = await Promise.all([
    supabase
      .from('companies')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId),
    supabase
      .from('deals_pipeline')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId),
    supabase
      .from('companies')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('is_enriched', true),
    supabase.from('deals_pipeline').select('value_usd').eq('org_id', orgId),
    supabase
      .from('companies')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', weekAgo),
    supabase
      .from('deals_pipeline')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', weekAgo),
    supabase
      .from('companies')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('enriched_at', weekAgo),
  ]);

  const totalCompanies = companiesRes.count ?? 0;
  const activeDeals = dealsRes.count ?? 0;
  const enrichedLeads = enrichedRes.count ?? 0;
  const newCompanies7d = newCompaniesRes.count ?? 0;
  const newDeals7d = newDealsRes.count ?? 0;
  const newEnriched7d = newEnrichedRes.count ?? 0;

  const pipelineValue = (pipelineValueRes.data || []).reduce(
    (sum, deal) => sum + (Number(deal.value_usd) || 0),
    0
  );

  let formattedValue: string;
  if (pipelineValue >= 1_000_000) {
    formattedValue = `$${(pipelineValue / 1_000_000).toFixed(2)}M`;
  } else if (pipelineValue >= 1_000) {
    formattedValue = `$${(pipelineValue / 1_000).toFixed(1)}K`;
  } else {
    formattedValue = `$${pipelineValue.toFixed(0)}`;
  }

  return {
    totalCompanies,
    activeDeals,
    pipelineValue: formattedValue,
    enrichedLeads,
    newCompanies7d,
    newDeals7d,
    newEnriched7d,
    isEmpty: totalCompanies === 0 && activeDeals === 0,
  };
}

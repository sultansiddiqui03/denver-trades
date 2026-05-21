import 'server-only';
import type { UserContext } from '@/lib/auth/server';

export interface DashboardStats {
  totalCompanies: number;
  activeDeals: number;
  pipelineValue: string;
  enrichedLeads: number;
}

/**
 * Shared dashboard-stats aggregation used by both `/api/dashboard/stats`
 * and the Server-Component rendered `/dashboard` home page.
 */
export async function fetchDashboardStats(
  context: Pick<UserContext, 'orgId' | 'supabase'>
): Promise<DashboardStats> {
  const { orgId, supabase } = context;

  const [companiesRes, dealsRes, enrichedRes, pipelineValueRes] = await Promise.all([
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
  ]);

  const totalCompanies = companiesRes.count ?? 0;
  const activeDeals = dealsRes.count ?? 0;
  const enrichedLeads = enrichedRes.count ?? 0;

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
  };
}

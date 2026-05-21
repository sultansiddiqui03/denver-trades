import 'server-only';
import type { UserContext } from '@/lib/auth/server';

interface DealStageRow {
  stage: string | null;
}

interface CompanyCountryRow {
  hq_country: string | null;
}

interface AgentRunStatusRow {
  status: string | null;
}

export interface AnalyticsData {
  dealsByStage: { stage: string; count: number }[];
  companiesByCountry: { country: string; count: number }[];
  agentSuccessRate: { total: number; successful: number; rate: number };
  totalPipelineValue: number;
  totalCompanies: number;
  enrichedCompanies: number;
}

/**
 * Shared analytics aggregation used by both `/api/dashboard/analytics`
 * and the Server-Component rendered `/dashboard/analytics` page.
 */
export async function fetchAnalyticsData(
  context: Pick<UserContext, 'orgId' | 'supabase'>
): Promise<AnalyticsData> {
  const { orgId, supabase } = context;

  const [dealsRes, companiesRes, agentRunsRes, pipelineRes, totalCoRes, enrichedCoRes] =
    await Promise.all([
      supabase.from('deals_pipeline').select('stage').eq('org_id', orgId),
      supabase.from('companies').select('hq_country').eq('org_id', orgId),
      supabase.from('agent_runs').select('status').eq('org_id', orgId),
      supabase.from('deals_pipeline').select('value_usd').eq('org_id', orgId),
      supabase
        .from('companies')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId),
      supabase
        .from('companies')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('is_enriched', true),
    ]);

  // Deals by stage
  const stageCounts: Record<string, number> = {};
  ((dealsRes.data || []) as DealStageRow[]).forEach((d) => {
    const s = d.stage || 'Discovery';
    stageCounts[s] = (stageCounts[s] || 0) + 1;
  });
  const dealsByStage = Object.entries(stageCounts).map(([stage, count]) => ({
    stage,
    count,
  }));

  // Companies by country
  const countryCounts: Record<string, number> = {};
  ((companiesRes.data || []) as CompanyCountryRow[]).forEach((c) => {
    const country = c.hq_country || 'Unknown';
    countryCounts[country] = (countryCounts[country] || 0) + 1;
  });
  const companiesByCountry = Object.entries(countryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([country, count]) => ({ country, count }));

  // Agent success rate
  const runs = (agentRunsRes.data || []) as AgentRunStatusRow[];
  const total = runs.length;
  const successful = runs.filter((r) => r.status === 'Success').length;
  const rate = total > 0 ? Math.round((successful / total) * 100) : 0;

  // Pipeline value
  const totalPipelineValue = (pipelineRes.data || []).reduce(
    (sum, d) => sum + (Number(d.value_usd) || 0),
    0
  );

  return {
    dealsByStage,
    companiesByCountry,
    agentSuccessRate: { total, successful, rate },
    totalPipelineValue,
    totalCompanies: totalCoRes.count ?? 0,
    enrichedCompanies: enrichedCoRes.count ?? 0,
  };
}

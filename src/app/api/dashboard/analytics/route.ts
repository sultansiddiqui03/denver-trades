import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  try {
    const orgId = 'd3b07384-d113-4e4e-9c8e-5b123d456789';

    const [dealsRes, companiesRes, agentRunsRes, pipelineRes, totalCoRes, enrichedCoRes] = await Promise.all([
      supabase.from('deals_pipeline').select('stage').eq('org_id', orgId),
      supabase.from('companies').select('hq_country').eq('org_id', orgId),
      supabase.from('agent_runs').select('status').eq('org_id', orgId),
      supabase.from('deals_pipeline').select('value_usd').eq('org_id', orgId),
      supabase.from('companies').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
      supabase.from('companies').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('is_enriched', true),
    ]);

    // Deals by stage
    const stageCounts: Record<string, number> = {};
    (dealsRes.data || []).forEach((d: any) => {
      const s = d.stage || 'Discovery';
      stageCounts[s] = (stageCounts[s] || 0) + 1;
    });
    const dealsByStage = Object.entries(stageCounts).map(([stage, count]) => ({ stage, count }));

    // Companies by country
    const countryCounts: Record<string, number> = {};
    (companiesRes.data || []).forEach((c: any) => {
      const country = c.hq_country || 'Unknown';
      countryCounts[country] = (countryCounts[country] || 0) + 1;
    });
    const companiesByCountry = Object.entries(countryCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([country, count]) => ({ country, count }));

    // Agent success rate
    const runs = agentRunsRes.data || [];
    const total = runs.length;
    const successful = runs.filter((r: any) => r.status === 'Success').length;
    const rate = total > 0 ? Math.round((successful / total) * 100) : 0;

    // Pipeline value
    const totalPipelineValue = (pipelineRes.data || []).reduce(
      (sum, d) => sum + (Number(d.value_usd) || 0), 0
    );

    return NextResponse.json({
      success: true,
      analytics: {
        dealsByStage,
        companiesByCountry,
        agentSuccessRate: { total, successful, rate },
        totalPipelineValue,
        totalCompanies: totalCoRes.count ?? 0,
        enrichedCompanies: enrichedCoRes.count ?? 0,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

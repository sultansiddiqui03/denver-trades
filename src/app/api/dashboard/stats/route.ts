import { NextResponse } from 'next/server';
import { requireUserContext } from '@/lib/auth/server';
import { getErrorMessage } from '@/lib/errors';

export async function GET() {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;

    const { orgId, supabase } = context;

    // Run all counts in parallel
    const [
      companiesRes,
      dealsRes,
      enrichedRes,
      pipelineValueRes,
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
      supabase
        .from('deals_pipeline')
        .select('value_usd')
        .eq('org_id', orgId),
    ]);

    const totalCompanies = companiesRes.count ?? 0;
    const activeDeals = dealsRes.count ?? 0;
    const enrichedLeads = enrichedRes.count ?? 0;

    // Sum pipeline value
    const pipelineValue = (pipelineValueRes.data || []).reduce(
      (sum, deal) => sum + (Number(deal.value_usd) || 0),
      0
    );

    // Format pipeline value
    let formattedValue: string;
    if (pipelineValue >= 1_000_000) {
      formattedValue = `$${(pipelineValue / 1_000_000).toFixed(2)}M`;
    } else if (pipelineValue >= 1_000) {
      formattedValue = `$${(pipelineValue / 1_000).toFixed(1)}K`;
    } else {
      formattedValue = `$${pipelineValue.toFixed(0)}`;
    }

    return NextResponse.json({
      success: true,
      stats: {
        totalCompanies,
        activeDeals,
        pipelineValue: formattedValue,
        enrichedLeads,
      },
    });
  } catch (error: unknown) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

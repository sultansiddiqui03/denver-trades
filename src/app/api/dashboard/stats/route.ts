import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET() {
  try {
    const orgId = 'd3b07384-d113-4e4e-9c8e-5b123d456789';

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
  } catch (error: any) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

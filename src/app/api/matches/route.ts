import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getErrorMessage } from '@/lib/errors';
import { requireUserContext } from '@/lib/auth/server';
import { parseBody } from '@/lib/validation';
import { scoreBuyerFit, buyerFitTier } from '@/lib/scoring/buyerFit';
import type { BuyerFitCompany } from '@/lib/scoring/buyerFit';

const Schema = z.object({
  commodity: z.string().min(1).max(100).optional(),
  demandId: z.string().uuid().optional(),
  limit: z.number().int().positive().max(100).optional(),
});

export async function POST(request: Request) {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;

    const { supabase, orgId } = context;

    let commodity: string | undefined;
    let limit = 20;

    const contentLength = request.headers.get('content-length');
    if (contentLength && Number(contentLength) > 0) {
      const parsed = await parseBody(request, Schema);
      if (!parsed.ok) return parsed.response;
      commodity = parsed.data.commodity;
      limit = parsed.data.limit ?? 20;

      if (parsed.data.demandId) {
        const { data: thread } = await supabase
          .from('outreach_threads')
          .select('extracted_demand')
          .eq('id', parsed.data.demandId)
          .eq('org_id', orgId)
          .maybeSingle();

        const demand = thread?.extracted_demand as Record<string, unknown> | null;
        if (demand?.product && typeof demand.product === 'string') {
          commodity = demand.product;
        }
      }
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('commodities, target_markets')
      .eq('id', orgId)
      .single();

    const orgCommodities: string[] = (org?.commodities ?? []).filter(Boolean);
    const orgMarkets: string[] = (org?.target_markets ?? []).filter(Boolean);

    const effectiveCommodity = commodity ?? orgCommodities[0] ?? null;

    const { data: companies } = await supabase
      .from('companies')
      .select(
        'id, name, type, hq_country, hq_city, products_dealt, origin_countries, destination_countries, total_shipments, last_shipment_date, hs_codes'
      )
      .eq('org_id', orgId)
      .or('total_shipments.not.is.null,buyer_fit_score.not.is.null')
      .limit(500);

    if (!companies || companies.length === 0) {
      return NextResponse.json({
        success: true,
        commodity: effectiveCommodity,
        results: [],
        orgCommodities,
      });
    }

    const scoreOrg = {
      commodities: effectiveCommodity ? [effectiveCommodity] : orgCommodities,
      target_markets: orgMarkets,
    };

    const scored = companies.map((c) => {
      const company: BuyerFitCompany = {
        type: c.type,
        products_dealt: c.products_dealt,
        origin_countries: c.origin_countries,
        destination_countries: c.destination_countries,
        hq_country: c.hq_country,
        total_shipments: c.total_shipments,
        last_shipment_date: c.last_shipment_date,
        hs_codes: c.hs_codes,
      };
      const { score, reasons } = scoreBuyerFit(company, scoreOrg);
      return {
        id: c.id,
        name: c.name,
        type: c.type,
        hq_country: c.hq_country,
        hq_city: c.hq_city,
        total_shipments: c.total_shipments,
        last_shipment_date: c.last_shipment_date,
        hs_codes: c.hs_codes,
        products_dealt: c.products_dealt,
        score,
        tier: buyerFitTier(score),
        reasons,
      };
    });

    scored.sort((a, b) => b.score - a.score);

    return NextResponse.json({
      success: true,
      commodity: effectiveCommodity,
      results: scored.slice(0, limit),
      orgCommodities,
    });
  } catch (error: unknown) {
    console.error('Buyer-match error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { requireUserContext } from '@/lib/auth/server';
import { getErrorMessage } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export interface MonthlyVolumePoint {
  month: string;
  total: number;
  byProduct: Record<string, number>;
}

export interface GrowingImporter {
  id: string;
  name: string;
  growthPct: number;
  recentVolumeMt: number;
}

export interface OriginShare {
  country: string;
  volumeMt: number;
  shipmentCount: number;
}

export interface PriceSeries {
  commodity: string;
  series: { date: string; price: number }[];
}

export interface MarketHeadline {
  totalShipments: number;
  totalValueUsd: number;
  distinctBuyers: number;
  distinctSuppliers: number;
}

export interface MarketData {
  monthlyVolume: MonthlyVolumePoint[];
  topGrowingImporters: GrowingImporter[];
  originShare: OriginShare[];
  priceTrends: PriceSeries[];
  headline: MarketHeadline;
}

function shipmentVol(row: { quantity_mt: number | null; weight_kg: number | null }): number {
  if (row.quantity_mt != null && row.quantity_mt > 0) return row.quantity_mt;
  if (row.weight_kg != null && row.weight_kg > 0) return row.weight_kg / 1000;
  return 1;
}

function toYYYYMM(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export async function GET() {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;

    const { orgId, supabase } = context;

    const [shipmentsRes, companiesRes, pricesRes, orgRes] = await Promise.all([
      supabase
        .from('shipments')
        .select(
          'id, product, origin_country, company_id, quantity_mt, weight_kg, value_usd, shipment_date, supplier_name'
        )
        .eq('org_id', orgId)
        .not('shipment_date', 'is', null),
      supabase
        .from('companies')
        .select('id, name')
        .eq('org_id', orgId),
      supabase
        .from('commodity_prices')
        .select('commodity, price_usd, recorded_at')
        .not('recorded_at', 'is', null)
        .order('recorded_at', { ascending: true }),
      supabase
        .from('organizations')
        .select('commodities')
        .eq('id', orgId)
        .single(),
    ]);

    const shipments = shipmentsRes.data ?? [];
    const companies = companiesRes.data ?? [];
    const prices = pricesRes.data ?? [];
    const orgCommodities: string[] = orgRes.data?.commodities ?? [];

    const companyMap: Record<string, string> = {};
    for (const c of companies) {
      companyMap[c.id] = c.name;
    }

    // --- Headline ---
    const totalShipments = shipments.length;
    const totalValueUsd = shipments.reduce((s, r) => s + (r.value_usd ?? 0), 0);
    const distinctBuyers = new Set(shipments.map((r) => r.company_id).filter(Boolean)).size;
    const distinctSuppliers = new Set(
      shipments.map((r) => r.supplier_name).filter(Boolean)
    ).size;

    // --- Monthly volume — last 18 months, top 4 products ---
    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - 18);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const recentShipments = shipments.filter(
      (r) => r.shipment_date != null && r.shipment_date >= cutoffStr
    );

    // Product totals across all time to pick top 4
    const productTotals: Record<string, number> = {};
    for (const r of recentShipments) {
      const p = r.product || 'Other';
      productTotals[p] = (productTotals[p] || 0) + shipmentVol(r);
    }
    const top4Products = Object.entries(productTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([p]) => p);

    const monthMap: Record<string, MonthlyVolumePoint> = {};
    for (const r of recentShipments) {
      const m = toYYYYMM(r.shipment_date!);
      if (!monthMap[m]) {
        monthMap[m] = { month: m, total: 0, byProduct: {} };
      }
      const vol = shipmentVol(r);
      monthMap[m].total += vol;
      const bucket = top4Products.includes(r.product) ? r.product : 'Other';
      monthMap[m].byProduct[bucket] = (monthMap[m].byProduct[bucket] || 0) + vol;
    }
    const monthlyVolume = Object.values(monthMap).sort((a, b) =>
      a.month.localeCompare(b.month)
    );

    // --- Top growing importers ---
    // Split 18m window into two 9m halves; rank by growth
    const midpoint = new Date(now);
    midpoint.setMonth(midpoint.getMonth() - 9);
    const midStr = midpoint.toISOString().slice(0, 10);

    const companyRecent: Record<string, number> = {};
    const companyPrior: Record<string, number> = {};
    for (const r of recentShipments) {
      if (!r.company_id) continue;
      const vol = shipmentVol(r);
      if (r.shipment_date! >= midStr) {
        companyRecent[r.company_id] = (companyRecent[r.company_id] || 0) + vol;
      } else {
        companyPrior[r.company_id] = (companyPrior[r.company_id] || 0) + vol;
      }
    }

    const growthEntries: GrowingImporter[] = [];
    for (const [id, recent] of Object.entries(companyRecent)) {
      const prior = companyPrior[id] || 0;
      const growthPct =
        prior > 0 ? Math.round(((recent - prior) / prior) * 100) : (recent > 0 ? 100 : 0);
      growthEntries.push({
        id,
        name: companyMap[id] || id,
        growthPct,
        recentVolumeMt: Math.round(recent * 10) / 10,
      });
    }
    const topGrowingImporters = growthEntries
      .sort((a, b) => b.growthPct - a.growthPct)
      .slice(0, 6);

    // --- Origin share ---
    const originMap: Record<string, { volumeMt: number; count: number }> = {};
    for (const r of shipments) {
      const c = r.origin_country || 'Unknown';
      if (!originMap[c]) originMap[c] = { volumeMt: 0, count: 0 };
      originMap[c].volumeMt += shipmentVol(r);
      originMap[c].count += 1;
    }
    const originShare = Object.entries(originMap)
      .sort((a, b) => b[1].volumeMt - a[1].volumeMt)
      .slice(0, 8)
      .map(([country, { volumeMt, count }]) => ({
        country,
        volumeMt: Math.round(volumeMt * 10) / 10,
        shipmentCount: count,
      }));

    // --- Price trends — match org commodities (case-insensitive substring) ---
    const commodityGroups: Record<string, { date: string; price: number }[]> = {};
    for (const p of prices) {
      if (!p.recorded_at) continue;
      const name = p.commodity;
      if (!commodityGroups[name]) commodityGroups[name] = [];
      commodityGroups[name].push({
        date: p.recorded_at.slice(0, 10),
        price: p.price_usd,
      });
    }

    const allCommodities = Object.keys(commodityGroups);
    let matchedCommodities: string[] = [];
    if (orgCommodities.length > 0) {
      for (const oc of orgCommodities) {
        const ocLower = oc.toLowerCase();
        const match = allCommodities.find(
          (c) =>
            c.toLowerCase().includes(ocLower) || ocLower.includes(c.toLowerCase())
        );
        if (match && !matchedCommodities.includes(match)) {
          matchedCommodities.push(match);
        }
      }
    }
    if (matchedCommodities.length === 0) {
      matchedCommodities = allCommodities.slice(0, 5);
    }

    const priceTrends: PriceSeries[] = matchedCommodities.map((commodity) => ({
      commodity,
      series: (commodityGroups[commodity] || []).sort((a, b) =>
        a.date.localeCompare(b.date)
      ),
    }));

    const data: MarketData = {
      monthlyVolume,
      topGrowingImporters,
      originShare,
      priceTrends,
      headline: { totalShipments, totalValueUsd, distinctBuyers, distinctSuppliers },
    };

    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

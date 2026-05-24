import { NextResponse } from 'next/server';
import { requireUserContext } from '@/lib/auth/server';
import { getErrorMessage } from '@/lib/errors';
import type { CompanyType } from '@/lib/intent';
import type { SourcingSignal } from '@/lib/signals/supplierShift';

export interface RequirementRow {
  product: string;
  destination: string;
  ports: string[];
  buyerCount: number;
  shipmentCount: number;
  totalVolumeMt: number;
  totalValueUsd: number;
  topBuyers: { id: string; name: string }[];
}

export interface ShiftingRow {
  id: string;
  name: string;
  type: CompanyType | null;
  hq_country: string | null;
  buyer_fit_score: number | null;
  sourcing_signal: SourcingSignal | null;
  products_dealt: string[] | null;
}

export async function GET() {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;

    const { supabase, orgId } = context;

    // Query 1: shipments grouped by product + destination_country in JS
    const { data: shipmentRows, error: shipErr } = await supabase
      .from('shipments')
      .select('id, product, destination_country, port_discharge, quantity_mt, value_usd, company_id')
      .eq('org_id', orgId);

    if (shipErr) throw shipErr;

    // Query 2: company name lookup for buyer names
    const { data: companyRows, error: compErr } = await supabase
      .from('companies')
      .select('id, name')
      .eq('org_id', orgId);

    if (compErr) throw compErr;

    const companyMap = new Map<string, string>(
      (companyRows ?? []).map((c) => [c.id, c.name])
    );

    // Aggregate requirements: (product, destination_country) → stats
    interface AggBucket {
      product: string;
      destination: string;
      portSet: Set<string>;
      buyerSet: Set<string>;
      shipmentCount: number;
      totalVolumeMt: number;
      totalValueUsd: number;
    }
    const buckets = new Map<string, AggBucket>();

    for (const s of shipmentRows ?? []) {
      const product = (s.product ?? '').trim();
      const dest = (s.destination_country ?? 'Unknown').trim();
      if (!product) continue;
      const key = `${product}|||${dest}`;
      let b = buckets.get(key);
      if (!b) {
        b = {
          product,
          destination: dest,
          portSet: new Set(),
          buyerSet: new Set(),
          shipmentCount: 0,
          totalVolumeMt: 0,
          totalValueUsd: 0,
        };
        buckets.set(key, b);
      }
      b.shipmentCount += 1;
      b.totalVolumeMt += s.quantity_mt ?? 0;
      b.totalValueUsd += s.value_usd ?? 0;
      if (s.port_discharge) b.portSet.add(s.port_discharge);
      if (s.company_id) b.buyerSet.add(s.company_id);
    }

    const requirements: RequirementRow[] = Array.from(buckets.values())
      .map((b) => {
        const topBuyerIds = Array.from(b.buyerSet).slice(0, 4);
        return {
          product: b.product,
          destination: b.destination,
          ports: Array.from(b.portSet).filter(Boolean),
          buyerCount: b.buyerSet.size,
          shipmentCount: b.shipmentCount,
          totalVolumeMt: Math.round(b.totalVolumeMt * 10) / 10,
          totalValueUsd: Math.round(b.totalValueUsd),
          topBuyers: topBuyerIds
            .filter((id) => companyMap.has(id))
            .map((id) => ({ id, name: companyMap.get(id)! })),
        };
      })
      .sort((a, b) => {
        if (b.buyerCount !== a.buyerCount) return b.buyerCount - a.buyerCount;
        return b.totalVolumeMt - a.totalVolumeMt;
      })
      .slice(0, 20);

    // Query 3: companies with switching/declining sourcing signals
    const { data: shiftingData, error: shiftErr } = await supabase
      .from('companies')
      .select('id, name, type, hq_country, buyer_fit_score, sourcing_signal, products_dealt')
      .eq('org_id', orgId)
      .in('sourcing_signal->>status', ['switching', 'declining']);

    if (shiftErr) throw shiftErr;

    const shifting: ShiftingRow[] = ((shiftingData ?? []) as ShiftingRow[]).sort((a, b) => {
      const statusOrder = (s: ShiftingRow) =>
        (s.sourcing_signal?.status === 'switching' ? 0 : 1);
      const intentOrder = (s: ShiftingRow) => {
        const i = s.sourcing_signal?.intent;
        return i === 'high' ? 0 : i === 'medium' ? 1 : 2;
      };
      const so = statusOrder(a) - statusOrder(b);
      if (so !== 0) return so;
      const io = intentOrder(a) - intentOrder(b);
      if (io !== 0) return io;
      return (b.buyer_fit_score ?? 0) - (a.buyer_fit_score ?? 0);
    });

    return NextResponse.json({ success: true, requirements, shifting });
  } catch (error: unknown) {
    console.error('Radar API error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

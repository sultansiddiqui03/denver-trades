import { NextResponse } from 'next/server';
import { requireUserContext } from '@/lib/auth/server';
import { getErrorMessage } from '@/lib/errors';
import type { Json } from '@/lib/supabase/database.types';

export const dynamic = 'force-dynamic';

export interface ContractEvent {
  type: 'contract';
  id: string;
  at: string;
  companyId: string | null;
  companyName: string;
  product: string;
  quantityMt: number | null;
  supplier: string | null;
  origin: string | null;
  destination: string | null;
  valueUsd: number | null;
}

export interface DemandEvent {
  type: 'demand';
  id: string;
  at: string;
  product: string | null;
  quantity: string | null;
  incoterm: string | null;
  port: string | null;
  rawIntent: string | null;
  threadId: string;
}

export interface SignalEvent {
  type: 'signal';
  id: string;
  at: string;
  companyId: string;
  companyName: string;
  headline: string | null;
  status: string;
}

export type FeedEvent = ContractEvent | DemandEvent | SignalEvent;

function extractDemandField(extracted: Json, key: string): string | null {
  if (typeof extracted !== 'object' || extracted === null || Array.isArray(extracted)) return null;
  const val = (extracted as Record<string, Json | undefined>)[key];
  return typeof val === 'string' ? val : null;
}

export async function GET() {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;

    const { orgId, supabase } = context;

    const [shipmentsRes, threadsRes, companiesRes] = await Promise.all([
      supabase
        .from('shipments')
        .select('id, company_id, product, supplier_name, origin_country, destination_country, quantity_mt, value_usd, shipment_date, created_at, companies(name)')
        .eq('org_id', orgId)
        .order('shipment_date', { ascending: false, nullsFirst: false })
        .limit(40),

      supabase
        .from('outreach_threads')
        .select('id, created_at, extracted_demand, sender, channel')
        .eq('org_id', orgId)
        .eq('direction', 'Inbound')
        .not('extracted_demand', 'is', null)
        .order('created_at', { ascending: false })
        .limit(40),

      supabase
        .from('companies')
        .select('id, name, sourcing_signal, sourcing_signal_at, created_at')
        .eq('org_id', orgId)
        .not('sourcing_signal', 'is', null)
        .limit(40),
    ]);

    const events: FeedEvent[] = [];

    for (const row of shipmentsRes.data ?? []) {
      const companiesJoin = row.companies as { name?: string } | null;
      const companyName =
        (Array.isArray(row.companies)
          ? (row.companies[0] as { name?: string })?.name
          : companiesJoin?.name) ?? 'Unknown Company';

      events.push({
        type: 'contract',
        id: row.id,
        at: row.shipment_date ?? row.created_at ?? new Date().toISOString(),
        companyId: row.company_id,
        companyName,
        product: row.product,
        quantityMt: row.quantity_mt,
        supplier: row.supplier_name,
        origin: row.origin_country,
        destination: row.destination_country,
        valueUsd: row.value_usd,
      });
    }

    for (const row of threadsRes.data ?? []) {
      const ed = row.extracted_demand;
      events.push({
        type: 'demand',
        id: row.id,
        at: row.created_at ?? new Date().toISOString(),
        product: extractDemandField(ed, 'product'),
        quantity: extractDemandField(ed, 'quantity'),
        incoterm: extractDemandField(ed, 'incoterm'),
        port: extractDemandField(ed, 'port'),
        rawIntent: extractDemandField(ed, 'raw_intent'),
        threadId: row.id,
      });
    }

    for (const row of companiesRes.data ?? []) {
      const signal = row.sourcing_signal as Record<string, Json | undefined> | null;
      if (!signal) continue;
      const status = typeof signal.status === 'string' ? signal.status : null;
      if (!status || !['switching', 'declining'].includes(status)) continue;
      const headline = typeof signal.headline === 'string' ? signal.headline : null;

      events.push({
        type: 'signal',
        id: row.id,
        at: row.sourcing_signal_at ?? row.created_at ?? new Date().toISOString(),
        companyId: row.id,
        companyName: row.name,
        headline,
        status,
      });
    }

    events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    return NextResponse.json({ success: true, events: events.slice(0, 40) });
  } catch (error: unknown) {
    console.error('[/api/live] error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

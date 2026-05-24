import React from 'react';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/auth/server';
import type { FeedEvent } from '@/app/api/live/route';
import type { Json } from '@/lib/supabase/database.types';
import LiveFeed from './LiveFeed';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Live Trade Feed | Denver Trades' };

function extractDemandField(extracted: Json, key: string): string | null {
  if (typeof extracted !== 'object' || extracted === null || Array.isArray(extracted)) return null;
  const val = (extracted as Record<string, Json | undefined>)[key];
  return typeof val === 'string' ? val : null;
}

export default async function LiveFeedPage() {
  const context = await getUserContext();
  if (!context) redirect('/');

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

  return (
    <div className={`${styles.container} fade-in`}>
      <LiveFeed initialEvents={events.slice(0, 40)} orgId={orgId} />
    </div>
  );
}

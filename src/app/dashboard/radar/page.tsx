import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Activity,
  AlertTriangle,
  Globe,
  MapPin,
  Radar,
  Send,
} from 'lucide-react';
import { getUserContext } from '@/lib/auth/server';
import IntentChip from '@/components/IntentChip';
import BuyerFitBadge from '@/components/BuyerFitBadge';
import SourcingSignalBadge from '@/components/SourcingSignalBadge';
import { formatNumber } from '@/lib/format';
import type { CompanyType } from '@/lib/intent';
import type { SourcingSignal } from '@/lib/signals/supplierShift';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

interface RequirementRow {
  product: string;
  destination: string;
  ports: string[];
  buyerCount: number;
  shipmentCount: number;
  totalVolumeMt: number;
  totalValueUsd: number;
  topBuyers: { id: string; name: string }[];
}

interface ShiftingCompany {
  id: string;
  name: string;
  type: CompanyType | null;
  hq_country: string | null;
  buyer_fit_score: number | null;
  sourcing_signal: SourcingSignal | null;
  products_dealt: string[] | null;
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${formatNumber(n)}`;
}

function formatMt(n: number): string {
  if (n === 0) return '—';
  return `${formatNumber(Math.round(n))} MT`;
}

export default async function RadarPage() {
  const context = await getUserContext();
  if (!context) redirect('/');

  const { orgId, supabase } = context;

  // ── Requirements: aggregate shipments (product × destination) ──
  const { data: shipmentRows } = await supabase
    .from('shipments')
    .select('product, destination_country, port_discharge, quantity_mt, value_usd, company_id')
    .eq('org_id', orgId);

  const { data: companyRows } = await supabase
    .from('companies')
    .select('id, name')
    .eq('org_id', orgId);

  const companyMap = new Map<string, string>(
    (companyRows ?? []).map((c) => [c.id, c.name])
  );

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
      b = { product, destination: dest, portSet: new Set(), buyerSet: new Set(), shipmentCount: 0, totalVolumeMt: 0, totalValueUsd: 0 };
      buckets.set(key, b);
    }
    b.shipmentCount += 1;
    b.totalVolumeMt += s.quantity_mt ?? 0;
    b.totalValueUsd += s.value_usd ?? 0;
    if (s.port_discharge) b.portSet.add(s.port_discharge);
    if (s.company_id) b.buyerSet.add(s.company_id);
  }

  const requirements: RequirementRow[] = Array.from(buckets.values())
    .map((b) => ({
      product: b.product,
      destination: b.destination,
      ports: Array.from(b.portSet).filter(Boolean),
      buyerCount: b.buyerSet.size,
      shipmentCount: b.shipmentCount,
      totalVolumeMt: Math.round(b.totalVolumeMt * 10) / 10,
      totalValueUsd: Math.round(b.totalValueUsd),
      topBuyers: Array.from(b.buyerSet)
        .slice(0, 4)
        .filter((id) => companyMap.has(id))
        .map((id) => ({ id, name: companyMap.get(id)! })),
    }))
    .sort((a, b) => b.buyerCount - a.buyerCount || b.totalVolumeMt - a.totalVolumeMt)
    .slice(0, 20);

  // ── Shifting: companies with switching / declining signal ──
  const { data: shiftingData } = await supabase
    .from('companies')
    .select('id, name, type, hq_country, buyer_fit_score, sourcing_signal, products_dealt')
    .eq('org_id', orgId)
    .in('sourcing_signal->>status' as 'id', ['switching', 'declining']);

  const shifting: ShiftingCompany[] = ((shiftingData ?? []) as ShiftingCompany[]).sort((a, b) => {
    const sOrd = (r: ShiftingCompany) => (r.sourcing_signal?.status === 'switching' ? 0 : 1);
    const iOrd = (r: ShiftingCompany) => {
      const i = r.sourcing_signal?.intent;
      return i === 'high' ? 0 : i === 'medium' ? 1 : 2;
    };
    const so = sOrd(a) - sOrd(b);
    if (so !== 0) return so;
    const io = iOrd(a) - iOrd(b);
    if (io !== 0) return io;
    return (b.buyer_fit_score ?? 0) - (a.buyer_fit_score ?? 0);
  });

  return (
    <div className={`${styles.page} fade-in`}>
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>Demand Radar</h1>
          <span className={styles.subtitle}>
            What buyers need · where they ship · who is switching suppliers right now
          </span>
        </div>
      </div>

      {/* ── Section 1: What's needed where ── */}
      <section>
        <div className={styles.sectionHead}>
          <span className={styles.sectionIcon}>
            <Activity size={18} strokeWidth={1.8} />
          </span>
          <span className={styles.sectionTitle}>What&apos;s needed where</span>
          <span className={styles.sectionCount}>{requirements.length} product × market pairs</span>
        </div>

        {requirements.length === 0 ? (
          <div className={styles.emptySection}>
            <Globe size={40} strokeWidth={1} className={styles.emptyIcon} />
            <p className={styles.emptyTitle}>No shipment data yet</p>
            <p className={styles.emptyDesc}>
              Run the Lead Scraper agent to import buyer shipment records. Demand
              requirements will appear here once data is ingested.
            </p>
          </div>
        ) : (
          <div className={styles.reqGrid}>
            {requirements.map((req) => (
              <div key={`${req.product}|||${req.destination}`} className={styles.reqCard}>
                <div className={styles.reqTop}>
                  <span className={styles.reqProduct}>{req.product}</span>
                  <span className={styles.reqDestBadge}>
                    <MapPin size={11} strokeWidth={1.8} />
                    {req.destination}
                  </span>
                </div>

                <div className={styles.reqStats}>
                  <div className={styles.statItem}>
                    <span className={styles.statValue}>{req.buyerCount}</span>
                    <span className={styles.statLabel}>{req.buyerCount === 1 ? 'Buyer' : 'Buyers'}</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statValue}>{req.shipmentCount}</span>
                    <span className={styles.statLabel}>Shipments</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statValue}>{formatMt(req.totalVolumeMt)}</span>
                    <span className={styles.statLabel}>Volume</span>
                  </div>
                  <div className={styles.statItem}>
                    <span className={styles.statValue}>
                      {req.totalValueUsd > 0 ? formatUsd(req.totalValueUsd) : '—'}
                    </span>
                    <span className={styles.statLabel}>Value</span>
                  </div>
                </div>

                {req.ports.length > 0 && (
                  <div className={styles.reqPorts}>
                    {req.ports.slice(0, 4).map((p) => (
                      <span key={p} className={styles.portChip}>{p}</span>
                    ))}
                    {req.ports.length > 4 && (
                      <span className={styles.buyerChipMore}>+{req.ports.length - 4} more</span>
                    )}
                  </div>
                )}

                {req.topBuyers.length > 0 && (
                  <div className={styles.buyerChips}>
                    <span className={styles.buyerLabel}>Buyers</span>
                    {req.topBuyers.map((b) => (
                      <Link key={b.id} href={`/dashboard/companies/${b.id}`} className={styles.buyerChip}>
                        {b.name}
                      </Link>
                    ))}
                    {req.buyerCount > req.topBuyers.length && (
                      <span className={styles.buyerChipMore}>
                        +{req.buyerCount - req.topBuyers.length} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Section 2: Buyers shifting suppliers ── */}
      <section>
        <div className={styles.sectionHead}>
          <span className={`${styles.sectionIcon} ${styles.sectionIconWarn}`}>
            <AlertTriangle size={18} strokeWidth={1.8} />
          </span>
          <span className={styles.sectionTitle}>Buyers shifting suppliers</span>
          <span className={styles.sectionCount}>{shifting.length} high-intent leads</span>
        </div>

        {shifting.length === 0 ? (
          <div className={styles.emptySection}>
            <Radar size={40} strokeWidth={1} className={styles.emptyIcon} />
            <p className={styles.emptyTitle}>No displacement signals detected</p>
            <p className={styles.emptyDesc}>
              Displacement signals are computed from shipment history. Add companies
              with shipment records and run the enrichment pipeline to see which
              buyers are actively switching.
            </p>
          </div>
        ) : (
          <div className={styles.shiftList}>
            {shifting.map((company, idx) => {
              const signal = company.sourcing_signal;
              const firstProduct = company.products_dealt?.[0] ?? '';
              const outreachHref = `/dashboard/outreach?companyId=${company.id}&companyName=${encodeURIComponent(company.name)}${firstProduct ? `&product=${encodeURIComponent(firstProduct)}` : ''}`;
              const isTop = idx < 3;
              const rankClass =
                idx === 0 ? styles.rank1 : idx === 1 ? styles.rank2 : styles.rank3;

              return (
                <div
                  key={company.id}
                  className={`${styles.shiftRow} ${isTop ? styles.topRow : ''}`}
                >
                  {isTop ? (
                    <span className={`${styles.rankBadge} ${rankClass}`}>{idx + 1}</span>
                  ) : (
                    <span className={styles.rankBadgePlain} />
                  )}

                  <div className={styles.shiftRowTop}>
                    <div className={styles.shiftTopLine}>
                      <Link href={`/dashboard/companies/${company.id}`} className={styles.shiftName}>
                        {company.name}
                      </Link>
                      <IntentChip type={company.type} size="sm" />
                      <SourcingSignalBadge signal={signal} size="md" />
                      <BuyerFitBadge score={company.buyer_fit_score} size="sm" showLabel />
                    </div>

                    <div className={styles.shiftMeta}>
                      {company.hq_country && (
                        <span className={styles.shiftCountry}>
                          <MapPin size={12} strokeWidth={1.6} />
                          {company.hq_country}
                        </span>
                      )}
                    </div>

                    {signal && (
                      <div className={styles.shiftSignalBlock}>
                        <span className={styles.shiftHeadline}>{signal.headline}</span>
                        {signal.evidence?.[0] && (
                          <span className={styles.shiftEvidence}>{signal.evidence[0]}</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className={styles.shiftActions}>
                    <Link href={outreachHref} className={styles.outreachBtn}>
                      <Send size={14} strokeWidth={2} />
                      Generate outreach
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

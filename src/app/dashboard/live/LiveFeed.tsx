'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Activity, Anchor, Radio, TrendingDown, TrendingUp } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatNumber, relativeFromNow } from '@/lib/format';
import type { FeedEvent, ContractEvent, DemandEvent, SignalEvent } from '@/app/api/live/route';
import styles from './LiveFeed.module.css';

interface LiveFeedProps {
  initialEvents: FeedEvent[];
  orgId: string;
}

function ContractCard({ ev, isNew }: { ev: ContractEvent; isNew: boolean }) {
  return (
    <div className={`${styles.card} ${styles.cardContract} ${isNew ? styles.cardNew : ''}`}>
      <div className={styles.cardIconWrap} aria-hidden="true">
        <Anchor size={16} strokeWidth={1.8} className={styles.iconContract} />
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardHeader}>
          <span className={`${styles.typeBadge} ${styles.typeBadgeContract}`}>Contract</span>
          <span className={styles.cardTime}>{relativeFromNow(ev.at) || 'Today'}</span>
        </div>
        <p className={styles.cardTitle}>
          {ev.companyId ? (
            <Link href={`/dashboard/companies/${ev.companyId}`} className={styles.companyLink}>
              {ev.companyName}
            </Link>
          ) : (
            <span>{ev.companyName}</span>
          )}
          {' '}imported{' '}
          <strong className={styles.highlight}>{ev.product}</strong>
        </p>
        <div className={styles.cardMeta}>
          {ev.quantityMt != null && (
            <span className={styles.metaItem}>
              <TrendingUp size={12} strokeWidth={1.8} aria-hidden />
              {formatNumber(ev.quantityMt)} MT
            </span>
          )}
          {ev.supplier && (
            <span className={styles.metaItem}>
              Supplier: {ev.supplier}
            </span>
          )}
          {ev.origin && ev.destination && (
            <span className={styles.metaItem}>
              {ev.origin} → {ev.destination}
            </span>
          )}
          {ev.valueUsd != null && (
            <span className={styles.metaItem}>
              ${formatNumber(ev.valueUsd)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function DemandCard({ ev, isNew }: { ev: DemandEvent; isNew: boolean }) {
  const outreachHref = ev.product
    ? `/dashboard/outreach?product=${encodeURIComponent(ev.product)}`
    : '/dashboard/outreach';

  return (
    <div className={`${styles.card} ${styles.cardDemand} ${isNew ? styles.cardNew : ''}`}>
      <div className={styles.cardIconWrap} aria-hidden="true">
        <Radio size={16} strokeWidth={1.8} className={styles.iconDemand} />
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardHeader}>
          <span className={`${styles.typeBadge} ${styles.typeBadgeDemand}`}>Demand</span>
          <span className={styles.cardTime}>{relativeFromNow(ev.at) || 'Today'}</span>
        </div>
        <p className={styles.cardTitle}>
          Inbound inquiry{ev.product ? (
            <> for <strong className={styles.highlightDemand}>{ev.product}</strong></>
          ) : null}
        </p>
        {ev.rawIntent && (
          <p className={styles.rawIntent}>&ldquo;{ev.rawIntent}&rdquo;</p>
        )}
        <div className={styles.cardMeta}>
          {ev.quantity && <span className={styles.metaItem}>Qty: {ev.quantity}</span>}
          {ev.incoterm && <span className={styles.metaItem}>{ev.incoterm}</span>}
          {ev.port && <span className={styles.metaItem}>Port: {ev.port}</span>}
        </div>
        <Link href={outreachHref} className={styles.quoteLink}>
          Generate quote →
        </Link>
      </div>
    </div>
  );
}

function SignalCard({ ev, isNew }: { ev: SignalEvent; isNew: boolean }) {
  return (
    <div className={`${styles.card} ${styles.cardSignal} ${isNew ? styles.cardNew : ''}`}>
      <div className={styles.cardIconWrap} aria-hidden="true">
        <TrendingDown size={16} strokeWidth={1.8} className={styles.iconSignal} />
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardHeader}>
          <span className={`${styles.typeBadge} ${styles.typeBadgeSignal}`}>
            {ev.status === 'switching' ? 'Switching' : 'Declining'}
          </span>
          <span className={styles.cardTime}>{relativeFromNow(ev.at) || 'Today'}</span>
        </div>
        <p className={styles.cardTitle}>
          <Link href={`/dashboard/companies/${ev.companyId}`} className={styles.companyLink}>
            {ev.companyName}
          </Link>
          {' '}
          {ev.status === 'switching' ? 'is switching suppliers' : 'shows declining volume'}
        </p>
        {ev.headline && (
          <p className={styles.signalHeadline}>{ev.headline}</p>
        )}
      </div>
    </div>
  );
}

function FeedCard({ ev, isNew }: { ev: FeedEvent; isNew: boolean }) {
  if (ev.type === 'contract') return <ContractCard ev={ev} isNew={isNew} />;
  if (ev.type === 'demand') return <DemandCard ev={ev} isNew={isNew} />;
  return <SignalCard ev={ev as SignalEvent} isNew={isNew} />;
}

function SkeletonCard() {
  return (
    <div className={`${styles.card} ${styles.cardSkeleton}`} aria-busy="true">
      <div className={`skeleton ${styles.skelIcon}`} />
      <div className={styles.cardBody}>
        <div className={`skeleton ${styles.skelLine} ${styles.skelLineSm}`} />
        <div className={`skeleton ${styles.skelLine} ${styles.skelLineMd}`} />
        <div className={`skeleton ${styles.skelLine} ${styles.skelLineXs}`} />
      </div>
    </div>
  );
}

export default function LiveFeed({ initialEvents, orgId }: LiveFeedProps) {
  const supabase = useMemo(() => createClient(), []);
  const [events, setEvents] = useState<FeedEvent[]>(initialEvents);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(initialEvents.length === 0);
  const [liveConnected, setLiveConnected] = useState(false);
  const newIdTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const prependEvent = useCallback((ev: FeedEvent) => {
    setEvents(prev => [ev, ...prev].slice(0, 40));
    setNewIds(prev => new Set([...prev, ev.id]));
    const timer = setTimeout(() => {
      setNewIds(prev => {
        const next = new Set(prev);
        next.delete(ev.id);
        return next;
      });
      newIdTimers.current.delete(ev.id);
    }, 3000);
    newIdTimers.current.set(ev.id, timer);
  }, []);

  useEffect(() => {
    if (initialEvents.length === 0) {
      fetch('/api/live')
        .then(r => r.json())
        .then(data => {
          if (data.success) setEvents(data.events ?? []);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [initialEvents.length]);

  useEffect(() => {
    const channel = supabase
      .channel('live-feed')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'shipments', filter: `org_id=eq.${orgId}` },
        async (payload) => {
          const row = payload.new as {
            id: string; company_id: string | null; product: string;
            supplier_name: string | null; origin_country: string | null;
            destination_country: string | null; quantity_mt: number | null;
            value_usd: number | null; shipment_date: string | null; created_at: string | null;
          };
          // The realtime payload only carries company_id — resolve the real
          // buyer name so live cards don't read a placeholder "New Buyer".
          let companyName = 'New shipment';
          if (row.company_id) {
            const { data } = await supabase
              .from('companies')
              .select('name')
              .eq('id', row.company_id)
              .maybeSingle();
            if (data?.name) companyName = data.name;
          }
          const ev: FeedEvent = {
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
          };
          prependEvent(ev);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'outreach_threads',
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string; created_at: string | null; direction: string | null;
            extracted_demand: Record<string, string | null> | null;
          };
          if (row.direction !== 'Inbound' || !row.extracted_demand) return;
          const ed = row.extracted_demand;
          const ev: FeedEvent = {
            type: 'demand',
            id: row.id,
            at: row.created_at ?? new Date().toISOString(),
            product: ed.product ?? null,
            quantity: ed.quantity ?? null,
            incoterm: ed.incoterm ?? null,
            port: ed.port ?? null,
            rawIntent: ed.raw_intent ?? null,
            threadId: row.id,
          };
          prependEvent(ev);
        }
      )
      .subscribe((status) => {
        setLiveConnected(status === 'SUBSCRIBED');
      });

    const timers = newIdTimers.current;
    return () => {
      supabase.removeChannel(channel);
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, [supabase, orgId, prependEvent]);

  return (
    <div className={styles.feedWrap}>
      <div className={styles.feedHeader}>
        <div className={styles.feedTitleRow}>
          <Activity size={20} strokeWidth={1.6} aria-hidden="true" />
          <h1 className={styles.feedTitle}>Live Trade Feed</h1>
        </div>
        <div className={`${styles.livePill} ${liveConnected ? styles.livePillOn : ''}`}>
          <span className={styles.liveDot} aria-hidden="true" />
          {liveConnected ? 'Live' : 'Connecting…'}
        </div>
      </div>
      <p className={styles.feedSubtitle}>
        Real-time contracts, buyer demand signals, and supplier-switch alerts for your market.
      </p>

      <div className={styles.feed} role="feed" aria-label="Live trade events">
        {loading ? (
          <>
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={`skel-${i}`} />
            ))}
          </>
        ) : events.length === 0 ? (
          <div className={styles.emptyState}>
            <Activity size={40} strokeWidth={1} className={styles.emptyIcon} aria-hidden="true" />
            <p className={styles.emptyTitle}>No trade events yet</p>
            <p className={styles.emptyDesc}>
              Events will appear here as shipments land, inbound WhatsApp inquiries arrive,
              or companies show supplier-switch signals.
            </p>
          </div>
        ) : (
          events.map(ev => (
            <FeedCard key={ev.id} ev={ev} isNew={newIds.has(ev.id)} />
          ))
        )}
      </div>
    </div>
  );
}

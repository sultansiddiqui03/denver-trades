'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Anchor, ArrowRight, Clock, Inbox, ShoppingCart, Zap } from 'lucide-react';
import styles from './ActiveDemandFeed.module.css';

interface DemandFeedItem {
  id: string;
  company_id: string | null;
  company_name: string;
  product: string | null;
  quantity_amount: number | null;
  quantity_unit: string | null;
  incoterm: string | null;
  destination_port: string | null;
  destination_country: string | null;
  deadline_iso: string | null;
  raw_intent: string | null;
  created_at: string;
}

function timeAgo(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  if (Number.isNaN(diffMs)) return '';
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'yesterday';
  return `${diffD}d ago`;
}

function formatDeadline(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function buildOutreachHref(item: DemandFeedItem): string {
  const params = new URLSearchParams();
  if (item.company_id) params.set('companyId', item.company_id);
  if (item.product) params.set('product', item.product);
  const qs = params.toString();
  return qs ? `/dashboard/outreach?${qs}` : '/dashboard/outreach';
}

/**
 * Renders the structured demand line — quantity, product, incoterm, port — as
 * a tight middot-separated row. Falls back to "Demand received" when the
 * extractor only picked up a deadline or raw_intent.
 */
function DemandLine({ item }: { item: DemandFeedItem }) {
  const parts: string[] = [];
  if (item.quantity_amount && item.quantity_unit) {
    parts.push(`${item.quantity_amount}× ${item.quantity_unit}`);
  } else if (item.quantity_amount) {
    parts.push(String(item.quantity_amount));
  }
  if (item.product) {
    parts.push(
      item.product.replace(/^./, (c) => c.toUpperCase())
    );
  }
  if (item.incoterm) parts.push(item.incoterm);

  return (
    <div className={styles.demandLine}>
      {parts.length > 0 ? (
        parts.map((part, idx) => (
          <React.Fragment key={`${item.id}-part-${idx}`}>
            {idx > 0 && <span className={styles.middot}>·</span>}
            <span className={styles.demandPart}>{part}</span>
          </React.Fragment>
        ))
      ) : (
        <span className={styles.demandPart}>Demand received</span>
      )}
    </div>
  );
}

export default function ActiveDemandFeed() {
  const [items, setItems] = useState<DemandFeedItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/dashboard/demand', { cache: 'no-store' });
        const json: { success?: boolean; items?: DemandFeedItem[]; error?: string } =
          await res.json();
        if (cancelled) return;
        if (!res.ok || !json.success) {
          setError(json.error || 'Failed to load demand feed');
          setItems([]);
          return;
        }
        setItems(json.items ?? []);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Network error');
        setItems([]);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (items === null) {
    return (
      <div className={styles.demandCard}>
        <div className={styles.skeletonRow}>
          <div className="skeleton" style={{ height: '92px', borderRadius: '12px' }} />
          <div className="skeleton" style={{ height: '92px', borderRadius: '12px' }} />
          <div className="skeleton" style={{ height: '92px', borderRadius: '12px' }} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.demandCard}>
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>Couldn&apos;t load active demand</p>
          <p className={styles.emptyBody}>{error}</p>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={styles.demandCard}>
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <Inbox size={28} strokeWidth={1.4} />
          </div>
          <p className={styles.emptyTitle}>No active buyer demand yet</p>
          <p className={styles.emptyBody}>
            Twilio inbound WhatsApp will land here automatically — share your
            number with buyers to start collecting structured RFQs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.demandCard}>
      <ul className={styles.list}>
        {items.map((item) => {
          const deadline = formatDeadline(item.deadline_iso);
          const portLine =
            item.destination_port ||
            (item.destination_country ? `to ${item.destination_country}` : null);

          return (
            <li key={item.id} className={styles.row}>
              <div className={styles.rowHeader}>
                <div className={styles.headerLeft}>
                  <span className={styles.companyName}>{item.company_name}</span>
                  <span
                    className={styles.buysChip}
                    title="This buyer is signaling a purchase intent"
                  >
                    <ShoppingCart size={11} strokeWidth={2.2} />
                    BUYS
                  </span>
                </div>
                <span className={styles.timeAgo}>{timeAgo(item.created_at)}</span>
              </div>

              <DemandLine item={item} />

              {portLine && (
                <div className={styles.metaRow}>
                  <Anchor size={12} strokeWidth={1.7} className={styles.metaIcon} />
                  <span>{portLine}</span>
                  {deadline && (
                    <>
                      <span className={styles.metaSep}>·</span>
                      <Clock size={12} strokeWidth={1.7} className={styles.metaIcon} />
                      <span>by {deadline}</span>
                    </>
                  )}
                </div>
              )}
              {!portLine && deadline && (
                <div className={styles.metaRow}>
                  <Clock size={12} strokeWidth={1.7} className={styles.metaIcon} />
                  <span>by {deadline}</span>
                </div>
              )}

              {item.raw_intent && (
                <p className={styles.quote}>&ldquo;{item.raw_intent}&rdquo;</p>
              )}

              <div className={styles.rowFooter}>
                <Link href={buildOutreachHref(item)} className={styles.cta}>
                  <Zap size={14} strokeWidth={1.8} />
                  Generate quote
                  <ArrowRight size={14} strokeWidth={1.8} />
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

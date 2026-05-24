'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Flame,
  RefreshCw,
  X,
  Zap,
  TrendingDown,
  Users,
  Package,
  ArrowRight,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { relativeFromNow } from '@/lib/format';
import styles from './OpportunitiesInbox.module.css';

type OpportunityType = 'demand_match' | 'supplier_switch' | 'new_fit_buyer';
type OpportunityStatus = 'new' | 'viewed' | 'acted' | 'dismissed';

interface Evidence {
  quantity?: string;
  incoterm?: string;
  port?: string;
  status?: string;
  headline?: string;
  buyerFit?: number | string;
  [key: string]: unknown;
}

export interface Opportunity {
  id: string;
  org_id: string;
  type: OpportunityType;
  title: string;
  summary: string;
  priority: number;
  company_id: string | null;
  thread_id: string | null;
  product: string | null;
  evidence: Evidence | null;
  status: OpportunityStatus;
  created_at: string;
}

interface Props {
  initialOpportunities: Opportunity[];
  orgId: string;
}

function priorityLabel(p: number): { label: string; cls: string } {
  if (p >= 85) return { label: 'HOT', cls: styles.pillHot };
  if (p >= 60) return { label: 'Warm', cls: styles.pillWarm };
  return { label: 'Low', cls: styles.pillLow };
}

function TypeBadge({ type }: { type: OpportunityType }) {
  if (type === 'supplier_switch') {
    return (
      <span className={`${styles.typeBadge} ${styles.typeBadgeSwitch}`}>
        <TrendingDown size={11} strokeWidth={2} />
        High Intent
      </span>
    );
  }
  if (type === 'new_fit_buyer') {
    return (
      <span className={`${styles.typeBadge} ${styles.typeBadgeFit}`}>
        <Users size={11} strokeWidth={2} />
        Fit Buyer
      </span>
    );
  }
  return (
    <span className={`${styles.typeBadge} ${styles.typeBadgeDemand}`}>
      <Package size={11} strokeWidth={2} />
      Demand Match
    </span>
  );
}

function EvidenceChips({ evidence, type }: { evidence: Evidence | null; type: OpportunityType }) {
  if (!evidence) return null;

  const chips: React.ReactNode[] = [];

  if (type === 'demand_match') {
    if (evidence.quantity) chips.push(<span key="qty" className={styles.evidenceChip}>{String(evidence.quantity)}</span>);
    if (evidence.incoterm) chips.push(<span key="inc" className={`${styles.evidenceChip} ${styles.evidenceChipBlue}`}>{String(evidence.incoterm)}</span>);
    if (evidence.port) chips.push(<span key="port" className={styles.evidenceChip}>{String(evidence.port)}</span>);
  } else if (type === 'supplier_switch') {
    if (evidence.status) chips.push(<span key="status" className={`${styles.evidenceChip} ${styles.evidenceChipLime}`}>{String(evidence.status)}</span>);
    if (evidence.headline) chips.push(<span key="hl" className={styles.evidenceChip}>{String(evidence.headline)}</span>);
  } else if (type === 'new_fit_buyer') {
    if (evidence.buyerFit !== undefined) {
      chips.push(
        <span key="fit" className={`${styles.evidenceChip} ${styles.evidenceChipEmerald}`}>
          Fit {String(evidence.buyerFit)}%
        </span>
      );
    }
  }

  if (chips.length === 0) return null;
  return <div className={styles.evidenceRow}>{chips}</div>;
}

function ActionButton({ opp }: { opp: Opportunity }) {
  if (opp.type === 'demand_match') {
    const href = opp.product
      ? `/dashboard/outreach?product=${encodeURIComponent(opp.product)}${opp.company_id ? `&companyId=${opp.company_id}` : ''}`
      : `/dashboard/outreach`;
    return (
      <Link href={href} className={styles.actionPrimary}>
        Generate quote
        <ArrowRight size={13} strokeWidth={2} />
      </Link>
    );
  }
  const href = opp.company_id
    ? `/dashboard/outreach?companyId=${opp.company_id}`
    : `/dashboard/outreach`;
  return (
    <Link href={href} className={styles.actionPrimary}>
      Generate outreach
      <ArrowRight size={13} strokeWidth={2} />
    </Link>
  );
}

export default function OpportunitiesInbox({ initialOpportunities, orgId }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Opportunity[]>(initialOpportunities);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [rescanning, setRescanning] = useState(false);
  const [liveConnected, setLiveConnected] = useState(false);
  const itemsRef = useRef<Opportunity[]>(items);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const handleInsert = useCallback((opp: Opportunity) => {
    if (opp.status === 'dismissed') return;
    const current = itemsRef.current;
    if (current.some((o) => o.id === opp.id)) return;
    const next = [opp, ...current].sort((a, b) => b.priority - a.priority);
    setItems(next);
    setNewIds((prev) => new Set([...prev, opp.id]));
    setTimeout(() => {
      setNewIds((prev) => {
        const copy = new Set(prev);
        copy.delete(opp.id);
        return copy;
      });
    }, 3000);
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel(`opportunities-inbox-${orgId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'opportunities',
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          handleInsert(payload.new as Opportunity);
        }
      )
      .subscribe((status) => {
        setLiveConnected(status === 'SUBSCRIBED');
      });

    return () => {
      const ch = channel;
      void supabase.removeChannel(ch);
    };
  }, [supabase, orgId, handleInsert]);

  const handleDismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((o) => o.id !== id));
    void fetch(`/api/opportunities/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'dismissed' }),
    });
  }, []);

  const handleRescan = useCallback(async () => {
    if (rescanning) return;
    setRescanning(true);
    try {
      await fetch('/api/opportunities/detect', { method: 'POST' });
      const res = await fetch('/api/opportunities');
      const data = await res.json();
      if (data.success) setItems(data.opportunities ?? []);
    } catch {
      /* silent */
    } finally {
      setRescanning(false);
    }
  }, [rescanning]);

  const openCount = items.length;

  return (
    <div className={styles.inbox}>
      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.titleBlock}>
          <div className={styles.titleRow}>
            <Flame size={22} strokeWidth={1.8} className={styles.titleIcon} />
            <h1 className={styles.title}>Opportunities</h1>
            <span className={styles.countPill}>{openCount}</span>
          </div>
          <span className={styles.subtitle}>
            Real-time demand matches, supplier-switch signals, and high-fit buyers
          </span>
        </div>

        <div className={styles.headerRight}>
          <span className={`${styles.livePulse} ${liveConnected ? styles.livePulseOn : ''}`}>
            <span className={styles.pulseDot} aria-hidden />
            Live
          </span>
          <button
            type="button"
            className={styles.rescanBtn}
            onClick={handleRescan}
            disabled={rescanning}
            aria-label="Rescan for new opportunities"
          >
            <RefreshCw size={14} strokeWidth={2} className={rescanning ? styles.spinning : ''} />
            {rescanning ? 'Scanning…' : 'Rescan'}
          </button>
        </div>
      </div>

      {/* ── List ── */}
      {openCount === 0 ? (
        <div className={styles.emptyState}>
          <Zap size={44} strokeWidth={1} className={styles.emptyIcon} />
          <p className={styles.emptyTitle}>No open opportunities</p>
          <p className={styles.emptyDesc}>
            They&apos;ll appear here the moment a matching demand or supplier-switch is detected.
            Hit <strong>Rescan</strong> to check right now.
          </p>
        </div>
      ) : (
        <div className={styles.list}>
          {items.map((opp) => {
            const { label, cls } = priorityLabel(opp.priority);
            const isNew = newIds.has(opp.id);
            return (
              <div
                key={opp.id}
                className={`${styles.card} ${isNew ? styles.cardHighlight : ''} ${opp.priority >= 85 ? styles.cardHot : ''}`}
              >
                {/* Top row: badges + priority + time + dismiss */}
                <div className={styles.cardTop}>
                  <div className={styles.badgeRow}>
                    <TypeBadge type={opp.type} />
                    <span className={`${styles.priorityPill} ${cls}`}>{label}</span>
                  </div>
                  <div className={styles.cardMeta}>
                    <span className={styles.cardTime}>{relativeFromNow(opp.created_at) || 'just now'}</span>
                    <button
                      type="button"
                      className={styles.dismissBtn}
                      onClick={() => handleDismiss(opp.id)}
                      aria-label="Dismiss opportunity"
                    >
                      <X size={13} strokeWidth={2} />
                    </button>
                  </div>
                </div>

                {/* Title + summary */}
                <p className={styles.cardTitle}>{opp.title}</p>
                <p className={styles.cardSummary}>{opp.summary}</p>

                {/* Evidence chips */}
                <EvidenceChips evidence={opp.evidence} type={opp.type} />

                {/* Actions */}
                <div className={styles.cardActions}>
                  <ActionButton opp={opp} />
                  {opp.company_id && (
                    <Link
                      href={`/dashboard/companies/${opp.company_id}`}
                      className={styles.actionSecondary}
                    >
                      View company
                    </Link>
                  )}
                  {opp.product && opp.type !== 'demand_match' && (
                    <span className={styles.productChip}>
                      <Package size={11} strokeWidth={1.8} />
                      {opp.product}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

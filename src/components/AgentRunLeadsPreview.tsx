'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { MapPin, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import styles from './AgentRunLeadsPreview.module.css';

export interface LeadPreviewCompany {
  id: string;
  name: string;
  type: 'Importer' | 'Exporter' | 'Broker' | null;
  hq_city: string | null;
  hq_country: string | null;
  products_dealt: string[] | null;
}

interface AgentRunLeadsPreviewProps {
  /** Apify dataset id parsed out of `agent_runs.error_log`. */
  datasetId: string | null;
  /** When the run began — fallback bound for older rows missing `enrichment_source`. */
  startedAt: string;
  /** When the run completed — paired with `startedAt` for the timestamp fallback. */
  completedAt: string | null;
  /** Expected number of leads (records_created). Drives skeleton count. */
  expectedCount: number;
}

const SKELETON_HEIGHT = 132;
// Anything outside this window is almost certainly from another run.
const FALLBACK_BUFFER_MS = 60_000;

function typeBadgeClass(type: LeadPreviewCompany['type']): string {
  switch (type) {
    case 'Importer':
      return 'badge badge-lime';
    case 'Exporter':
      return 'badge badge-blue';
    case 'Broker':
      return 'badge badge-yellow';
    default:
      return 'badge';
  }
}

export default function AgentRunLeadsPreview({
  datasetId,
  startedAt,
  completedAt,
  expectedCount,
}: AgentRunLeadsPreviewProps) {
  const supabase = useMemo(() => createClient(), []);
  const [companies, setCompanies] = useState<LeadPreviewCompany[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);

      // Primary path: companies created with enrichment_source = 'apify:<dataset>'.
      if (datasetId) {
        const { data, error: fetchError } = await supabase
          .from('companies')
          .select('id, name, type, hq_city, hq_country, products_dealt')
          .eq('enrichment_source', `apify:${datasetId}`)
          .order('created_at', { ascending: false })
          .limit(5);

        if (cancelled) return;
        if (fetchError) {
          setError(fetchError.message);
          return;
        }
        if (data && data.length > 0) {
          setCompanies(data as LeadPreviewCompany[]);
          return;
        }
        // Fall through to timestamp fallback when no enrichment_source match
        // (older webhook-written companies pre-date this convention).
      }

      // Fallback: companies created in the run's time window.
      // Pad the upper bound so race-y inserts that ran just after completed_at
      // (e.g. embedding write touching updated_at) still land in scope.
      const fromIso = startedAt;
      const toIso = completedAt
        ? new Date(new Date(completedAt).getTime() + FALLBACK_BUFFER_MS).toISOString()
        : new Date(new Date(startedAt).getTime() + 5 * 60_000).toISOString();

      const { data, error: fetchError } = await supabase
        .from('companies')
        .select('id, name, type, hq_city, hq_country, products_dealt, created_at')
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
        .order('created_at', { ascending: false })
        .limit(5);

      if (cancelled) return;
      if (fetchError) {
        setError(fetchError.message);
        return;
      }
      setCompanies((data ?? []) as LeadPreviewCompany[]);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [supabase, datasetId, startedAt, completedAt]);

  if (error) {
    return (
      <div className={styles.errorState}>
        Couldn&apos;t load this run&apos;s leads — {error}
      </div>
    );
  }

  if (companies === null) {
    const skeletonCount = Math.max(1, Math.min(5, expectedCount || 5));
    return (
      <div className={styles.previewWrapper}>
        <div className={styles.cardGrid}>
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <div
              key={`lead-skel-${i}`}
              className="skeleton"
              style={{ height: SKELETON_HEIGHT }}
              aria-hidden
            />
          ))}
        </div>
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <div className={styles.previewWrapper}>
        <p className={styles.emptyHint}>
          Couldn&apos;t locate the companies created by this run.{' '}
          <Link href="/dashboard/companies" className={styles.allLeadsLink}>
            Browse the full directory →
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className={styles.previewWrapper}>
      <div className={styles.cardGrid}>
        {companies.map((c) => {
          const products = c.products_dealt ?? [];
          const visibleProducts = products.slice(0, 2);
          const extraCount = Math.max(0, products.length - visibleProducts.length);
          const location = [c.hq_city, c.hq_country].filter(Boolean).join(', ');

          return (
            <Link
              key={c.id}
              href={`/dashboard/companies/${c.id}`}
              className={styles.card}
            >
              <h4 className={styles.cardName}>{c.name}</h4>
              <span className={typeBadgeClass(c.type)}>{c.type ?? 'Unknown'}</span>
              <div className={styles.cardGeo}>
                <MapPin size={11} strokeWidth={1.6} aria-hidden />
                <span>{location || 'Location unknown'}</span>
              </div>
              {products.length > 0 && (
                <div className={styles.chipRow}>
                  {visibleProducts.map((p) => (
                    <span key={p} className={styles.chip}>
                      {p}
                    </span>
                  ))}
                  {extraCount > 0 && (
                    <span className={styles.chipMore}>+{extraCount} more</span>
                  )}
                </div>
              )}
            </Link>
          );
        })}
      </div>
      <Link href="/dashboard/search" className={styles.allLeadsLink}>
        View all leads
        <ArrowRight size={13} strokeWidth={1.8} aria-hidden />
      </Link>
    </div>
  );
}

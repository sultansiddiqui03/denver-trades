'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { MapPin, ArrowRight } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import IntentChip from './IntentChip';
import styles from './AgentRunLeadsPreview.module.css';

export interface LeadPreviewCompany {
  id: string;
  name: string;
  type: string | null;
  hq_city: string | null;
  hq_country: string | null;
  products_dealt: string[] | null;
}

interface AgentRunLeadsPreviewProps {
  /** The originating `agent_runs.id` — used as a stable React key by the parent. */
  agentRunId: string;
  /** Raw `agent_runs.error_log` text — parsed for the Apify `dataset <id>` token. */
  errorLog: string | null;
  /** When the run began — fallback bound for older rows missing `enrichment_source`. */
  startedAt: string;
  /** When the run completed — paired with `startedAt` for the timestamp fallback. */
  completedAt: string | null;
}

const SKELETON_HEIGHT = 132;
const SKELETON_COUNT = 5;
// Anything outside this window is almost certainly from another run. Padding
// the upper bound covers race-y inserts that ran just after `completed_at`
// (e.g. an embedding write touching `updated_at`).
const FALLBACK_BUFFER_MS = 60_000;
// Matches "dataset ffeKO5Oq7meoNAXLf" or "dataset: ffeKO5Oq7meoNAXLf"
const DATASET_ID_RE = /dataset(?:\s+|:\s*)([a-zA-Z0-9_-]{10,})/i;

function extractDatasetId(errorLog: string | null): string | null {
  if (!errorLog) return null;
  const match = errorLog.match(DATASET_ID_RE);
  return match?.[1] ?? null;
}

/**
 * Inline drill-down panel that surfaces the 5 companies most likely created by
 * a given Lead Scraper run. Lives under a Success row on `/dashboard/agents`.
 *
 * Lookup strategy:
 *   1. If we can parse a dataset id out of `error_log`, query companies whose
 *      `enrichment_source = 'apify:<datasetId>'` — the canonical bind set by
 *      [src/app/api/webhooks/apify/route.ts](src/app/api/webhooks/apify/route.ts).
 *   2. Otherwise fall back to a time-window query bounded by
 *      `startedAt` and `completedAt + 60s`. Older rows pre-date the
 *      `enrichment_source` convention and only have timestamps to match on.
 *
 * RLS scopes everything to the caller's org automatically — we never need to
 * pass `org_id` from the client.
 *
 * The BUYS / SELLS / BROKER chip styling is inlined here to mirror the same
 * coral / lime / blue palette used in `search/page.module.css`. Once a shared
 * `IntentChip` lands, this can swap to the component without touching the
 * call site.
 */
export default function AgentRunLeadsPreview({
  agentRunId,
  errorLog,
  startedAt,
  completedAt,
}: AgentRunLeadsPreviewProps) {
  const supabase = useMemo(() => createClient(), []);
  const [companies, setCompanies] = useState<LeadPreviewCompany[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const datasetId = useMemo(() => extractDatasetId(errorLog), [errorLog]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function load() {
      setError(null);

      // Primary path: companies created with enrichment_source = 'apify:<dataset>'.
      if (datasetId) {
        const { data, error: fetchError } = await supabase
          .from('companies')
          .select('id, name, type, hq_city, hq_country, products_dealt')
          .eq('enrichment_source', `apify:${datasetId}`)
          .order('created_at', { ascending: false })
          .limit(5)
          .abortSignal(signal);

        if (signal.aborted) return;
        if (fetchError) {
          setError(fetchError.message);
          return;
        }
        if (data && data.length > 0) {
          setCompanies(data as LeadPreviewCompany[]);
          return;
        }
        // Fall through to timestamp fallback when no enrichment_source match.
      }

      // Fallback: companies created in the run's time window. Anchor on
      // `started_at` and stretch the upper bound past `completed_at` so
      // late-arriving inserts still land inside the scope.
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
        .limit(5)
        .abortSignal(signal);

      if (signal.aborted) return;
      if (fetchError) {
        setError(fetchError.message);
        return;
      }
      setCompanies((data ?? []) as LeadPreviewCompany[]);
    }

    void load();

    return () => {
      controller.abort();
    };
  }, [supabase, datasetId, startedAt, completedAt]);

  if (error) {
    return (
      <div
        className={styles.errorState}
        data-agent-run-id={agentRunId}
        role="status"
      >
        Couldn&apos;t load this run&apos;s leads — {error}
      </div>
    );
  }

  if (companies === null) {
    return (
      <div className={styles.previewWrapper} data-agent-run-id={agentRunId}>
        <div className={styles.cardGrid}>
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
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
      <div className={styles.previewWrapper} data-agent-run-id={agentRunId}>
        <p className={styles.emptyHint}>No companies matched this run.</p>
      </div>
    );
  }

  return (
    <div className={styles.previewWrapper} data-agent-run-id={agentRunId}>
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
              <IntentChip type={c.type} />
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

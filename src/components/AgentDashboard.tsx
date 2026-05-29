'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Check, ChevronDown, ChevronRight, RefreshCw, RotateCw, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import EmptyState from '@/components/EmptyState';
import AgentRunLeadsPreview from '@/components/AgentRunLeadsPreview';
import styles from './AgentDashboard.module.css';

interface AgentRun {
  id: string;
  agent_name: string;
  status: string;
  records_processed: number;
  records_created: number;
  started_at: string;
  completed_at: string | null;
  error_log: string | null;
}

type AgentTrigger = 'run' | 'on-demand' | 'webhook';
type AgentStatus = 'Running' | 'Idle' | 'Active';

interface Agent {
  name: string;
  description: string;
  schedule: string;
  status: AgentStatus;
  trigger: AgentTrigger;
  href?: string;
  ctaLabel?: string;
}

interface AgentRunResponse {
  success: boolean;
  mode?: 'live' | 'simulation' | 'idle';
  message?: string;
  error?: string;
  runId?: string;
  navigateTo?: string;
}

interface ReplayResponse {
  success: boolean;
  message?: string;
  error?: string;
  created?: number;
  processed?: number;
  notDeployed?: boolean;
}

const INITIAL_AGENTS: Agent[] = [
  {
    name: 'Lead Scraper Agent',
    description: 'Scrapes trade portals and directories via Apify, enriches each lead with Gemini.',
    schedule: 'Daily at 02:00 UTC',
    status: 'Idle',
    trigger: 'run',
  },
  {
    name: 'WhatsApp Parser Agent',
    description: 'Parses inbound Twilio messages and maps them to ongoing negotiations.',
    schedule: 'Webhook (real-time)',
    status: 'Active',
    trigger: 'webhook',
    href: '/dashboard/outreach',
    ctaLabel: 'Open inbox',
  },
  {
    name: 'Doc Audit Agent',
    description: 'Audits B/L and commercial docs against the active L/C terms.',
    schedule: 'On-demand from Documents',
    status: 'Idle',
    trigger: 'on-demand',
    href: '/dashboard/documents',
    ctaLabel: 'Open documents',
  },
  {
    name: 'Price Ingest Agent',
    description: 'Pulls global price indices for spices, grains, and coffee into the local feed.',
    schedule: 'Every 6 hours',
    status: 'Idle',
    trigger: 'run',
  },
];

const SIM_BANNER_DISMISSED_KEY = 'denver-trades.agents.sim-banner-dismissed';
const ERROR_LOG_TRUNCATE_AT = 400;

/**
 * Lead Scraper source options.
 *
 * Kept in sync with `SCRAPER_ACTORS` in src/lib/agents/scraperActors.ts. The
 * server-side zod schema in /api/agents/run validates against the same set,
 * so a typo here would surface as a 400 (defence in depth — but lockstep
 * still preferred over runtime divergence).
 *
 * Default is the empty-string sentinel — when chosen, the backend falls
 * through to `APIFY_ACTOR_ID` env var → code default (Google Maps). That keeps
 * the existing zero-cost behaviour for users who never touch this dropdown.
 */
const SCRAPER_SOURCE_KEY = 'denver-trades.agents.scraper-source';
// Customer-facing labels/hints only — NO internal cost or vendor codenames.
// The `value` strings are the real Apify actor ids (validated server-side in
// /api/agents/run + persisted in localStorage), so they must stay verbatim;
// only the display label/hint are cosmetic and safe to reword.
const SCRAPER_SOURCE_OPTIONS: {
  value: string;
  label: string;
  hint: string;
}[] = [
  {
    value: '',
    label: 'Business directory',
    hint: 'Broad coverage — company names, websites, phone, and location.',
  },
  {
    value: 'zen-studio~importyeti-scraper',
    label: 'Customs & shipment data',
    hint: 'Verified shipment records with HS codes and top trading partners.',
  },
];
// NOTE: the lulzasaur company/shipments actors are intentionally NOT offered
// here. Their "shipments" mode treats the query as a COMPANY-NAME slug, so a
// product search like "rice exporters in usa" returns "no records" — exactly the
// dead-end users hit. They remain registered in SCRAPER_ACTORS for programmatic
// company-name lookups, but the user-facing picker keeps only the two paths that
// reliably work on a product/keyword search. To find BUYERS of a product, use
// the "Discover buyers from customs" panel on Buyer Match (the discovery engine).
// Matches "dataset ffeKO5Oq7meoNAXLf" or "dataset: ffeKO5Oq7meoNAXLf"
const DATASET_ID_RE = /dataset(?:\s+|:\s*)([a-zA-Z0-9_-]{10,})/i;

function extractDatasetId(errorLog: string | null | undefined): string | null {
  if (!errorLog) return null;
  const match = errorLog.match(DATASET_ID_RE);
  return match?.[1] ?? null;
}

function truncateErrorLog(message: string): { text: string; truncated: boolean } {
  if (message.length <= ERROR_LOG_TRUNCATE_AT) {
    return { text: message, truncated: false };
  }
  return { text: `${message.slice(0, ERROR_LOG_TRUNCATE_AT)}…`, truncated: true };
}

export default function AgentDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const { toast } = useToast();
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [hasFetched, setHasFetched] = useState(false);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [scraperQuery, setScraperQuery] = useState('Spice exporters in Vietnam');
  // Per-run actor override. Empty string = let the server default (env or
  // code) win. Hydrated from localStorage so the picker is sticky across
  // refreshes. Lazy initializer keeps SSR happy.
  const [scraperSource, setScraperSource] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      return window.localStorage.getItem(SCRAPER_SOURCE_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const sourcePickerRef = useRef<HTMLDivElement | null>(null);
  const [simulationActive, setSimulationActive] = useState(false);
  // Lazy initializer reads localStorage on the first client render so we don't
  // need an extra effect (which the codebase's lint rule rejects).
  const [simBannerDismissed, setSimBannerDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(SIM_BANNER_DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [replayingRunId, setReplayingRunId] = useState<string | null>(null);
  const [pendingReplay, setPendingReplay] = useState<AgentRun | null>(null);
  // Only one inline leads-preview at a time so the table never stacks.
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  // Track which rows we've ever opened so the inner preview stays mounted
  // across collapse → the row's grid-row transition can run to completion
  // without the children vanishing mid-flight, and re-opening is instant.
  const [touchedRunIds, setTouchedRunIds] = useState<Set<string>>(() => new Set());

  const handleToggleExpand = useCallback((runId: string) => {
    setExpandedRunId((cur) => (cur === runId ? null : runId));
    setTouchedRunIds((cur) => {
      if (cur.has(runId)) return cur;
      const next = new Set(cur);
      next.add(runId);
      return next;
    });
  }, []);

  const dismissSimBanner = useCallback(() => {
    setSimBannerDismissed(true);
    try {
      window.localStorage.setItem(SIM_BANNER_DISMISSED_KEY, '1');
    } catch {
      // Ignore.
    }
  }, []);

  // Close the source-picker dropdown on outside click / Escape.
  useEffect(() => {
    if (!sourcePickerOpen) return;
    const onDocPointer = (e: MouseEvent) => {
      if (!sourcePickerRef.current) return;
      if (sourcePickerRef.current.contains(e.target as Node)) return;
      setSourcePickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSourcePickerOpen(false);
    };
    window.addEventListener('mousedown', onDocPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDocPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [sourcePickerOpen]);

  const fetchRuns = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('agent_runs')
        .select('id, agent_name, status, records_processed, records_created, started_at, completed_at, error_log')
        .order('started_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setRuns((data ?? []) as AgentRun[]);
    } catch (err) {
      console.error('Error fetching agent runs:', err);
    } finally {
      setHasFetched(true);
    }
  }, [supabase]);

  useEffect(() => {
    const fetchTimer = window.setTimeout(() => {
      void fetchRuns();
    }, 0);

    const channel = supabase
      .channel('agent-runs-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'agent_runs' },
        () => {
          fetchRuns();
        }
      )
      .subscribe();

    const interval = setInterval(() => {
      fetchRuns();
    }, 30000);

    return () => {
      window.clearTimeout(fetchTimer);
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fetchRuns, supabase]);

  const handleRunAgent = async (agentName: string) => {
    setTriggering(agentName);
    setAgents((prev) =>
      prev.map((a) => (a.name === agentName ? { ...a, status: 'Running' } : a))
    );

    try {
      // Lead Scraper accepts an optional `actorId` override so the user can
      // pick "ImportYeti" or "Google Maps" per run from the source dropdown.
      // Empty string → don't send (server defaults to env or code default).
      const requestBody: Record<string, unknown> = {
        agentName,
        query: agentName === 'Lead Scraper Agent' ? scraperQuery : undefined,
      };
      if (agentName === 'Lead Scraper Agent' && scraperSource) {
        requestBody.actorId = scraperSource;
      }

      const res = await fetch('/api/agents/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const data = (await res.json()) as AgentRunResponse;

      if (!res.ok || !data.success) {
        throw new Error(data.error || `Failed to trigger agent (${res.status})`);
      }

      const mode = data.mode;
      if (mode === 'simulation') {
        setSimulationActive(true);
        // Re-show the banner on a fresh simulation event even if previously dismissed.
        setSimBannerDismissed(false);
        try {
          window.localStorage.removeItem(SIM_BANNER_DISMISSED_KEY);
        } catch {
          // Ignore.
        }
        toast(
          data.message || `${agentName} ran in simulation mode — API key missing`,
          'warning'
        );
      } else if (mode === 'idle') {
        toast(data.message || `${agentName} has nothing to process right now`, 'info');
      } else {
        toast(data.message || `${agentName} completed`, 'success');
      }

      await fetchRuns();
    } catch (err) {
      console.error('Error running agent:', err);
      toast(err instanceof Error ? err.message : `${agentName} failed to run`, 'error');
    } finally {
      setAgents((prev) =>
        prev.map((a) =>
          a.name === agentName
            ? { ...a, status: a.trigger === 'webhook' ? 'Active' : 'Idle' }
            : a
        )
      );
      setTriggering(null);
    }
  };

  const handleConfirmReplay = async () => {
    if (!pendingReplay) return;
    const run = pendingReplay;
    setPendingReplay(null);
    setReplayingRunId(run.id);

    try {
      const res = await fetch('/api/agents/replay-apify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentRunId: run.id }),
      });

      const data = (await res.json().catch(() => null)) as ReplayResponse | null;

      if (!res.ok || !data?.success) {
        const errMessage =
          data?.error ||
          (res.status === 503
            ? 'Replay endpoint is not deployed yet — try again later.'
            : `Replay failed (${res.status})`);
        throw new Error(errMessage);
      }

      const createdCount = typeof data.created === 'number' ? data.created : null;
      const message =
        data.message ||
        (createdCount !== null
          ? `Replay enqueued — ${createdCount} companies created`
          : 'Replay enqueued.');
      toast(message, 'success');
      await fetchRuns();
    } catch (err) {
      console.error('Error replaying Apify run:', err);
      toast(err instanceof Error ? err.message : 'Replay failed', 'error');
    } finally {
      setReplayingRunId(null);
    }
  };

  const renderAction = (agent: Agent) => {
    if (agent.trigger === 'run') {
      return (
        <button
          type="button"
          className={styles.runBtn}
          onClick={() => handleRunAgent(agent.name)}
          disabled={triggering !== null}
        >
          {agent.status === 'Running' ? 'Running…' : 'Run now'}
        </button>
      );
    }

    return (
      <Link href={agent.href ?? '/dashboard'} className={styles.runBtn} aria-label={agent.ctaLabel}>
        {agent.ctaLabel ?? 'Open'} →
      </Link>
    );
  };

  const showSimBanner = simulationActive && !simBannerDismissed;

  return (
    <div className={styles.container}>
      {showSimBanner && (
        <div className={styles.simulationBanner} role="status">
          <AlertCircle size={18} strokeWidth={2} className={styles.bannerIcon} aria-hidden />
          <div className={styles.bannerCopy}>
            <strong>Lead Scraper running in simulation mode</strong> — set{' '}
            <code>APIFY_TOKEN</code> in Vercel env for live scraping.
          </div>
          <button
            type="button"
            className={styles.bannerDismiss}
            onClick={dismissSimBanner}
            aria-label="Dismiss simulation banner"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>
      )}

      <div className={styles.deckGrid}>
        {agents.map((agent) => (
          <div key={agent.name} className={styles.agentCard}>
            <div className={styles.cardHeader}>
              <h3 className={styles.title}>{agent.name}</h3>
              <span className={`${styles.statusBadge} ${styles[agent.status.toLowerCase()]}`}>
                {agent.status}
              </span>
            </div>
            <p className={styles.description}>{agent.description}</p>

            {agent.name === 'Lead Scraper Agent' && (
              <>
                <div className={styles.queryField}>
                  <label htmlFor="scraper-query" className={styles.queryLabel}>
                    Scraping query
                  </label>
                  <input
                    id="scraper-query"
                    type="text"
                    className={styles.queryInput}
                    value={scraperQuery}
                    onChange={(e) => setScraperQuery(e.target.value)}
                    placeholder="e.g. spice exporters in Vietnam"
                    disabled={triggering !== null}
                  />
                </div>
                <div className={styles.queryField}>
                  <span className={styles.queryLabel} id="scraper-source-label">
                    Data source
                  </span>
                  {(() => {
                    const activeOpt =
                      SCRAPER_SOURCE_OPTIONS.find((o) => o.value === scraperSource) ??
                      SCRAPER_SOURCE_OPTIONS[0];
                    return (
                      <div
                        className={styles.sourcePicker}
                        ref={sourcePickerRef}
                      >
                        <button
                          type="button"
                          className={`${styles.sourcePickerTrigger} ${sourcePickerOpen ? styles.sourcePickerOpen : ''}`}
                          aria-haspopup="listbox"
                          aria-expanded={sourcePickerOpen}
                          aria-labelledby="scraper-source-label"
                          disabled={triggering !== null}
                          onClick={() => setSourcePickerOpen((v) => !v)}
                        >
                          <span className={styles.sourcePickerLabel}>
                            <span className={styles.sourcePickerLabelText}>
                              {activeOpt.label}
                            </span>
                            <span className={styles.sourcePickerLabelHint}>
                              {activeOpt.hint}
                            </span>
                          </span>
                          <ChevronDown
                            size={16}
                            strokeWidth={1.8}
                            aria-hidden
                            className={`${styles.sourcePickerChevron} ${sourcePickerOpen ? styles.sourcePickerChevronOpen : ''}`}
                          />
                        </button>
                        {sourcePickerOpen ? (
                          <ul
                            className={styles.sourcePickerMenu}
                            role="listbox"
                            aria-labelledby="scraper-source-label"
                          >
                            {SCRAPER_SOURCE_OPTIONS.map((opt) => {
                              const selected = opt.value === scraperSource;
                              return (
                                <li
                                  key={opt.value || 'default'}
                                  role="option"
                                  aria-selected={selected}
                                >
                                  <button
                                    type="button"
                                    className={`${styles.sourcePickerOption} ${selected ? styles.sourcePickerOptionSelected : ''}`}
                                    onClick={() => {
                                      setScraperSource(opt.value);
                                      try {
                                        if (opt.value) {
                                          window.localStorage.setItem(
                                            SCRAPER_SOURCE_KEY,
                                            opt.value
                                          );
                                        } else {
                                          window.localStorage.removeItem(SCRAPER_SOURCE_KEY);
                                        }
                                      } catch {
                                        // localStorage may be unavailable (private mode); ignore.
                                      }
                                      setSourcePickerOpen(false);
                                    }}
                                  >
                                    <span className={styles.sourcePickerOptionMain}>
                                      <span className={styles.sourcePickerOptionLabel}>
                                        {opt.label}
                                      </span>
                                      <span className={styles.sourcePickerOptionHint}>
                                        {opt.hint}
                                      </span>
                                    </span>
                                    {selected ? (
                                      <Check
                                        size={16}
                                        strokeWidth={2.2}
                                        aria-hidden
                                        className={styles.sourcePickerCheck}
                                      />
                                    ) : null}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        ) : null}
                      </div>
                    );
                  })()}
                </div>
              </>
            )}

            <div className={styles.metaRow}>
              <span className={styles.schedule}>{agent.schedule}</span>
              {renderAction(agent)}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.historySection}>
        <div className={styles.historyHeader}>
          <h3>Run history</h3>
          <button type="button" className={styles.refreshBtn} onClick={fetchRuns}>
            <RefreshCw size={14} strokeWidth={2} aria-hidden />
            Refresh
          </button>
        </div>

        {!hasFetched ? (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Status</th>
                  <th>Processed</th>
                  <th>Created</th>
                  <th>Started</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 3 }).map((_, i) => (
                  <tr key={`skeleton-${i}`} aria-busy="true">
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j}>
                        <span
                          className={`skeleton ${j === 0 ? styles.skelCellFirst : styles.skelCell}`}
                          aria-hidden
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : runs.length === 0 ? (
          <EmptyState
            title="No agent runs yet"
            description="Trigger an agent above to see run logs, processed counts, and any errors."
          />
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Status</th>
                  <th>Processed</th>
                  <th>Created</th>
                  <th>Started</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => {
                  const isLeadScraper = run.agent_name === 'Lead Scraper Agent';
                  const isFailed = run.status === 'Failed';
                  const isSuccess = run.status === 'Success';
                  const datasetId = extractDatasetId(run.error_log);
                  const canReplay = isFailed && isLeadScraper && datasetId;
                  // Expandable inline leads preview only makes sense for Lead Scraper
                  // success rows that actually produced companies. Webhook ingestion
                  // currently writes `records_created` in real time, so non-zero
                  // means we have something to surface.
                  const canExpand = isSuccess && isLeadScraper && run.records_created > 0;
                  const isExpanded = canExpand && expandedRunId === run.id;
                  const ChevronIcon = isExpanded ? ChevronDown : ChevronRight;

                  return (
                    <React.Fragment key={run.id}>
                      <tr className={isExpanded ? styles.rowExpanded : undefined}>
                        <td className={styles.agentNameCell}>
                          <div className={styles.agentNameStack}>
                            <span>{run.agent_name}</span>
                            {isSuccess && isLeadScraper && datasetId && (
                              <span
                                className={styles.datasetChip}
                                title={`Apify dataset ${datasetId}`}
                              >
                                Apify: {datasetId.slice(0, 8)}…
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className={`${styles.statusBadge} ${styles[run.status.toLowerCase()]}`}>
                            {run.status}
                          </span>
                        </td>
                        <td>{run.records_processed} items</td>
                        <td>+{run.records_created} leads</td>
                        <td className={styles.dateCell}>
                          {new Date(run.started_at).toLocaleString()}
                        </td>
                        <td className={styles.detailCell}>
                          <div className={styles.detailLayout}>
                            <div className={styles.detailMain}>
                              {isFailed && run.error_log ? (
                                <div className={styles.failedDetail}>
                                  <details className={styles.errorDetails}>
                                    <summary className={styles.errorSummary}>
                                      <AlertCircle
                                        size={14}
                                        strokeWidth={2}
                                        className={styles.errorSummaryIcon}
                                        aria-hidden
                                      />
                                      <span>View error</span>
                                    </summary>
                                    <pre className={styles.errorBlock}>
                                      {truncateErrorLog(run.error_log).text}
                                    </pre>
                                  </details>
                                  {canReplay && (
                                    <button
                                      type="button"
                                      className={styles.replayBtn}
                                      onClick={() => setPendingReplay(run)}
                                      disabled={replayingRunId !== null}
                                      title="Re-run Gemini enrichment against the existing Apify dataset"
                                    >
                                      <RotateCw
                                        size={13}
                                        strokeWidth={2}
                                        className={
                                          replayingRunId === run.id ? styles.replaySpin : undefined
                                        }
                                        aria-hidden
                                      />
                                      {replayingRunId === run.id ? 'Replaying…' : 'Replay'}
                                    </button>
                                  )}
                                </div>
                              ) : run.completed_at ? (
                                <span className={styles.dateCell}>
                                  finished {new Date(run.completed_at).toLocaleTimeString()}
                                </span>
                              ) : (
                                <span className={styles.dateCell}>running…</span>
                              )}
                            </div>
                            {canExpand && (
                              <button
                                type="button"
                                className={styles.expandBtn}
                                onClick={() => handleToggleExpand(run.id)}
                                aria-expanded={isExpanded}
                                aria-controls={`agent-run-leads-${run.id}`}
                                title={isExpanded ? 'Hide leads' : 'Show leads from this run'}
                              >
                                <ChevronIcon size={16} strokeWidth={2} aria-hidden />
                                <span>{isExpanded ? 'Hide' : 'View'} leads</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {canExpand && (
                        <tr
                          id={`agent-run-leads-${run.id}`}
                          className={`${styles.leadsRow} ${
                            isExpanded ? styles.leadsRowOpen : ''
                          }`}
                          aria-hidden={!isExpanded}
                        >
                          <td colSpan={6} className={styles.leadsCell}>
                            <div className={styles.leadsInner}>
                              <div>
                                {touchedRunIds.has(run.id) && (
                                  <AgentRunLeadsPreview
                                    agentRunId={run.id}
                                    errorLog={run.error_log}
                                    startedAt={run.started_at}
                                    completedAt={run.completed_at}
                                  />
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pendingReplay && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="replay-modal-title"
          onClick={() => setPendingReplay(null)}
        >
          <div
            className={styles.modalCard}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h3 id="replay-modal-title" className={styles.modalTitle}>
                Replay Apify enrichment?
              </h3>
              <button
                type="button"
                className={styles.modalDismiss}
                onClick={() => setPendingReplay(null)}
                aria-label="Cancel"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            <p className={styles.modalBody}>
              This re-runs Gemini enrichment + ingestion against the existing Apify dataset. New
              companies may be created, but the previously failed run record stays intact.
              Continue?
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalCancelBtn}
                onClick={() => setPendingReplay(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.modalConfirmBtn}
                onClick={handleConfirmReplay}
              >
                Replay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

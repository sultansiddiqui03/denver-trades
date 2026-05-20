'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import EmptyState from '@/components/EmptyState';
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
}

const INITIAL_AGENTS: Agent[] = [
  {
    name: 'Lead Scraper Agent',
    description: 'Scrapes trade portals & directories using Apify and enriches leads via Gemini.',
    schedule: 'Daily at 02:00 AM UTC',
    status: 'Idle',
    trigger: 'run',
  },
  {
    name: 'WhatsApp Parser Agent',
    description: 'Processes incoming customer transcripts via Twilio and maps negotiations.',
    schedule: 'Real-time webhook trigger',
    status: 'Active',
    trigger: 'webhook',
    href: '/dashboard/outreach',
    ctaLabel: 'Open Inbox',
  },
  {
    name: 'Doc Audit Agent',
    description: 'Audits Bills of Lading and commercial documents against active Letters of Credit.',
    schedule: 'On-demand via Documents page',
    status: 'Idle',
    trigger: 'on-demand',
    href: '/dashboard/documents',
    ctaLabel: 'Open Documents',
  },
  {
    name: 'Price Ingest Agent',
    description: 'Ingests global market pricing indices (spices, grains, coffee) to local feed.',
    schedule: 'Every 6 hours',
    status: 'Idle',
    trigger: 'run',
  },
];

export default function AgentDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const { toast } = useToast();
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [scraperQuery, setScraperQuery] = useState('Spice exporters in Vietnam');
  const [simulationActive, setSimulationActive] = useState(false);

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
      const res = await fetch('/api/agents/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentName,
          query: agentName === 'Lead Scraper Agent' ? scraperQuery : undefined,
        }),
      });

      const data = (await res.json()) as AgentRunResponse;

      if (!res.ok || !data.success) {
        throw new Error(data.error || `Failed to trigger agent (${res.status})`);
      }

      const mode = data.mode;
      if (mode === 'simulation') {
        setSimulationActive(true);
        toast(
          data.message || `${agentName} completed in simulation mode (API key missing).`,
          'warning'
        );
      } else if (mode === 'idle') {
        toast(data.message || `${agentName} has no work to do right now.`, 'info');
      } else {
        toast(data.message || `${agentName} completed.`, 'success');
      }

      await fetchRuns();
    } catch (err) {
      console.error('Error running agent:', err);
      toast(err instanceof Error ? err.message : `${agentName} failed to execute`, 'error');
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

  const renderAction = (agent: Agent) => {
    if (agent.trigger === 'run') {
      return (
        <button
          type="button"
          className={styles.runBtn}
          onClick={() => handleRunAgent(agent.name)}
          disabled={triggering !== null}
        >
          {agent.status === 'Running' ? 'Processing…' : 'Run Agent Now'}
        </button>
      );
    }

    return (
      <Link href={agent.href ?? '/dashboard'} className={styles.runBtn} aria-label={agent.ctaLabel}>
        {agent.ctaLabel ?? 'Open'} →
      </Link>
    );
  };

  return (
    <div className={styles.container}>
      {simulationActive && (
        <div className={styles.simulationBanner} role="status">
          <strong>Simulation mode active.</strong> Lead Scraper is using mock data because{' '}
          <code>APIFY_TOKEN</code> is not set in this environment. Add it in Vercel project
          settings to enable live scraping.
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
              <div className={styles.queryField}>
                <label htmlFor="scraper-query" className={styles.queryLabel}>
                  Scraping Query
                </label>
                <input
                  id="scraper-query"
                  type="text"
                  className={styles.queryInput}
                  value={scraperQuery}
                  onChange={(e) => setScraperQuery(e.target.value)}
                  placeholder="e.g. Spice exporters in Vietnam"
                  disabled={triggering !== null}
                />
              </div>
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
          <h3>Audit Logs &amp; Run History</h3>
          <button type="button" className={styles.refreshBtn} onClick={fetchRuns}>
            Refresh Logs
          </button>
        </div>

        {runs.length === 0 ? (
          <EmptyState
            title="No Agent Runs Yet"
            description="Trigger an agent above to see execution logs, processing stats, and lead creation results."
          />
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Agent Name</th>
                  <th>Status</th>
                  <th>Processed</th>
                  <th>Created/Updated</th>
                  <th>Execution Started</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td className={styles.agentNameCell}>{run.agent_name}</td>
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
                      {run.error_log ? (
                        <span className={styles.errorText} title={run.error_log}>
                          {run.error_log.length > 60
                            ? `${run.error_log.slice(0, 60)}…`
                            : run.error_log}
                        </span>
                      ) : run.completed_at ? (
                        <span className={styles.dateCell}>
                          finished {new Date(run.completed_at).toLocaleTimeString()}
                        </span>
                      ) : (
                        <span className={styles.dateCell}>in flight…</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

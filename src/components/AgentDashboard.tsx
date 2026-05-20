'use client';

import React, { useState, useEffect } from 'react';
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
  error_log: string | null;
}

interface Agent {
  name: string;
  description: string;
  schedule: string;
  status: 'Running' | 'Idle' | 'Active';
}

export default function AgentDashboard() {
  const supabase = createClient();
  const { toast } = useToast();
  const [agents, setAgents] = useState<Agent[]>([
    {
      name: 'Lead Scraper Agent',
      description: 'Scrapes trade portals & directories using Apify and enriches leads via Gemini.',
      schedule: 'Daily at 02:00 AM UTC',
      status: 'Idle'
    },
    {
      name: 'WhatsApp Parser Agent',
      description: 'Processes incoming customer transcripts via Twilio and maps negotiations.',
      schedule: 'Real-time Webhook trigger',
      status: 'Active'
    },
    {
      name: 'Doc Audit Agent',
      description: 'Audits Bills of Lading and commercial documents against active Letters of Credit.',
      schedule: 'On-demand API trigger',
      status: 'Idle'
    },
    {
      name: 'Price Ingest Agent',
      description: 'Ingests global market pricing indices (spices, grains, coffee) to local feed.',
      schedule: 'Every 6 hours',
      status: 'Idle'
    }
  ]);

  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [scraperQuery, setScraperQuery] = useState('Spice exporters in Vietnam');

  const fetchRuns = async () => {
    try {
      const { data, error } = await supabase
        .from('agent_runs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setRuns(data || []);
    } catch (err) {
      console.error('Error fetching agent runs:', err);
    }
  };

  useEffect(() => {
    fetchRuns();

    // Auto-refresh runs log history every 5 seconds to track active background runs
    const interval = setInterval(() => {
      fetchRuns();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const handleRunAgent = async (agentName: string) => {
    setTriggering(agentName);
    
    // Update local agent state to running
    setAgents(prev => prev.map(a => a.name === agentName ? { ...a, status: 'Running' } : a));

    try {
      const res = await fetch('/api/agents/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          agentName,
          query: agentName === 'Lead Scraper Agent' ? scraperQuery : undefined
        })
      });

      if (!res.ok) {
        throw new Error(`Failed to trigger agent: ${await res.text()}`);
      }

      await fetchRuns();
      toast(`${agentName} completed successfully`, 'success');
    } catch (err) {
      console.error('Error running agent:', err);
      toast(`${agentName} failed to execute`, 'error');
    } finally {
      // Revert status to Idle/Active
      setAgents(prev => prev.map(a => 
        a.name === agentName 
          ? { ...a, status: agentName.includes('WhatsApp') ? 'Active' : 'Idle' } 
          : a
      ));
      setTriggering(null);
    }
  };

  return (
    <div className={styles.container}>
      {/* Agent control deck grid */}
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
            
            {/* Dynamic query input field for scraper agent */}
            {agent.name === 'Lead Scraper Agent' && (
              <div style={{ marginBottom: 'var(--space-4)', marginTop: '-8px' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Scraping Query
                </label>
                <input
                  type="text"
                  value={scraperQuery}
                  onChange={(e) => setScraperQuery(e.target.value)}
                  placeholder="e.g., Spice exporters in Vietnam"
                  disabled={triggering !== null}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.8125rem',
                    transition: 'border-color 0.2s ease',
                    outline: 'none'
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--accent-color)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border-color)'}
                />
              </div>
            )}

            <div className={styles.metaRow}>
              <span className={styles.schedule}>🕒 {agent.schedule}</span>
              <button
                type="button"
                className={styles.runBtn}
                onClick={() => handleRunAgent(agent.name)}
                disabled={triggering !== null}
              >
                {agent.status === 'Running' ? 'Processing...' : 'Run Agent Now'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* History table */}
      <div className={styles.historySection}>
        <div className={styles.historyHeader}>
          <h3>Audit Logs & Run History</h3>
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

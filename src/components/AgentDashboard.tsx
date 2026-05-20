'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
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
  }, []);

  const handleRunAgent = async (agentName: string) => {
    setTriggering(agentName);
    
    // Update local agent state to running
    setAgents(prev => prev.map(a => a.name === agentName ? { ...a, status: 'Running' } : a));

    try {
      const orgId = 'd3b07384-d113-4e4e-9c8e-5b123d456789';
      
      // 1. Insert "Running" agent run into DB
      const { data: runRecord, error: insertError } = await supabase
        .from('agent_runs')
        .insert({
          org_id: orgId,
          agent_name: agentName,
          status: 'Running',
          records_processed: 0,
          records_created: 0
        })
        .select()
        .single();

      if (insertError) throw insertError;
      await fetchRuns();

      // 2. Simulate 2.5 seconds processing lag
      await new Promise(resolve => setTimeout(resolve, 2500));

      const processed = Math.floor(Math.random() * 45) + 5;
      const created = Math.floor(Math.random() * 4) + 1;

      // 3. Update agent run to "Success"
      await supabase
        .from('agent_runs')
        .update({
          status: 'Success',
          records_processed: processed,
          records_created: created,
          completed_at: new Date().toISOString()
        })
        .eq('id', runRecord.id);

      // If Lead Scraper run, insert a simulated company for visual wow!
      if (agentName === 'Lead Scraper Agent') {
        const randId = Math.floor(Math.random() * 1000);
        await supabase
          .from('companies')
          .insert({
            org_id: orgId,
            name: `Indo-Global Spices PT #${randId}`,
            type: 'Exporter',
            hq_country: 'Indonesia',
            hq_city: 'Jakarta',
            products_dealt: ['Coriander Seeds', 'Nutmeg wholes', 'Black Pepper'],
            description: 'Discovered via automated Lead Scraper search scan. Specializes in organic spice processing.',
            is_enriched: true,
            confidence_score: 0.94
          });
      }

      await fetchRuns();
    } catch (err) {
      console.error('Error running agent:', err);
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
          <div className={styles.emptyTable}>
            <p>No agent run logs found. Trigger an agent run above to populate logs.</p>
          </div>
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

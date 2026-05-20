'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import { exportToCsv } from '@/lib/exportCsv';
import styles from './page.module.css';

interface Deal {
  id: string;
  companyName: string;
  value: string;
  products: string[];
  stage: 'Discovery' | 'Outreach' | 'Negotiation' | 'Audit' | 'Closed';
}

interface PipelineRow {
  id: string;
  title: string | null;
  value_usd: number | string | null;
  product: string | null;
  stage: string | null;
  companies:
    | {
        name: string | null;
      }
    | {
        name: string | null;
      }[]
    | null;
}

const initialDeals: Deal[] = [
  {
    id: 'deal-1',
    companyName: 'Al-Rashid Foodstuff Trading LLC',
    value: '$240,000',
    products: ['Black Pepper 550 ASTA'],
    stage: 'Negotiation',
  },
  {
    id: 'deal-2',
    companyName: 'Gulf Spices & Seeds Industry',
    value: '$85,000',
    products: ['Coriander Seeds'],
    stage: 'Discovery',
  },
  {
    id: 'deal-3',
    companyName: 'EuroFoods Import GmbH',
    value: '$410,000',
    products: ['Jasmine Rice'],
    stage: 'Outreach',
  },
  {
    id: 'deal-4',
    companyName: 'Cairo Trading House',
    value: '$120,000',
    products: ['Sesame Seeds'],
    stage: 'Audit',
  },
  {
    id: 'deal-5',
    companyName: 'Sinar Agro Nusantara',
    value: '$350,000',
    products: ['Cloves', 'Nutmeg'],
    stage: 'Closed',
  },
];

const stages: { label: string; key: Deal['stage'] }[] = [
  { label: 'Discovery', key: 'Discovery' },
  { label: 'Outreach', key: 'Outreach' },
  { label: 'Negotiation', key: 'Negotiation' },
  { label: 'Documents Audit', key: 'Audit' },
  { label: 'Closed / Won', key: 'Closed' },
];

const mapDbToUiStage = (dbStage: string | null): Deal['stage'] => {
  const s = (dbStage || '').trim().toLowerCase();
  if (s.includes('discovery') || s.includes('new')) return 'Discovery';
  if (s.includes('outreach')) return 'Outreach';
  if (s.includes('negotiation')) return 'Negotiation';
  if (s.includes('audit')) return 'Audit';
  if (s.includes('closed') || s.includes('won')) return 'Closed';
  return 'Discovery';
};

export default function KanbanPipeline() {
  const supabase = useMemo(() => createClient(), []);
  const { toast } = useToast();
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const [loading, setLoading] = useState(false);
  const [savingState, setSavingState] = useState<string | null>(null);

  const fetchDeals = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('deals_pipeline')
        .select(`
          id,
          title,
          value_usd,
          product,
          stage,
          companies (
            name
          )
        `);

      if (error) throw error;

      if (data && data.length > 0) {
        const mapped: Deal[] = (data as unknown as PipelineRow[]).map((d) => {
          const company = Array.isArray(d.companies) ? d.companies[0] : d.companies;

          return {
            id: d.id,
            companyName: company?.name || d.title || 'Unknown Buyer',
            value: `$${Number(d.value_usd || 0).toLocaleString()}`,
            products: [d.product || 'Agricultural commodities'],
            stage: mapDbToUiStage(d.stage),
          };
        });
        setDeals(mapped);
      }
    } catch (err) {
      console.warn('Database fetch warning, falling back to demo state:', err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchDeals();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchDeals]);

  const moveDeal = async (id: string, direction: 'forward' | 'backward') => {
    const currentDeal = deals.find((d) => d.id === id);
    if (!currentDeal) return;

    const currentIdx = stages.findIndex((s) => s.key === currentDeal.stage);
    let nextIdx = currentIdx + (direction === 'forward' ? 1 : -1);
    if (nextIdx < 0) nextIdx = 0;
    if (nextIdx >= stages.length) nextIdx = stages.length - 1;
    const nextStage = stages[nextIdx].key;

    // Optimistic Update
    setDeals((prev) =>
      prev.map((deal) => (deal.id === id ? { ...deal, stage: nextStage } : deal))
    );

    setSavingState('Saving changes...');

    // Persist stage update in Supabase
    try {
      const { error } = await supabase
        .from('deals_pipeline')
        .update({ stage: nextStage })
        .eq('id', id);

      if (error) throw error;
      setSavingState('Changes saved!');
      toast(`Deal moved to ${nextStage}`, 'success');
      setTimeout(() => setSavingState(null), 2000);
    } catch (err) {
      console.error('Failed to sync pipeline update:', err);
      setSavingState('Connection offline. Saved locally.');
      setTimeout(() => setSavingState(null), 3000);
    }
  };

  const getDealsByStage = (stage: Deal['stage']) => {
    return deals.filter((deal) => deal.stage === stage);
  };

  const calculateTotalValue = (stage: Deal['stage']) => {
    const stageDeals = getDealsByStage(stage);
    const sum = stageDeals.reduce((total, deal) => {
      const val = parseInt(deal.value.replace(/[^0-9]/g, ''), 10);
      return total + (isNaN(val) ? 0 : val);
    }, 0);
    return `$${(sum / 1000).toFixed(0)}k`;
  };

  return (
    <div className={`${styles.pipelineContainer} fade-in`}>
      {/* Header */}
      <div className={styles.pipelineHeader}>
        <div>
          <h1 className={styles.pipelineTitle}>Trade Pipeline</h1>
          <p className="text-secondary" style={{ fontSize: '0.875rem' }}>
            Manage active shipments, buyer negotiations, and audit checklists.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            className="btn-secondary"
            style={{ fontSize: '0.75rem', padding: '6px 12px' }}
            onClick={() => {
              if (deals.length === 0) return;
              exportToCsv('denver-trades-pipeline', deals.map(d => ({
                Company: d.companyName,
                Stage: d.stage,
                Value: d.value,
                Products: d.products.join('; '),
              })));
              toast(`Exported ${deals.length} deals to CSV`, 'success');
            }}
          >
            ↓ Export CSV
          </button>
          {savingState && (
            <div className={styles.savingStateBadge}>
              <span className={styles.pulse}></span> {savingState}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className={styles.loadingSpinner}>
          <p>Connecting to Live Trades Database...</p>
        </div>
      ) : (
        /* Board wrapper */
        <div className={styles.boardWrapper}>
          {stages.map((stage) => {
            const stageDeals = getDealsByStage(stage.key);
            return (
              <div key={stage.key} className={styles.column}>
                <div className={styles.columnHeader}>
                  <div>
                    <h3 className={styles.columnTitle}>{stage.label}</h3>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Value: {calculateTotalValue(stage.key)}
                    </span>
                  </div>
                  <span className={styles.dealCountBadge}>{stageDeals.length}</span>
                </div>

                <div className={styles.cardList}>
                  {stageDeals.map((deal) => (
                    <div key={deal.id} className={styles.dealCard}>
                      <h4 className={styles.dealCardTitle}>{deal.companyName}</h4>
                      <span className={styles.dealCardProducts}>
                        {deal.products.join(', ')}
                      </span>

                      <div className={styles.dealCardFooter}>
                        <span className={styles.dealValue}>{deal.value}</span>
                        <div className={styles.dealMoveActions}>
                          <button
                            type="button"
                            className={styles.moveBtn}
                            onClick={() => moveDeal(deal.id, 'backward')}
                            disabled={stage.key === 'Discovery'}
                            style={{ opacity: stage.key === 'Discovery' ? 0.3 : 1 }}
                          >
                            ◀
                          </button>
                          <button
                            type="button"
                            className={styles.moveBtn}
                            onClick={() => moveDeal(deal.id, 'forward')}
                            disabled={stage.key === 'Closed'}
                            style={{ opacity: stage.key === 'Closed' ? 0.3 : 1 }}
                          >
                            ▶
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {stageDeals.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                      No active deals
                    </div>
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

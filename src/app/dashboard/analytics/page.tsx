'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import styles from './page.module.css';
import type { StagePoint } from '@/components/charts/DealsBarChart';
import type { CountryPoint } from '@/components/charts/CountriesPieChart';

// Lazy-load recharts: ~140KB of bundle weight only ships when this page renders.
const DealsBarChart = dynamic(() => import('@/components/charts/DealsBarChart'), {
  ssr: false,
  loading: () => (
    <div className="skeleton" style={{ height: '100%', borderRadius: '12px' }} />
  ),
});

const CountriesPieChart = dynamic(() => import('@/components/charts/CountriesPieChart'), {
  ssr: false,
  loading: () => (
    <div className="skeleton" style={{ height: '100%', borderRadius: '12px' }} />
  ),
});

interface AnalyticsData {
  dealsByStage: { stage: string; count: number }[];
  companiesByCountry: { country: string; count: number }[];
  agentSuccessRate: { total: number; successful: number; rate: number };
  totalPipelineValue: number;
  totalCompanies: number;
  enrichedCompanies: number;
}

const STAGE_COLORS: Record<string, string> = {
  Discovery: '#CCFF00',
  Outreach: '#00D47E',
  Negotiation: '#3B82F6',
  Audit: '#F59E0B',
  Closed: '#8B5CF6',
};

const COUNTRY_COLORS = ['#CCFF00', '#00ff64', '#00b0ff', '#ff9800', '#8B5CF6', '#EF4444'];

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch('/api/dashboard/analytics', { signal: controller.signal })
        .then((res) => res.json())
        .then((res) => {
          if (res.success) setData(res.analytics);
        })
        .catch((err) => {
          if (err instanceof Error && err.name === 'AbortError') return;
          console.error('Analytics fetch error:', err);
        })
        .finally(() => setLoading(false));
    }, 0);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, []);

  const enrichRate = data
    ? data.totalCompanies > 0
      ? Math.round((data.enrichedCompanies / data.totalCompanies) * 100)
      : 0
    : 0;

  const pipelineFormatted = data
    ? data.totalPipelineValue >= 1_000_000
      ? `$${(data.totalPipelineValue / 1_000_000).toFixed(2)}M`
      : data.totalPipelineValue >= 1_000
        ? `$${(data.totalPipelineValue / 1_000).toFixed(0)}K`
        : `$${data.totalPipelineValue}`
    : '$0';

  const stageChartData: StagePoint[] = (data?.dealsByStage || []).map((d) => ({
    name: d.stage,
    count: d.count,
    color: STAGE_COLORS[d.stage] || '#666',
  }));

  const countryChartData: CountryPoint[] = (data?.companiesByCountry || []).map((d, i) => ({
    name: d.country || 'Unknown',
    value: d.count,
    color: COUNTRY_COLORS[i % COUNTRY_COLORS.length],
  }));

  return (
    <div className={`${styles.analyticsContainer} fade-in`}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Trade Analytics</h1>
        <p className={styles.pageSubtitle}>
          Live metrics from your Supabase database — companies, deals, agent performance.
        </p>
      </header>

      <div className="grid-3">
        {loading ? (
          <>
            <div className="skeleton" style={{ height: '100px', borderRadius: '16px' }} />
            <div className="skeleton" style={{ height: '100px', borderRadius: '16px' }} />
            <div className="skeleton" style={{ height: '100px', borderRadius: '16px' }} />
          </>
        ) : (
          <>
            <div className={`card ${styles.statCard}`}>
              <span className={styles.statLabel}>Total Pipeline Value</span>
              <span className={`mono ${styles.statValue}`}>{pipelineFormatted}</span>
              <span className="badge badge-green">Live from database</span>
            </div>

            <div className={`card ${styles.statCard}`}>
              <span className={styles.statLabel}>Agent Success Rate</span>
              <span className={`mono ${styles.statValue}`}>
                {data?.agentSuccessRate?.rate ?? 0}%
              </span>
              <span className="badge badge-blue">
                {data?.agentSuccessRate?.successful ?? 0} / {data?.agentSuccessRate?.total ?? 0}{' '}
                runs
              </span>
            </div>

            <div className={`card ${styles.statCard}`}>
              <span className={styles.statLabel}>Lead Enrichment Rate</span>
              <span className={`mono ${styles.statValue}`}>{enrichRate}%</span>
              <span className="badge badge-lime">
                {data?.enrichedCompanies ?? 0} / {data?.totalCompanies ?? 0} companies
              </span>
            </div>
          </>
        )}
      </div>

      <div className={styles.chartGrid}>
        <div className={`card ${styles.chartCard}`}>
          <h3 className={styles.chartTitle}>Deals by Pipeline Stage</h3>
          {loading ? (
            <div className="skeleton" style={{ height: '320px', borderRadius: '12px' }} />
          ) : stageChartData.length === 0 ? (
            <div className={styles.chartEmpty}>No deals in pipeline yet</div>
          ) : (
            <div className={styles.chartCanvas}>
              <DealsBarChart data={stageChartData} />
            </div>
          )}
        </div>

        <div className={`card ${styles.chartCard}`}>
          <h3 className={styles.chartTitle}>Companies by Country</h3>
          {loading ? (
            <div className="skeleton" style={{ height: '320px', borderRadius: '12px' }} />
          ) : countryChartData.length === 0 ? (
            <div className={styles.chartEmpty}>No company data yet</div>
          ) : (
            <div className={styles.chartCanvas}>
              <CountriesPieChart data={countryChartData} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

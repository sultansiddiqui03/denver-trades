'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { BarChart3, Globe2 } from 'lucide-react';
import styles from './page.module.css';
import type { StagePoint } from '@/components/charts/DealsBarChart';
import type { CountryPoint } from '@/components/charts/CountriesPieChart';
import type { AnalyticsData } from '@/lib/dashboard/analyticsData';

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

const STAGE_COLORS: Record<string, string> = {
  Discovery: '#CCFF00',
  Outreach: '#00D47E',
  Negotiation: '#3B82F6',
  Audit: '#F59E0B',
  Closed: '#8B5CF6',
};

const COUNTRY_COLORS = ['#CCFF00', '#00ff64', '#00b0ff', '#ff9800', '#8B5CF6', '#EF4444'];

interface Props {
  initial: AnalyticsData;
}

export default function AnalyticsClient({ initial }: Props) {
  const data = initial;

  const enrichRate =
    data.totalCompanies > 0
      ? Math.round((data.enrichedCompanies / data.totalCompanies) * 100)
      : 0;

  const pipelineFormatted =
    data.totalPipelineValue >= 1_000_000
      ? `$${(data.totalPipelineValue / 1_000_000).toFixed(2)}M`
      : data.totalPipelineValue >= 1_000
        ? `$${(data.totalPipelineValue / 1_000).toFixed(0)}K`
        : `$${data.totalPipelineValue}`;

  const stageChartData: StagePoint[] = data.dealsByStage.map((d) => ({
    name: d.stage,
    count: d.count,
    color: STAGE_COLORS[d.stage] || '#666',
  }));

  const countryChartData: CountryPoint[] = data.companiesByCountry.map((d, i) => ({
    name: d.country || 'Unknown',
    value: d.count,
    color: COUNTRY_COLORS[i % COUNTRY_COLORS.length],
  }));

  return (
    <>
      <div className="grid-3">
        <div className={`card ${styles.statCard}`}>
          <span className={styles.statLabel}>Total pipeline value</span>
          <span className={`mono ${styles.statValue}`}>{pipelineFormatted}</span>
          <span className="badge badge-green">Live from database</span>
        </div>

        <div className={`card ${styles.statCard}`}>
          <span className={styles.statLabel}>Agent success rate</span>
          <span className={`mono ${styles.statValue}`}>
            {data.agentSuccessRate.rate}%
          </span>
          <span className="badge badge-blue">
            {data.agentSuccessRate.successful} / {data.agentSuccessRate.total} runs
          </span>
        </div>

        <div className={`card ${styles.statCard}`}>
          <span className={styles.statLabel}>Lead enrichment rate</span>
          <span className={`mono ${styles.statValue}`}>{enrichRate}%</span>
          <span className="badge badge-lime">
            {data.enrichedCompanies} / {data.totalCompanies} companies
          </span>
        </div>
      </div>

      <div className={styles.chartGrid}>
        <div className={`card ${styles.chartCard}`}>
          <h3 className={styles.chartTitle}>Deals by pipeline stage</h3>
          {stageChartData.length === 0 ? (
            <div className={styles.chartEmpty}>
              <BarChart3 size={28} strokeWidth={1.2} aria-hidden />
              <span>No deals in pipeline yet</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Move leads through the pipeline to populate this chart
              </span>
            </div>
          ) : (
            <div className={styles.chartCanvas}>
              <DealsBarChart data={stageChartData} />
            </div>
          )}
        </div>

        <div className={`card ${styles.chartCard}`}>
          <h3 className={styles.chartTitle}>Companies by country</h3>
          {countryChartData.length === 0 ? (
            <div className={styles.chartEmpty}>
              <Globe2 size={28} strokeWidth={1.2} aria-hidden />
              <span>No company data yet</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Run a Lead Scraper agent to start populating companies
              </span>
            </div>
          ) : (
            <div className={styles.chartCanvas}>
              <CountriesPieChart data={countryChartData} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

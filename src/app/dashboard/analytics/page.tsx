'use client';

import React, { useState, useEffect } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar
} from 'recharts';
import styles from './page.module.css';

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
    fetch('/api/dashboard/analytics')
      .then((res) => res.json())
      .then((res) => {
        if (res.success) setData(res.analytics);
      })
      .catch((err) => console.error('Analytics fetch error:', err))
      .finally(() => setLoading(false));
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

  // Prepare chart data
  const stageChartData = (data?.dealsByStage || []).map((d) => ({
    name: d.stage,
    count: d.count,
    color: STAGE_COLORS[d.stage] || '#666',
  }));

  const countryChartData = (data?.companiesByCountry || []).map((d, i) => ({
    name: d.country || 'Unknown',
    value: d.count,
    color: COUNTRY_COLORS[i % COUNTRY_COLORS.length],
  }));

  return (
    <div className={`${styles.analyticsContainer} fade-in`}>
      {/* Header */}
      <div>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 800 }}>Trade Analytics</h1>
        <p className="text-secondary" style={{ fontSize: '0.875rem' }}>
          Live metrics from your Supabase database — companies, deals, agent performance.
        </p>
      </div>

      {/* Grid of stats */}
      <div className="grid-3">
        {loading ? (
          <>
            <div className="skeleton" style={{ height: '100px', borderRadius: '16px' }} />
            <div className="skeleton" style={{ height: '100px', borderRadius: '16px' }} />
            <div className="skeleton" style={{ height: '100px', borderRadius: '16px' }} />
          </>
        ) : (
          <>
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Total Pipeline Value</span>
              <span className="mono" style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--accent-lime)' }}>{pipelineFormatted}</span>
              <span className="badge badge-green" style={{ width: 'fit-content' }}>Live from database</span>
            </div>

            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Agent Success Rate</span>
              <span className="mono" style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--accent-lime)' }}>
                {data?.agentSuccessRate?.rate ?? 0}%
              </span>
              <span className="badge badge-blue" style={{ width: 'fit-content' }}>
                {data?.agentSuccessRate?.successful ?? 0} / {data?.agentSuccessRate?.total ?? 0} runs
              </span>
            </div>

            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Lead Enrichment Rate</span>
              <span className="mono" style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--accent-lime)' }}>{enrichRate}%</span>
              <span className="badge badge-lime" style={{ width: 'fit-content' }}>
                {data?.enrichedCompanies ?? 0} / {data?.totalCompanies ?? 0} companies
              </span>
            </div>
          </>
        )}
      </div>

      {/* 2-Column charts layout */}
      <div className={styles.chartGrid}>
        {/* Left Side: Deals by Stage Bar Chart */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.125rem', fontWeight: 700 }}>Deals by Pipeline Stage</h3>
          {loading ? (
            <div className="skeleton" style={{ height: '320px', borderRadius: '12px' }} />
          ) : stageChartData.length === 0 ? (
            <div style={{ height: '320px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              No deals in pipeline yet
            </div>
          ) : (
            <div style={{ width: '100%', height: '320px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stageChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                  <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} tickLine={false} />
                  <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(10,10,10,0.95)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}
                    itemStyle={{ color: 'var(--accent-lime)', fontSize: '0.85rem', fontWeight: 600 }}
                  />
                  <Bar dataKey="count" name="Deals" fill="var(--accent-lime)" radius={[4, 4, 0, 0]}>
                    {stageChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Right Side: Companies by Country Donut */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.125rem', fontWeight: 700 }}>Companies by Country</h3>
          {loading ? (
            <div className="skeleton" style={{ height: '320px', borderRadius: '12px' }} />
          ) : countryChartData.length === 0 ? (
            <div style={{ height: '320px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              No company data yet
            </div>
          ) : (
            <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', height: '320px', position: 'relative' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={countryChartData}
                    cx="50%"
                    cy="45%"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {countryChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(10,10,10,0.95)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                    }}
                    itemStyle={{ fontSize: '0.85rem', fontWeight: 600 }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    iconType="circle"
                    formatter={(value: string, entry: any) => (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                        {value} ({entry.payload.value})
                      </span>
                    )}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

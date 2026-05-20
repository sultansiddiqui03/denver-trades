'use client';

import React from 'react';
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

const exportVolumeData = [
  { name: 'Dec', Volume: 80, Margin: 17.5 },
  { name: 'Jan', Volume: 95, Margin: 18.0 },
  { name: 'Feb', Volume: 120, Margin: 18.2 },
  { name: 'Mar', Volume: 140, Margin: 18.5 },
  { name: 'Apr', Volume: 160, Margin: 18.3 },
  { name: 'May', Volume: 110, Margin: 18.4 },
];

const destinationShareData = [
  { name: 'UAE', value: 320, color: 'var(--accent-lime)' },
  { name: 'Saudi Arabia', value: 180, color: '#00ff64' },
  { name: 'Germany', value: 110, color: '#00b0ff' },
  { name: 'Oman', value: 95, color: '#ff9800' },
];

const incotermsData = [
  { name: 'CIF', count: 12, value: 840 },
  { name: 'FOB', count: 8, value: 520 },
  { name: 'CFR', count: 4, value: 290 },
  { name: 'EXW', count: 2, value: 90 },
];

export default function AnalyticsPage() {
  return (
    <div className={`${styles.analyticsContainer} fade-in`}>
      {/* Header */}
      <div>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 800 }}>Trade Analytics</h1>
        <p className="text-secondary" style={{ fontSize: '0.875rem' }}>
          Real-time trade volumes, export capacity trends, and distribution share metrics.
        </p>
      </div>

      {/* Grid of stats */}
      <div className="grid-3">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Total Vol. Exported</span>
          <span className="mono" style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--accent-lime)' }}>705 MT</span>
          <span className="badge badge-green" style={{ width: 'fit-content' }}>+14.2% YoY</span>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Average Margin</span>
          <span className="mono" style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--accent-lime)' }}>18.4%</span>
          <span className="badge badge-green" style={{ width: 'fit-content' }}>+1.5% from Q3</span>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Avg. Lead-to-Ship Cycle</span>
          <span className="mono" style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--accent-lime)' }}>18 Days</span>
          <span className="badge badge-green" style={{ width: 'fit-content' }}>-4 days improvement</span>
        </div>
      </div>

      {/* 2-Column charts layout */}
      <div className={styles.chartGrid}>
        
        {/* Left Side: Volume Trend Chart */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.125rem', fontWeight: 700 }}>Monthly Export Volume & Profit Margin</h3>
          <div style={{ width: '100%', height: '320px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={exportVolumeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorVolume" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent-lime)" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="var(--accent-lime)" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
                <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} tickLine={false} />
                <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--background-dark)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}
                  itemStyle={{ color: 'var(--accent-color)', fontSize: '0.9rem', fontWeight: 600 }}
                />
                <Area type="monotone" dataKey="Volume" name="Volume (MT)" stroke="var(--accent-lime)" strokeWidth={2} fillOpacity={1} fill="url(#colorVolume)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right Side: Geo Market Distribution Donut */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.125rem', fontWeight: 700 }}>Export Markets (MT)</h3>
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', height: '320px', position: 'relative' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={destinationShareData}
                  cx="50%"
                  cy="45%"
                  innerRadius={70}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {destinationShareData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'var(--background-dark)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                  }}
                  itemStyle={{ fontSize: '0.85rem', fontWeight: 600 }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  iconType="circle"
                  formatter={(value, entry: any) => (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {value} ({entry.payload.value} MT)
                    </span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* Incoterms Bar Chart */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.125rem', fontWeight: 700 }}>Incoterms Distribution ($k Value vs Count)</h3>
        <div style={{ width: '100%', height: '240px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={incotermsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
              <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} tickLine={false} />
              <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: 'var(--background-dark)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}
                itemStyle={{ fontSize: '0.85rem', fontWeight: 600 }}
              />
              <Bar dataKey="value" name="Value ($k)" fill="var(--accent-lime)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

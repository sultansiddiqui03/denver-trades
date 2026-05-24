'use client';

import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { PriceSeries } from '@/app/api/analytics/market/route';

const COLORS = ['#CCFF00', '#00D47E', '#3B82F6', '#F59E0B', '#8B5CF6'];

interface Props {
  data: PriceSeries[];
}

export default function PriceLineChart({ data }: Props) {
  // Merge all series into a single array keyed by date
  const dateSet = new Set<string>();
  for (const series of data) {
    for (const pt of series.series) dateSet.add(pt.date);
  }
  const dates = Array.from(dateSet).sort();

  const merged = dates.map((date) => {
    const row: Record<string, string | number> = { date };
    for (const series of data) {
      const pt = series.series.find((p) => p.date === date);
      if (pt) row[series.commodity] = pt.price;
    }
    return row;
  });

  const activeSeries = data.filter((s) => s.series.length > 0);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={merged} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey="date"
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) => v.slice(5)}
        />
        <YAxis
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={52}
          tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-primary)',
            borderRadius: 10,
            fontSize: 12,
            color: 'var(--text-primary)',
          }}
          labelStyle={{ color: 'var(--text-secondary)', marginBottom: 4 }}
          formatter={(value) => [`$${Number(value).toLocaleString()}`, '']}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, color: 'var(--text-muted)', paddingTop: 8 }}
        />
        {activeSeries.map((s, i) => (
          <Line
            key={s.commodity}
            type="monotone"
            dataKey={s.commodity}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

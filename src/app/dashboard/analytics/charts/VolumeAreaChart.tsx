'use client';

import React, { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { MonthlyVolumePoint } from '@/app/api/analytics/market/route';

const PRODUCT_COLORS = ['#CCFF00', '#00D47E', '#3B82F6', '#F59E0B', '#8B5CF6'];

interface Props {
  data: MonthlyVolumePoint[];
}

export default function VolumeAreaChart({ data }: Props) {
  const products = useMemo(() => {
    const keys = new Set<string>();
    for (const d of data) {
      Object.keys(d.byProduct).forEach((k) => keys.add(k));
    }
    return Array.from(keys);
  }, [data]);

  const formatted = data.map((d) => ({
    month: d.month.slice(0, 7),
    ...d.byProduct,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={formatted} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          {products.map((p, i) => (
            <linearGradient key={p} id={`vol-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={PRODUCT_COLORS[i % PRODUCT_COLORS.length]} stopOpacity={0.25} />
              <stop offset="95%" stopColor={PRODUCT_COLORS[i % PRODUCT_COLORS.length]} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey="month"
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) => v.slice(5)}
        />
        <YAxis
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={40}
          tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
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
        />
        <Legend
          wrapperStyle={{ fontSize: 11, color: 'var(--text-muted)', paddingTop: 8 }}
        />
        {products.map((p, i) => (
          <Area
            key={p}
            type="monotone"
            dataKey={p}
            stackId="1"
            stroke={PRODUCT_COLORS[i % PRODUCT_COLORS.length]}
            fill={`url(#vol-${i})`}
            strokeWidth={2}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

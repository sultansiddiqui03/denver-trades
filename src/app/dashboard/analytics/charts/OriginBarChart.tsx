'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import type { OriginShare } from '@/app/api/analytics/market/route';

const COLORS = ['#CCFF00', '#00D47E', '#3B82F6', '#F59E0B', '#8B5CF6', '#EF4444', '#00b0ff', '#ff9800'];

interface Props {
  data: OriginShare[];
}

export default function OriginBarChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        layout="vertical"
        data={data}
        margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
        barCategoryGap="30%"
      >
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)))}
        />
        <YAxis
          type="category"
          dataKey="country"
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={90}
        />
        <Tooltip
          contentStyle={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-primary)',
            borderRadius: 10,
            fontSize: 12,
            color: 'var(--text-primary)',
          }}
          formatter={(value, _name, entry) => [
            `${Number(value).toFixed(1)} MT (${(entry.payload as OriginShare | undefined)?.shipmentCount ?? 0} shipments)`,
            'Volume',
          ]}
          labelStyle={{ color: 'var(--text-secondary)', marginBottom: 4 }}
        />
        <Bar dataKey="volumeMt" radius={[0, 6, 6, 0]}>
          {data.map((_entry, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

'use client';

import { memo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface StagePoint {
  name: string;
  count: number;
  color: string;
}

interface DealsBarChartProps {
  data: StagePoint[];
}

function DealsBarChart({ data }: DealsBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
        <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} tickLine={false} />
        <YAxis
          stroke="var(--text-muted)"
          fontSize={11}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            background: '#0a0a0a',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
            padding: '8px 12px',
          }}
          labelStyle={{ color: '#A0A0A0', fontSize: '0.75rem' }}
          itemStyle={{ color: '#CCFF00', fontSize: '0.85rem', fontWeight: 600 }}
          cursor={{ fill: 'rgba(204, 255, 0, 0.06)' }}
        />
        <Bar dataKey="count" name="Deals" fill="var(--accent-lime)" radius={[4, 4, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default memo(DealsBarChart);

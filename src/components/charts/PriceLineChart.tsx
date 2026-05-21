'use client';

import { memo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface PriceLinePoint {
  date: string;
  time: string;
  price: number;
  origin: string;
  unit: string;
}

interface PriceLineChartProps {
  data: PriceLinePoint[];
}

function PriceLineChart({ data }: PriceLineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
        <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={11} tickLine={false} />
        <YAxis
          stroke="var(--text-muted)"
          fontSize={11}
          tickLine={false}
          domain={['auto', 'auto']}
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
          itemStyle={{ color: '#CCFF00', fontSize: '0.9rem', fontWeight: 600 }}
          cursor={{ stroke: 'rgba(204, 255, 0, 0.25)', strokeWidth: 1 }}
        />
        <Line
          type="monotone"
          dataKey="price"
          name="Price (USD)"
          stroke="var(--accent-lime)"
          strokeWidth={3}
          dot={{
            fill: 'var(--accent-lime)',
            stroke: 'var(--bg-primary)',
            strokeWidth: 2,
            r: 4,
          }}
          activeDot={{ r: 6, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default memo(PriceLineChart);

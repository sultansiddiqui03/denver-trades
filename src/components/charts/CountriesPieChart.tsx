'use client';

import { memo } from 'react';
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

export interface CountryPoint {
  name: string;
  value: number;
  color: string;
}

interface LegendEntry {
  payload?: {
    value?: number;
  };
}

interface CountriesPieChartProps {
  data: CountryPoint[];
}

function CountriesPieChart({ data }: CountriesPieChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="45%"
          innerRadius={70}
          outerRadius={100}
          paddingAngle={5}
          dataKey="value"
        >
          {data.map((entry, index) => (
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
          formatter={(value: string, entry: LegendEntry) => (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              {value} ({entry.payload?.value ?? 0})
            </span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export default memo(CountriesPieChart);

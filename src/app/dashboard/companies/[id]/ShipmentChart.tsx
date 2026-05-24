'use client';

import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import styles from './ShipmentChart.module.css';

interface HsCodeEntry {
  code: string;
  description?: string;
  shipments?: number;
}

interface ShipmentChartProps {
  hsCodes: HsCodeEntry[];
}

interface TooltipPayload {
  payload?: HsCodeEntry & { label: string };
  value?: number;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const item = entry?.payload;
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipCode}>{item?.code ?? ''}</p>
      {item?.description ? (
        <p className={styles.tooltipDesc}>{item.description}</p>
      ) : null}
      <p className={styles.tooltipValue}>{(entry?.value ?? 0).toLocaleString('en-US')} shipments</p>
    </div>
  );
}

export default function ShipmentChart({ hsCodes }: ShipmentChartProps) {
  const sorted = [...hsCodes]
    .filter((e) => (e.shipments ?? 0) > 0)
    .sort((a, b) => (b.shipments ?? 0) - (a.shipments ?? 0))
    .slice(0, 12);

  if (sorted.length === 0) return null;

  const data = sorted.map((e) => ({
    ...e,
    label: e.description ? e.description.slice(0, 28) + (e.description.length > 28 ? '…' : '') : e.code,
  }));

  return (
    <div className={styles.chartWrap}>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 24, bottom: 0, left: 4 }}
          barSize={14}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
          />
          <YAxis
            type="category"
            dataKey="label"
            width={160}
            tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
          />
          <Bar dataKey="shipments" radius={[0, 4, 4, 0]}>
            {data.map((_, i) => (
              <Cell
                key={i}
                fill={i === 0 ? 'var(--accent-lime)' : 'rgba(204,255,0,0.45)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

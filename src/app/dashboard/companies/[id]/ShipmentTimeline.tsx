'use client';

import React, { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { formatNumber } from '@/lib/format';
import styles from './ShipmentTimeline.module.css';

export interface ShipmentRow {
  id?: string | null;
  shipment_date: string | null;
  quantity_mt: number | null;
  product?: string | null;
  supplier_name?: string | null;
  origin_country?: string | null;
  destination_country?: string | null;
  port_loading?: string | null;
  port_discharge?: string | null;
  value_usd?: number | null;
  incoterm?: string | null;
}

interface TimelinePoint {
  month: string;    // "Jan 25"
  iso: string;      // "2025-01" — for sort
  qty: number;
  count: number;
}

interface TooltipPayload {
  payload?: TimelinePoint;
  value?: number;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload?.length) return null;
  const pt = payload[0]?.payload;
  if (!pt) return null;
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipMonth}>{pt.month}</p>
      <p className={styles.tooltipQty}>{formatNumber(Math.round(pt.qty))} MT</p>
      <p className={styles.tooltipCount}>{pt.count} shipment{pt.count !== 1 ? 's' : ''}</p>
    </div>
  );
}

function toYearMonth(iso: string): string {
  // "2025-03-15" → "2025-03"
  return iso.slice(0, 7);
}

function labelFromYM(ym: string): string {
  // "2025-03" → "Mar 25"
  const [year, month] = ym.split('-');
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

/** Last N calendar months (ISO "YYYY-MM"), ascending. */
function lastNMonths(n: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    months.push(`${y}-${m}`);
  }
  return months;
}

interface ShipmentTimelineProps {
  shipments: ShipmentRow[];
}

export default function ShipmentTimeline({ shipments }: ShipmentTimelineProps) {
  const data = useMemo<TimelinePoint[]>(() => {
    const buckets = new Map<string, { qty: number; count: number }>();

    for (const s of shipments) {
      if (!s.shipment_date) continue;
      const ym = toYearMonth(s.shipment_date);
      const prev = buckets.get(ym) ?? { qty: 0, count: 0 };
      buckets.set(ym, {
        qty: prev.qty + (s.quantity_mt ?? 0),
        count: prev.count + 1,
      });
    }

    // Show last 18 months; fill missing months with zeros so the area is
    // continuous even when the buyer has seasonal gaps.
    const months = lastNMonths(18);
    return months.map((ym) => {
      const b = buckets.get(ym) ?? { qty: 0, count: 0 };
      return { iso: ym, month: labelFromYM(ym), qty: b.qty, count: b.count };
    });
  }, [shipments]);

  const hasData = data.some((d) => d.qty > 0 || d.count > 0);
  if (!hasData) return null;

  return (
    <div className={styles.wrap}>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart
          data={data}
          margin={{ top: 4, right: 16, bottom: 0, left: 4 }}
        >
          <defs>
            <linearGradient id="limeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--accent-lime)" stopOpacity={0.28} />
              <stop offset="95%" stopColor="var(--accent-lime)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.05)"
            vertical={false}
          />
          <XAxis
            dataKey="month"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval={2}
          />
          <YAxis
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={48}
            tickFormatter={(v: number) =>
              v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
            }
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.08)' }} />
          <Area
            type="monotone"
            dataKey="qty"
            stroke="var(--accent-lime)"
            strokeWidth={2}
            fill="url(#limeGrad)"
            dot={false}
            activeDot={{ r: 4, fill: 'var(--accent-lime)', strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

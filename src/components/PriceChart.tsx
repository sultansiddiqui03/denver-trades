'use client';

import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import styles from './PriceChart.module.css';

interface ChartPoint {
  date: string;
  time: string;
  price: number;
  origin: string;
  unit: string;
}

const PriceLineChart = memo(function PriceLineChart({ data }: { data: ChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.05)" />
        <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={11} tickLine={false} />
        <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} domain={['auto', 'auto']} />
        <Tooltip
          contentStyle={{
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-primary)',
            borderRadius: '8px',
          }}
          labelStyle={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}
          itemStyle={{ color: 'var(--accent-lime)', fontSize: '0.9rem', fontWeight: 600 }}
        />
        <Line
          type="monotone"
          dataKey="price"
          name="Price (USD)"
          stroke="var(--accent-lime)"
          strokeWidth={3}
          dot={{ fill: 'var(--accent-lime)', stroke: 'var(--bg-primary)', strokeWidth: 2, r: 4 }}
          activeDot={{ r: 6, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
});

interface PriceRecord {
  id: string;
  commodity: string;
  price_usd: number;
  origin_country: string;
  unit: string;
  source: string;
  recorded_at: string;
}

export default function PriceChart() {
  const [prices, setPrices] = useState<PriceRecord[]>([]);
  const [commodities, setCommodities] = useState<string[]>([]);
  const [selectedCommodity, setSelectedCommodity] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);

  const fetchPrices = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/prices');
      const data = await response.json();
      if (data.success) {
        const records = data.prices || [];
        setPrices(records);

        // Extract unique commodity names
        const unique = Array.from(new Set(records.map((r: PriceRecord) => r.commodity))) as string[];
        setCommodities(unique);
        setSelectedCommodity((current) => current || unique[0] || '');
      }
    } catch (error) {
      console.error('Error fetching prices:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchPrices();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [fetchPrices]);

  const triggerPriceTick = async () => {
    setUpdating(true);
    try {
      const response = await fetch('/api/prices', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        // Refresh pricing data
        await fetchPrices();
      }
    } catch (error) {
      console.error('Error triggering price update:', error);
    } finally {
      setUpdating(false);
    }
  };

  // Filter and sort prices for the active commodity
  const activePrices = prices
    .filter((r) => r.commodity === selectedCommodity)
    // Sort chronological for chart rendering
    .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());

  // Real points only — no synthetic backfill (was misleading users about data freshness).
  const chartData = useMemo<ChartPoint[]>(
    () =>
      activePrices.map((record) => ({
        date: new Date(record.recorded_at).toLocaleDateString([], {
          month: 'short',
          day: 'numeric',
        }),
        time: new Date(record.recorded_at).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        price: Number(record.price_usd),
        origin: record.origin_country,
        unit: record.unit,
      })),
    [activePrices]
  );

  const latestRecord = activePrices[activePrices.length - 1];
  const hasEnoughForChart = chartData.length >= 2;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.selectorGroup}>
          <label htmlFor="commodity-select" className={styles.label}>Select Commodity Index:</label>
          <select
            id="commodity-select"
            className={styles.select}
            value={selectedCommodity}
            onChange={(e) => setSelectedCommodity(e.target.value)}
            disabled={loading}
          >
            {commodities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className={styles.tickBtn}
          onClick={triggerPriceTick}
          disabled={updating || loading}
        >
          {updating ? 'Updating prices...' : 'Simulate Market Price Tick'}
        </button>
      </div>

      {loading && prices.length === 0 ? (
        <div className={styles.chartFallback}>
          <p>Loading live ag-commodity pricing streams...</p>
        </div>
      ) : chartData.length === 0 ? (
        <div className={styles.chartFallback}>
          <p>No pricing records yet for {selectedCommodity || 'this commodity'}. Trigger a price tick or wait for the next cron.</p>
        </div>
      ) : (
        <div className={styles.dashboardGrid}>
          {/* Main Chart Area */}
          <div className={styles.chartArea}>
            <div className={styles.chartHeading}>
              <h4>{hasEnoughForChart ? 'Historical Trend' : 'Latest Tick'}</h4>
              <span className={styles.sourceText}>Source: {latestRecord?.source || 'Exchange'}</span>
            </div>

            <div className={styles.chartWrapper}>
              {hasEnoughForChart ? (
                <PriceLineChart data={chartData} />
              ) : (
                <div className={styles.singlePointPlaceholder}>
                  Need at least 2 ticks to draw a line. Trigger another price tick to see a trend.
                </div>
              )}
            </div>
          </div>

          {/* Pricing Info Cards */}
          {latestRecord && (
            <div className={styles.infoCol}>
              <div className={styles.card}>
                <span className={styles.cardLabel}>Latest Value</span>
                <div className={styles.priceVal}>
                  ${Number(latestRecord.price_usd).toLocaleString()} <span className={styles.unit}>USD / {latestRecord.unit}</span>
                </div>
                <div className={styles.originBadge}>
                  Origin: {latestRecord.origin_country || 'Global'}
                </div>
              </div>

              <div className={styles.card}>
                <span className={styles.cardLabel}>Update Latency</span>
                <div className={styles.statusVal}>
                  <span className={styles.pulseDot}></span> Live Feed Syncing
                </div>
                <span className={styles.timestamp}>
                  Last updated: {new Date(latestRecord.recorded_at).toLocaleTimeString()}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import styles from './PriceChart.module.css';
import type { PriceLinePoint } from './charts/PriceLineChart';

// Lazy-loaded: recharts (~140KB) only ships when the prices page actually
// renders the chart. The loading skeleton matches the chart's footprint
// to avoid layout shift.
const PriceLineChart = dynamic(() => import('./charts/PriceLineChart'), {
  ssr: false,
  loading: () => (
    <div
      className="skeleton"
      style={{ height: 320, borderRadius: 'var(--radius-md)' }}
    />
  ),
});

type ChartPoint = PriceLinePoint;

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
          <label htmlFor="commodity-select" className={styles.label}>Commodity</label>
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
          {updating ? 'Pulling prices…' : 'Simulate price tick'}
        </button>
      </div>

      {loading && prices.length === 0 ? (
        <div className={styles.dashboardGrid}>
          <div className={styles.chartArea}>
            <div
              className="skeleton"
              style={{ height: 320, borderRadius: 'var(--radius-md)' }}
            />
          </div>
          <div className={styles.infoCol}>
            <div className="skeleton" style={{ height: 110, borderRadius: 'var(--radius-lg)' }} />
            <div className="skeleton" style={{ height: 110, borderRadius: 'var(--radius-lg)' }} />
          </div>
        </div>
      ) : chartData.length === 0 ? (
        <div className={styles.chartFallback}>
          <p>No price records yet for {selectedCommodity || 'this commodity'}. Trigger a price tick or wait for the next cron.</p>
        </div>
      ) : (
        <div className={styles.dashboardGrid}>
          {/* Main Chart Area */}
          <div className={styles.chartArea}>
            <div className={styles.chartHeading}>
              <h4>{hasEnoughForChart ? 'Historical trend' : 'Latest tick'}</h4>
              <span className={styles.sourceText}>Source: {latestRecord?.source || 'Exchange'}</span>
            </div>

            <div className={styles.chartWrapper}>
              {hasEnoughForChart ? (
                <PriceLineChart data={chartData} />
              ) : (
                <div className={styles.singlePointPlaceholder}>
                  Need at least 2 ticks to draw a trend line. Trigger another price tick.
                </div>
              )}
            </div>
          </div>

          {/* Pricing Info Cards */}
          {latestRecord && (
            <div className={styles.infoCol}>
              <div className={styles.card}>
                <span className={styles.cardLabel}>Latest value</span>
                <div className={styles.priceVal}>
                  ${Number(latestRecord.price_usd).toLocaleString()} <span className={styles.unit}>USD / {latestRecord.unit}</span>
                </div>
                <div className={styles.originBadge}>
                  Origin: {latestRecord.origin_country || 'Global'}
                </div>
              </div>

              <div className={styles.card}>
                <span className={styles.cardLabel}>Feed status</span>
                <div className={styles.statusVal}>
                  <span className={styles.pulseDot}></span> Live feed syncing
                </div>
                <span className={styles.timestamp}>
                  Last updated {new Date(latestRecord.recorded_at).toLocaleTimeString()}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

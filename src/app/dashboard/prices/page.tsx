import React from 'react';
import { redirect } from 'next/navigation';
import { Anchor, LineChart, TrendingDown, TrendingUp } from 'lucide-react';
import { getUserContext } from '@/lib/auth/server';
import { fetchPrices, type PriceRecord } from '@/lib/dashboard/pricesData';
import { formatNumber } from '@/lib/format';
import PriceChart from '@/components/PriceChart';
import EmptyState from '@/components/EmptyState';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

interface PriceFeed {
  id: string;
  commodity: string;
  grade: string;
  origin: string;
  price: string;
  change: string;
  isUp: boolean;
  flat: boolean;
  sparkline: string;
}

/** Build an SVG sparkline path (90×20 viewbox) from a numeric series. */
function sparklinePath(values: number[]): string {
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 90;
  const h = 18;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * h + 1;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/**
 * Derive the per-commodity feed cards from the real `commodity_prices` series.
 * Records arrive grouped by commodity, recorded_at DESC (latest first). For each
 * commodity we take the latest price, the % move vs the previous tick, and a
 * sparkline of the recent series.
 */
function buildFeeds(prices: PriceRecord[]): PriceFeed[] {
  const byCommodity = new Map<string, PriceRecord[]>();
  for (const p of prices) {
    const arr = byCommodity.get(p.commodity) ?? [];
    arr.push(p);
    byCommodity.set(p.commodity, arr);
  }

  const feeds: PriceFeed[] = [];
  for (const [commodity, recs] of byCommodity) {
    const latest = recs[0];
    if (!latest) continue;
    const prev = recs[1];
    const change =
      prev && prev.price_usd ? ((latest.price_usd - prev.price_usd) / prev.price_usd) * 100 : 0;
    const series = recs.slice(0, 12).map((r) => r.price_usd).reverse();
    const unit = latest.unit || 'MT';
    feeds.push({
      id: latest.id,
      commodity,
      grade: `per ${unit}`,
      origin: [latest.source, latest.origin_country].filter(Boolean).join(' · ') || 'Tracked series',
      price: `$${formatNumber(Math.round(latest.price_usd))} / ${unit}`,
      change: `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`,
      isUp: change > 0,
      flat: Math.abs(change) < 0.05,
      sparkline: sparklinePath(series),
    });
  }
  return feeds.sort((a, b) => a.commodity.localeCompare(b.commodity));
}

export default async function PricesPage() {
  const context = await getUserContext();
  if (!context) redirect('/');

  let prices: PriceRecord[] = [];
  try {
    prices = await fetchPrices(context);
  } catch (err) {
    console.error('Prices fetch failed:', err);
  }
  const feeds = buildFeeds(prices);

  return (
    <div className={`${styles.pricesContainer} fade-in`}>
      <div className={styles.pricesHeader}>
        <h1 className={styles.pricesTitle}>Commodity prices</h1>
        <p className={styles.pricesSubtitle}>
          Benchmark commodity price series tracked over time. For customs-verified per-unit prices by
          destination, see <strong>Market Intel</strong>.
        </p>
      </div>

      <div className={`card ${styles.workspaceCard}`}>
        <h3 className={styles.sectionHeading}>
          <LineChart size={18} strokeWidth={1.8} aria-hidden />
          Index analytics
        </h3>
        <PriceChart initialPrices={prices} />
      </div>

      <div>
        <h3 className={styles.sectionHeading}>
          <Anchor size={18} strokeWidth={1.8} aria-hidden />
          Latest by commodity
        </h3>
        {feeds.length === 0 ? (
          <EmptyState
            title="No price data yet"
            description="Commodity price ticks will appear here once the price ingest runs. It populates a tracked series per commodity you can chart and compare."
          />
        ) : (
          <div className={styles.feedList}>
            {feeds.map((f, i) => (
              <div
                key={f.id}
                className={`${styles.feedCard} lift fade-in`}
                style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
              >
                <div className={styles.feedInfo}>
                  <span className={styles.feedName}>{f.commodity}</span>
                  <span className={styles.feedMeta}>
                    {f.grade} • <span className={styles.feedOrigin}>{f.origin}</span>
                  </span>
                </div>

                {f.sparkline && (
                  <div className={styles.feedSparkline}>
                    <svg width="120" height="30" viewBox="0 0 90 20" aria-hidden>
                      <path
                        d={f.sparkline}
                        fill="none"
                        stroke={f.flat ? 'var(--text-muted)' : f.isUp ? 'var(--success)' : 'var(--danger)'}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}

                <div className={styles.feedValueCol}>
                  <span className={`mono ${styles.feedPrice}`}>{f.price}</span>
                  <span
                    className={`badge ${f.flat ? '' : f.isUp ? 'badge-green' : 'badge-red'}`}
                    style={{ fontSize: '0.75rem', fontWeight: 700 }}
                  >
                    {!f.flat &&
                      (f.isUp ? (
                        <TrendingUp size={12} strokeWidth={2.2} aria-hidden />
                      ) : (
                        <TrendingDown size={12} strokeWidth={2.2} aria-hidden />
                      ))}
                    {f.change}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

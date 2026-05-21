import React, { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { Anchor, LineChart, TrendingDown, TrendingUp } from 'lucide-react';
import { getUserContext } from '@/lib/auth/server';
import { fetchPrices, type PriceRecord } from '@/lib/dashboard/pricesData';
import PriceChart from '@/components/PriceChart';
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
  sparkline: string;
}

const FEEDS: PriceFeed[] = [
  {
    id: 'price-1',
    commodity: 'Black Pepper',
    grade: '550 g/l ASTA',
    origin: 'FOB Ho Chi Minh Port',
    price: '$4,850 / MT',
    change: '+1.2%',
    isUp: true,
    sparkline: 'M0,15 L10,12 L20,16 L30,10 L40,8 L50,11 L60,4 L70,5 L80,2 L90,1',
  },
  {
    id: 'price-2',
    commodity: 'White Pepper',
    grade: '630 g/l Double Washed',
    origin: 'FOB Bangka Port',
    price: '$6,900 / MT',
    change: '-0.5%',
    isUp: false,
    sparkline: 'M0,1 L10,3 L20,2 L30,6 L40,8 L50,6 L60,9 L70,12 L80,11 L90,14',
  },
  {
    id: 'price-3',
    commodity: 'Cashew Nuts',
    grade: 'WW320 Premium Whole',
    origin: 'CIF Rotterdam Port',
    price: '$7,250 / MT',
    change: '+2.1%',
    isUp: true,
    sparkline: 'M0,16 L10,14 L20,15 L30,12 L40,11 L50,12 L60,9 L70,7 L80,5 L90,2',
  },
  {
    id: 'price-4',
    commodity: 'Robusta Coffee',
    grade: 'Grade 1 Screen 18',
    origin: 'FOB Buon Ma Thuot',
    price: '$3,420 / MT',
    change: '+0.8%',
    isUp: true,
    sparkline: 'M0,12 L10,13 L20,11 L30,10 L40,8 L50,9 L60,7 L70,6 L80,5 L90,3',
  },
  {
    id: 'price-5',
    commodity: 'Cassia Split',
    grade: 'Cigarette A-Grade',
    origin: 'FOB Hai Phong Port',
    price: '$2,800 / MT',
    change: '-1.4%',
    isUp: false,
    sparkline: 'M0,2 L10,4 L20,3 L30,7 L40,9 L50,8 L60,11 L70,14 L80,13 L90,17',
  },
];

function PriceChartSkeleton() {
  return (
    <div
      className="skeleton"
      style={{ height: 360, borderRadius: 'var(--radius-md)' }}
    />
  );
}

async function PriceChartServer() {
  const context = await getUserContext();
  if (!context) redirect('/');

  let prices: PriceRecord[] = [];
  try {
    prices = await fetchPrices(context);
  } catch (err) {
    // Soft-fail: let the client island recover via its own fetch on mount.
    console.error('Server-side prices fetch failed:', err);
  }

  return <PriceChart initialPrices={prices} />;
}

export default async function PricesPage() {
  return (
    <div className={`${styles.pricesContainer} fade-in`}>
      {/* Header */}
      <div className={styles.pricesHeader}>
        <h1 className={styles.pricesTitle}>Commodity prices</h1>
        <p className={styles.pricesSubtitle}>
          Live benchmark prices for spices, nuts, and agri exports from port registries and global exchanges.
        </p>
      </div>

      {/* Interactive Price Chart Workspace */}
      <div className={`card ${styles.workspaceCard}`}>
        <h3 className={styles.sectionHeading}>
          <LineChart size={18} strokeWidth={1.8} aria-hidden />
          Index analytics
        </h3>
        <Suspense fallback={<PriceChartSkeleton />}>
          <PriceChartServer />
        </Suspense>
      </div>

      {/* List Indices Grid */}
      <div>
        <h3 className={styles.sectionHeading}>
          <Anchor size={18} strokeWidth={1.8} aria-hidden />
          Exchange rates
        </h3>
        <div className={styles.feedList}>
          {FEEDS.map((f) => (
            <div key={f.id} className={styles.feedCard}>
              <div className={styles.feedInfo}>
                <span className={styles.feedName}>{f.commodity}</span>
                <span className={styles.feedMeta}>
                  {f.grade} • <span className={styles.feedOrigin}>{f.origin}</span>
                </span>
              </div>

              <div className={styles.feedSparkline}>
                <svg width="120" height="30" viewBox="0 0 90 20" aria-hidden>
                  <path
                    d={f.sparkline}
                    fill="none"
                    stroke={f.isUp ? 'var(--success)' : 'var(--danger)'}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              <div className={styles.feedValueCol}>
                <span className={`mono ${styles.feedPrice}`}>{f.price}</span>
                <span
                  className={`badge ${f.isUp ? 'badge-green' : 'badge-red'}`}
                  style={{ fontSize: '0.75rem', fontWeight: 700 }}
                >
                  {f.isUp ? (
                    <TrendingUp size={12} strokeWidth={2.2} aria-hidden />
                  ) : (
                    <TrendingDown size={12} strokeWidth={2.2} aria-hidden />
                  )}
                  {f.change}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import React, { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/auth/server';
import { fetchAnalyticsData } from '@/lib/dashboard/analyticsData';
import AnalyticsClient from './AnalyticsClient';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

function AnalyticsSkeleton() {
  return (
    <>
      <div className="grid-3">
        <div className="skeleton" style={{ height: '100px', borderRadius: '16px' }} />
        <div className="skeleton" style={{ height: '100px', borderRadius: '16px' }} />
        <div className="skeleton" style={{ height: '100px', borderRadius: '16px' }} />
      </div>
      <div className={styles.chartGrid}>
        <div className={`card ${styles.chartCard}`}>
          <h3 className={styles.chartTitle}>Deals by pipeline stage</h3>
          <div className="skeleton" style={{ height: '320px', borderRadius: '12px' }} />
        </div>
        <div className={`card ${styles.chartCard}`}>
          <h3 className={styles.chartTitle}>Companies by country</h3>
          <div className="skeleton" style={{ height: '320px', borderRadius: '12px' }} />
        </div>
      </div>
    </>
  );
}

async function AnalyticsBody() {
  const context = await getUserContext();
  if (!context) redirect('/');

  const data = await fetchAnalyticsData(context);
  return <AnalyticsClient initial={data} />;
}

export default async function AnalyticsPage() {
  return (
    <div className={`${styles.analyticsContainer} fade-in`}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Analytics</h1>
        <p className={styles.pageSubtitle}>
          Live metrics from your database — companies, deals, agent performance.
        </p>
      </header>

      <Suspense fallback={<AnalyticsSkeleton />}>
        <AnalyticsBody />
      </Suspense>
    </div>
  );
}

import React, { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/auth/server';
import { fetchDashboardStats } from '@/lib/dashboard/statsData';
import { fetchActivityFeed } from '@/lib/dashboard/activityData';
import StatsCard from '@/components/StatsCard';
import DashboardActivityFeed from './DashboardClient';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

function StatsSkeleton() {
  return (
    <>
      <div className="skeleton" style={{ height: '110px', borderRadius: '16px' }} />
      <div className="skeleton" style={{ height: '110px', borderRadius: '16px' }} />
      <div className="skeleton" style={{ height: '110px', borderRadius: '16px' }} />
      <div className="skeleton" style={{ height: '110px', borderRadius: '16px' }} />
    </>
  );
}

function ActivitySkeleton() {
  return (
    <div className={styles.activityCard}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="skeleton" style={{ height: '48px', borderRadius: '8px' }} />
        <div className="skeleton" style={{ height: '48px', borderRadius: '8px' }} />
        <div className="skeleton" style={{ height: '48px', borderRadius: '8px' }} />
      </div>
    </div>
  );
}

async function StatsRow() {
  const context = await getUserContext();
  if (!context) redirect('/');

  const stats = await fetchDashboardStats(context);

  return (
    <>
      <StatsCard
        title="Total companies"
        value={stats.totalCompanies.toLocaleString()}
        change="Live from database"
        changeType="neutral"
        delayIndex={0}
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        }
      />
      <StatsCard
        title="Active deals"
        value={stats.activeDeals.toLocaleString()}
        change="Live from pipeline"
        changeType="neutral"
        delayIndex={1}
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        }
      />
      <StatsCard
        title="Pipeline value"
        value={stats.pipelineValue}
        change="Live from deals"
        changeType="neutral"
        delayIndex={2}
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        }
      />
      <StatsCard
        title="Enriched leads"
        value={stats.enrichedLeads.toLocaleString()}
        change="AI-enriched companies"
        changeType="neutral"
        delayIndex={3}
        icon={
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        }
      />
    </>
  );
}

async function ActivityFeed() {
  const context = await getUserContext();
  if (!context) redirect('/');

  const activities = await fetchActivityFeed(context);
  return <DashboardActivityFeed initial={activities} />;
}

export default async function DashboardOverview() {
  // Compute the date on the server. Note: rendered against the server's
  // locale; this matches the previous behavior where the value was frozen
  // at first paint, except now it's frozen at request time rather than at
  // first client mount.
  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="fade-in">
      {/* Header */}
      <div className={styles.headerSection}>
        <h1 className={styles.welcomeTitle}>Welcome back</h1>
        <span className={styles.dateSubtitle}>{currentDate}</span>
      </div>

      {/* Stats Cards Grid */}
      <div className={styles.statsGrid}>
        <Suspense fallback={<StatsSkeleton />}>
          <StatsRow />
        </Suspense>
      </div>

      {/* Main Blocks */}
      <div className={styles.dashboardBlocks}>
        {/* Activity Feed Column */}
        <div>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" />
                <line x1="12" y1="20" x2="12" y2="4" />
                <line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              Recent activity
            </h2>
          </div>

          <Suspense fallback={<ActivitySkeleton />}>
            <ActivityFeed />
          </Suspense>
        </div>

        {/* Quick Actions Column */}
        <div>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              Quick tools
            </h2>
          </div>

          <div className={styles.quickActionsCard}>
            <Link href="/dashboard/search" className={styles.actionBtn}>
              <div className={styles.actionBtnText}>
                <span className={styles.actionTitle}>AI buyer search</span>
                <span className={styles.actionDesc}>Find verified importers using natural language</span>
              </div>
              <svg className={styles.actionArrow} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>

            <Link href="/dashboard/documents" className={styles.actionBtn}>
              <div className={styles.actionBtnText}>
                <span className={styles.actionTitle}>Document audit</span>
                <span className={styles.actionDesc}>Compare B/L against L/C terms</span>
              </div>
              <svg className={styles.actionArrow} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>

            <Link href="/dashboard/outreach" className={styles.actionBtn}>
              <div className={styles.actionBtnText}>
                <span className={styles.actionTitle}>Generate outreach</span>
                <span className={styles.actionDesc}>Draft emails and WhatsApp messages in the buyer&apos;s language</span>
              </div>
              <svg className={styles.actionArrow} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

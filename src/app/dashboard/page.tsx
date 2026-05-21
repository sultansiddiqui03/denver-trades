import React, { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Activity,
  Building2,
  ChevronRight,
  FileSearch,
  Mail,
  Sparkles,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
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
        change="In directory"
        changeType="neutral"
        delayIndex={0}
        icon={<Building2 size={20} strokeWidth={1.6} />}
      />
      <StatsCard
        title="Active deals"
        value={stats.activeDeals.toLocaleString()}
        change="In pipeline"
        changeType="neutral"
        delayIndex={1}
        icon={<Users size={20} strokeWidth={1.6} />}
      />
      <StatsCard
        title="Pipeline value"
        value={stats.pipelineValue}
        change="Open opportunities"
        changeType="neutral"
        delayIndex={2}
        icon={<Wallet size={20} strokeWidth={1.6} />}
      />
      <StatsCard
        title="Enriched leads"
        value={stats.enrichedLeads.toLocaleString()}
        change="AI-profiled"
        changeType="neutral"
        delayIndex={3}
        icon={<Sparkles size={20} strokeWidth={1.6} />}
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
              <Activity size={18} strokeWidth={1.6} />
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
              <Zap size={18} strokeWidth={1.6} />
              Quick tools
            </h2>
          </div>

          <div className={styles.quickActionsCard}>
            <Link href="/dashboard/search" className={styles.actionBtn}>
              <div className={styles.actionIcon}>
                <Sparkles size={18} strokeWidth={1.6} />
              </div>
              <div className={styles.actionBtnText}>
                <span className={styles.actionTitle}>AI buyer search</span>
                <span className={styles.actionDesc}>Find verified importers using natural language</span>
              </div>
              <ChevronRight size={16} strokeWidth={2} className={styles.actionArrow} />
            </Link>

            <Link href="/dashboard/documents" className={styles.actionBtn}>
              <div className={styles.actionIcon}>
                <FileSearch size={18} strokeWidth={1.6} />
              </div>
              <div className={styles.actionBtnText}>
                <span className={styles.actionTitle}>Document audit</span>
                <span className={styles.actionDesc}>Compare B/L against L/C terms</span>
              </div>
              <ChevronRight size={16} strokeWidth={2} className={styles.actionArrow} />
            </Link>

            <Link href="/dashboard/outreach" className={styles.actionBtn}>
              <div className={styles.actionIcon}>
                <Mail size={18} strokeWidth={1.6} />
              </div>
              <div className={styles.actionBtnText}>
                <span className={styles.actionTitle}>Generate outreach</span>
                <span className={styles.actionDesc}>Draft emails and WhatsApp in the buyer&apos;s language</span>
              </div>
              <ChevronRight size={16} strokeWidth={2} className={styles.actionArrow} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

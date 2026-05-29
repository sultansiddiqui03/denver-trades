import React, { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  Activity,
  BarChart3,
  Building2,
  ChevronRight,
  FileSearch,
  Mail,
  Radar,
  Sparkles,
  Target,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { getUserContext } from '@/lib/auth/server';
import { fetchDashboardStats, type DashboardStats } from '@/lib/dashboard/statsData';
import { fetchActivityFeed } from '@/lib/dashboard/activityData';
import StatsCard from '@/components/StatsCard';
import ActiveDemandFeed from '@/components/ActiveDemandFeed';
import DashboardActivityFeed from './DashboardClient';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

function deltaLabel(n: number, fallback: string): { change: string; changeType: 'positive' | 'neutral' } {
  return n > 0
    ? { change: `+${n} this week`, changeType: 'positive' }
    : { change: fallback, changeType: 'neutral' };
}

function StatsRow({ stats }: { stats: DashboardStats }) {
  const companies = deltaLabel(stats.newCompanies7d, 'In directory');
  const deals = deltaLabel(stats.newDeals7d, 'In pipeline');
  const enriched = deltaLabel(stats.newEnriched7d, 'AI-profiled');
  return (
    <>
      <StatsCard
        title="Total companies"
        value={stats.totalCompanies.toLocaleString()}
        change={companies.change}
        changeType={companies.changeType}
        href="/dashboard/companies"
        delayIndex={0}
        icon={<Building2 size={20} strokeWidth={1.6} />}
      />
      <StatsCard
        title="Active deals"
        value={stats.activeDeals.toLocaleString()}
        change={deals.change}
        changeType={deals.changeType}
        href="/dashboard/pipeline"
        delayIndex={1}
        icon={<Users size={20} strokeWidth={1.6} />}
      />
      <StatsCard
        title="Pipeline value"
        value={stats.pipelineValue}
        change={`across ${stats.activeDeals} deal${stats.activeDeals === 1 ? '' : 's'}`}
        changeType="neutral"
        href="/dashboard/pipeline"
        delayIndex={2}
        icon={<Wallet size={20} strokeWidth={1.6} />}
      />
      <StatsCard
        title="Enriched leads"
        value={stats.enrichedLeads.toLocaleString()}
        change={enriched.change}
        changeType={enriched.changeType}
        href="/dashboard/companies"
        delayIndex={3}
        icon={<Sparkles size={20} strokeWidth={1.6} />}
      />
    </>
  );
}

function FirstRunHero() {
  const steps = [
    {
      href: '/dashboard/matches',
      Icon: Target,
      title: 'Find your first buyers',
      desc: 'Type a product on Buyer Match → Discover to pull real US importers from customs records.',
    },
    {
      href: '/dashboard/market',
      Icon: BarChart3,
      title: 'Size your market',
      desc: 'See demand-by-destination and price benchmarks for any commodity you trade.',
    },
    {
      href: '/dashboard/radar',
      Icon: Radar,
      title: 'Watch demand signals',
      desc: 'Track buyers shifting suppliers and inbound RFQs as they happen.',
    },
  ];
  return (
    <section className={`${styles.firstRunCard} fade-in`}>
      <div className={styles.firstRunHead}>
        <Sparkles size={20} strokeWidth={1.8} className={styles.firstRunIcon} />
        <div>
          <h2 className={styles.firstRunTitle}>Let&apos;s find you some buyers</h2>
          <p className={styles.firstRunDesc}>
            Your workspace is ready. Start with any of these — each pulls real customs trade data.
          </p>
        </div>
      </div>
      <div className={styles.firstRunSteps}>
        {steps.map((s, i) => (
          <Link
            key={s.href}
            href={s.href}
            className={`${styles.firstRunStep} lift fade-in`}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <span className={styles.firstRunStepNum}>{i + 1}</span>
            <s.Icon size={18} strokeWidth={1.7} className={styles.firstRunStepIcon} />
            <span className={styles.firstRunStepTitle}>{s.title}</span>
            <span className={styles.firstRunStepDesc}>{s.desc}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ActivitySkeleton() {
  return (
    <div className={styles.activityCard}>
      <div className={styles.activitySkeletonStack}>
        <div className={`skeleton ${styles.activitySkeletonRow}`} />
        <div className={`skeleton ${styles.activitySkeletonRow}`} />
        <div className={`skeleton ${styles.activitySkeletonRow}`} />
      </div>
    </div>
  );
}

async function ActivityFeed() {
  const context = await getUserContext();
  if (!context) redirect('/');

  const activities = await fetchActivityFeed(context);
  return <DashboardActivityFeed initial={activities} />;
}

export default async function DashboardOverview() {
  const context = await getUserContext();
  if (!context) redirect('/');
  // Stats are cheap COUNT queries — fetch upfront so we can branch on first-run
  // state (the activity feed stays in Suspense below since it's heavier).
  const stats = await fetchDashboardStats(context);

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

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="fade-in">
      {/* Header */}
      <div className={styles.headerSection}>
        <div className={styles.headerTop}>
          <h1 className={styles.welcomeTitle}>
            {greeting}
            <span className={styles.welcomePulse} aria-hidden="true" />
          </h1>
          <span className={styles.dateChip}>{currentDate}</span>
        </div>
        <p className={styles.headerSubtitle}>
          Your trade intelligence dashboard — leads, pipeline and live buyer signals.
        </p>
      </div>

      {/* Stats Cards Grid */}
      <div className={styles.statsGrid}>
        <StatsRow stats={stats} />
      </div>

      {/* First-run guidance — only when the org has no data yet */}
      {stats.isEmpty && <FirstRunHero />}

      {/* Active demand — the wedge over Tradyon. Surfaces parsed inbound
         WhatsApp RFQs as a one-tap quote-generation feed. */}
      <section className={styles.demandSection}>
        <div className={styles.sectionHeader}>
          <h2 className={`${styles.sectionTitle} ${styles.demandTitle}`}>
            <Zap size={18} strokeWidth={1.8} className={styles.demandTitleIcon} />
            Active demand
          </h2>
          <span className={styles.demandSubtitle}>
            Inbound buyer signals parsed from WhatsApp
          </span>
        </div>
        <ActiveDemandFeed />
      </section>

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

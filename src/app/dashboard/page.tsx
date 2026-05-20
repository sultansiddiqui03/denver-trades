'use client';

import React from 'react';
import Link from 'next/link';
import StatsCard from '@/components/StatsCard';
import styles from './page.module.css';

export default function DashboardOverview() {
  // Client-side date generation to avoid hydration mismatch
  const [currentDate, setCurrentDate] = React.useState('');

  React.useEffect(() => {
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    };
    setCurrentDate(new Date().toLocaleDateString('en-US', options));
  }, []);

  return (
    <div className="fade-in">
      {/* Header */}
      <div className={styles.headerSection}>
        <h1 className={styles.welcomeTitle}>Welcome Back, Sultan Trades</h1>
        <span className={styles.dateSubtitle}>{currentDate || 'Loading date...'}</span>
      </div>

      {/* Stats Cards Grid */}
      <div className={styles.statsGrid}>
        <StatsCard
          title="Total Importers"
          value="2,847"
          change="+12.5% this month"
          changeType="positive"
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
          title="Active Deals"
          value="34"
          change="+5.2% this week"
          changeType="positive"
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
          title="Pipeline Value"
          value="$1.24M"
          change="+18.3% this month"
          changeType="positive"
          delayIndex={2}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          }
        />
        <StatsCard
          title="Enriched Leads"
          value="1,205"
          change="+8.7% this week"
          changeType="positive"
          delayIndex={3}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          }
        />
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
              Recent Operations Log
            </h2>
          </div>

          <div className={styles.activityCard}>
            <div className={styles.activityList}>
              <div className={styles.activityItem}>
                <div className={`${styles.activityStatusDot} ${styles.dotLime}`}></div>
                <div className={styles.activityContent}>
                  <span className={styles.activityText}>
                    <strong>Lead Scraper Agent</strong> automatically enriched 12 spice importers in UAE.
                  </span>
                  <div className={styles.activityMeta}>
                    <span className={styles.activityTime}>2 hours ago</span>
                  </div>
                </div>
              </div>

              <div className={styles.activityItem}>
                <div className={`${styles.activityStatusDot} ${styles.dotGreen}`}></div>
                <div className={styles.activityContent}>
                  <span className={styles.activityText}>
                    Document audit completed for <strong>Vietnam Pepper Export Co.</strong> L/C vs B/L matches perfectly.
                  </span>
                  <div className={styles.activityMeta}>
                    <span className={styles.activityTime}>4 hours ago</span>
                  </div>
                </div>
              </div>

              <div className={styles.activityItem}>
                <div className={`${styles.activityStatusDot} ${styles.dotBlue}`}></div>
                <div className={styles.activityContent}>
                  <span className={styles.activityText}>
                    WhatsApp negotiation synced: <strong>Al-Rashid Foodstuff Ltd.</strong> counter-offered $850/MT FOB.
                  </span>
                  <div className={styles.activityMeta}>
                    <span className={styles.activityTime}>1 day ago</span>
                  </div>
                </div>
              </div>

              <div className={styles.activityItem}>
                <div className={`${styles.activityStatusDot} ${styles.dotPurple}`}></div>
                <div className={styles.activityContent}>
                  <span className={styles.activityText}>
                    Price Feed update: **Black Pepper 550 ASTA** increased by <strong>1.2%</strong> on global markets.
                  </span>
                  <div className={styles.activityMeta}>
                    <span className={styles.activityTime}>1 day ago</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions Column */}
        <div>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              Quick Tools
            </h2>
          </div>

          <div className={styles.quickActionsCard}>
            <Link href="/dashboard/search" className={styles.actionBtn}>
              <div className={styles.actionBtnText}>
                <span className={styles.actionTitle}>AI Buyer Search</span>
                <span className={styles.actionDesc}>Find verified global importers using natural language</span>
              </div>
              <svg className={styles.actionArrow} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>

            <Link href="/dashboard/documents" className={styles.actionBtn}>
              <div className={styles.actionBtnText}>
                <span className={styles.actionTitle}>Document Audit Copilot</span>
                <span className={styles.actionDesc}>Compare trade PDFs against Letters of Credit requirements</span>
              </div>
              <svg className={styles.actionArrow} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </Link>

            <Link href="/dashboard/outreach" className={styles.actionBtn}>
              <div className={styles.actionBtnText}>
                <span className={styles.actionTitle}>Generate AI Outreach</span>
                <span className={styles.actionDesc}>Draft automated emails and WhatsApp messages in buyer's language</span>
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

'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import StatsCard from '@/components/StatsCard';
import EmptyState from '@/components/EmptyState';
import styles from './page.module.css';

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  color: 'lime' | 'green' | 'blue' | 'purple' | 'yellow';
}

interface DashboardStats {
  totalCompanies: number;
  activeDeals: number;
  pipelineValue: string;
  enrichedLeads: number;
}

const COLOR_MAP: Record<string, string> = {
  lime: 'dotLime',
  green: 'dotGreen',
  blue: 'dotBlue',
  purple: 'dotPurple',
  yellow: 'dotYellow',
};

function timeAgo(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'Yesterday';
  return `${diffD}d ago`;
}

export default function DashboardOverview() {
  const [currentDate] = useState(() => {
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    };

    return new Date().toLocaleDateString('en-US', options);
  });
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingActivity, setLoadingActivity] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      // Fetch live stats
      fetch('/api/dashboard/stats')
        .then((res) => res.json())
        .then((data) => {
          if (data.success) setStats(data.stats);
        })
        .catch((err) => console.error('Stats fetch error:', err))
        .finally(() => setLoadingStats(false));

      // Fetch live activity
      fetch('/api/dashboard/activity')
        .then((res) => res.json())
        .then((data) => {
          if (data.success) setActivities(data.activities);
        })
        .catch((err) => console.error('Activity fetch error:', err))
        .finally(() => setLoadingActivity(false));
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="fade-in">
      {/* Header */}
      <div className={styles.headerSection}>
        <h1 className={styles.welcomeTitle}>Welcome Back, Sultan Trades</h1>
        <span className={styles.dateSubtitle}>{currentDate}</span>
      </div>

      {/* Stats Cards Grid */}
      <div className={styles.statsGrid}>
        {loadingStats ? (
          <>
            <div className="skeleton" style={{ height: '110px', borderRadius: '16px' }} />
            <div className="skeleton" style={{ height: '110px', borderRadius: '16px' }} />
            <div className="skeleton" style={{ height: '110px', borderRadius: '16px' }} />
            <div className="skeleton" style={{ height: '110px', borderRadius: '16px' }} />
          </>
        ) : (
          <>
            <StatsCard
              title="Total Companies"
              value={stats?.totalCompanies?.toLocaleString() ?? '0'}
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
              title="Active Deals"
              value={stats?.activeDeals?.toLocaleString() ?? '0'}
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
              title="Pipeline Value"
              value={stats?.pipelineValue ?? '$0'}
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
              title="Enriched Leads"
              value={stats?.enrichedLeads?.toLocaleString() ?? '0'}
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
        )}
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

          {loadingActivity ? (
            <div className={styles.activityCard}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="skeleton" style={{ height: '48px', borderRadius: '8px' }} />
                <div className="skeleton" style={{ height: '48px', borderRadius: '8px' }} />
                <div className="skeleton" style={{ height: '48px', borderRadius: '8px' }} />
              </div>
            </div>
          ) : activities.length === 0 ? (
            <EmptyState
              title="No Recent Activity"
              description="Run an agent, send a WhatsApp message, or audit a document to see activity here."
              icon={
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
              }
            />
          ) : (
            <div className={styles.activityCard}>
              <div className={styles.activityList}>
                {activities.map((item) => (
                  <div key={item.id} className={styles.activityItem}>
                    <div
                      className={`${styles.activityStatusDot} ${
                        styles[COLOR_MAP[item.color] || 'dotGreen']
                      }`}
                    />
                    <div className={styles.activityContent}>
                      <span className={styles.activityText}>
                        <strong>{item.title}</strong> {item.description}
                      </span>
                      <div className={styles.activityMeta}>
                        <span className={styles.activityTime}>
                          {timeAgo(item.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
                <span className={styles.actionDesc}>Draft automated emails and WhatsApp messages in buyer&#39;s language</span>
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

'use client';

import React from 'react';
import { Activity } from 'lucide-react';
import EmptyState from '@/components/EmptyState';
import type { ActivityItem } from '@/lib/dashboard/activityData';
import styles from './page.module.css';

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

interface Props {
  initial: ActivityItem[];
}

/**
 * Renders the activity feed from server-fetched seed data. Lives in the
 * client bundle so `timeAgo()` can run against the user's local clock
 * (avoids a server-vs-client timezone hydration mismatch).
 */
export default function DashboardActivityFeed({ initial }: Props) {
  if (initial.length === 0) {
    return (
      <EmptyState
        title="No recent activity"
        description="Run an agent, send a WhatsApp message, or audit a document to see activity stream in real-time."
        icon={<Activity size={40} strokeWidth={1} />}
      />
    );
  }

  return (
    <div className={styles.activityCard}>
      <div className={styles.activityList}>
        {initial.map((item) => (
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
                <span className={styles.activityTime}>{timeAgo(item.timestamp)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

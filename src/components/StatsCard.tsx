'use client';

import React from 'react';
import styles from './StatsCard.module.css';

interface StatsCardProps {
  title: string;
  value: string | number;
  change: string;
  changeType: 'positive' | 'negative' | 'neutral';
  icon: React.ReactNode;
  delayIndex?: number;
}

export default function StatsCard({
  title,
  value,
  change,
  changeType,
  icon,
  delayIndex = 0,
}: StatsCardProps) {
  const changeClass =
    changeType === 'positive'
      ? styles.positive
      : changeType === 'negative'
      ? styles.negative
      : styles.neutral;

  const arrow =
    changeType === 'positive' ? (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="6" y1="9" x2="6" y2="3" />
        <polyline points="3 6 6 3 9 6" />
      </svg>
    ) : changeType === 'negative' ? (
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="6" y1="3" x2="6" y2="9" />
        <polyline points="9 6 6 9 3 6" />
      </svg>
    ) : null;

  return (
    <div
      className={styles.statsCard}
      style={{
        animationDelay: `${delayIndex * 100}ms`,
      }}
    >
      <div className={styles.statsHeader}>
        <span className={styles.statsTitle}>{title}</span>
        <div className={styles.statsIconWrap}>{icon}</div>
      </div>
      <div className={styles.statsValue}>{value}</div>
      <div className={`${styles.statsChange} ${changeClass}`}>
        {arrow}
        <span>{change}</span>
      </div>
    </div>
  );
}

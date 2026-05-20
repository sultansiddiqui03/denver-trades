'use client';

import React from 'react';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

const defaultIcon = (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <path d="M9 9h.01" />
    <path d="M15 9h.01" />
    <path d="M9 15c1 1 3 1.5 6 0" />
  </svg>
);

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.iconWrap}>{icon || defaultIcon}</div>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
      {actionLabel && onAction && (
        <button type="button" className="btn-primary" onClick={onAction} style={{ marginTop: '8px' }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

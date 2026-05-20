'use client';

import React from 'react';
import { Inbox } from 'lucide-react';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.iconWrap}>
        {icon ?? <Inbox size={48} strokeWidth={1} className={styles.defaultIcon} />}
      </div>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.description}>{description}</p>
      {actionLabel && onAction && (
        <button type="button" className={`btn-primary ${styles.actionBtn}`} onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

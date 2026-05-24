import React from 'react';
import styles from './page.module.css';

export default function MatchesLoading() {
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={`skeleton ${styles.titleRow}`} style={{ height: '52px', borderRadius: 'var(--radius-md)' }} />
      </div>
      <div className="skeleton" style={{ height: '140px', borderRadius: 'var(--radius-lg)' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="skeleton"
            style={{ height: '120px', borderRadius: 'var(--radius-lg)' }}
          />
        ))}
      </div>
    </div>
  );
}

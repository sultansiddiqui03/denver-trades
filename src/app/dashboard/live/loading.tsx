import React from 'react';
import styles from './loading.module.css';

export default function Loading() {
  return (
    <div className={styles.wrap}>
      <div className={styles.inner}>
        <div className={`skeleton ${styles.skelTitle}`} />
        <div className={`skeleton ${styles.skelSubtitle}`} />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={`ls-${i}`} className={`skeleton ${styles.skelCard}`} />
        ))}
      </div>
    </div>
  );
}

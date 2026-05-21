'use client';

import React from 'react';
import DocAuditor from '@/components/DocAuditor';
import styles from './page.module.css';

export default function DocumentAudit() {
  return (
    <div className={`${styles.docsContainer} fade-in`}>
      <div className={styles.docsHeader}>
        <h1 className={styles.docsTitle}>Document audit</h1>
        <p className="text-secondary" style={{ fontSize: '0.875rem' }}>
          Check B/Ls, invoices, and packing lists against L/C terms. Powered by Gemini.
        </p>
      </div>

      <DocAuditor />
    </div>
  );
}

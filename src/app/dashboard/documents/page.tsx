'use client';

import React from 'react';
import DocAuditor from '@/components/DocAuditor';
import styles from './page.module.css';

export default function DocumentAudit() {
  return (
    <div className={`${styles.docsContainer} fade-in`}>
      <div className={styles.docsHeader}>
        <h1 className={styles.docsTitle}>Document Compliance Audit</h1>
        <p className="text-secondary" style={{ fontSize: '0.875rem' }}>
          Instantly audit trade documents (Bill of Lading, Invoices, Packing Lists) against Letter of Credit terms to guarantee compliance using Gemini-2.5-Flash.
        </p>
      </div>

      <DocAuditor />
    </div>
  );
}

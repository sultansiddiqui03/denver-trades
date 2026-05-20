'use client';

import React from 'react';
import styles from '../DocAuditor.module.css';

export interface Discrepancy {
  severity: 'HIGH' | 'WARNING' | 'INFO';
  category: string;
  description: string;
}

export interface AuditData {
  id?: string;
  status: string;
  summary: string;
  discrepancies: Discrepancy[];
}

interface DocAuditResultProps {
  result: AuditData;
}

export default function DocAuditResult({ result }: DocAuditResultProps) {
  const count = result.discrepancies.length;
  const isCompliant = count === 0;

  return (
    <div className={styles.resultPanel}>
      <div className={styles.resultHeader}>
        <h3>Compliance Scan Results</h3>
        <span
          className={`${styles.statusBadge} ${
            isCompliant ? styles.statusPass : styles.statusFail
          }`}
        >
          {isCompliant ? 'Compliant' : `${count} Discrepanc${count === 1 ? 'y' : 'ies'} Found`}
        </span>
      </div>
      <p className={styles.summaryText}>{result.summary}</p>

      {count > 0 && (
        <ul className={styles.discrepancyList}>
          {result.discrepancies.map((d, index) => (
            <li key={`${d.severity}-${index}`} className={styles.discrepancyCard}>
              <div className={styles.discrepancyMeta}>
                <span className={`${styles.severity} ${styles[d.severity.toLowerCase()]}`}>
                  {d.severity}
                </span>
                <span className={styles.category}>{d.category}</span>
              </div>
              <p className={styles.desc}>{d.description}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

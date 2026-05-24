'use client';

import React from 'react';
import { BUYER_FIT_WEIGHTS } from '@/lib/scoring/buyerFit';
import styles from './ScoreBreakdown.module.css';

interface ScoreBreakdownProps {
  breakdown: {
    commodityMatch?: number;
    shipmentVolume?: number;
    recency?: number;
    tradeDirection?: number;
    marketFit?: number;
  };
}

const LABELS: { key: keyof typeof BUYER_FIT_WEIGHTS; label: string }[] = [
  { key: 'commodityMatch', label: 'Commodity' },
  { key: 'shipmentVolume', label: 'Volume' },
  { key: 'recency', label: 'Recency' },
  { key: 'tradeDirection', label: 'Direction' },
  { key: 'marketFit', label: 'Market' },
];

export default function ScoreBreakdown({ breakdown }: ScoreBreakdownProps) {
  return (
    <div className={styles.grid}>
      {LABELS.map(({ key, label }) => {
        const subScore = breakdown[key] ?? 0;
        const pct = Math.round(subScore * 100);
        return (
          <div key={key} className={styles.row}>
            <span className={styles.label}>{label}</span>
            <div className={styles.barTrack}>
              <div
                className={styles.barFill}
                style={{ width: `${pct}%` }}
                aria-label={`${label}: ${pct}%`}
              />
            </div>
            <span className={styles.pct}>{pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

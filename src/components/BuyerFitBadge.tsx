import React from 'react';
import { buyerFitTier } from '@/lib/scoring/buyerFit';
import styles from './BuyerFitBadge.module.css';

interface BuyerFitBadgeProps {
  /** 0-100 buyer-fit score, or null when the company hasn't been scored. */
  score: number | null | undefined;
  size?: 'sm' | 'md';
  /** Append a small "fit" label after the number. */
  showLabel?: boolean;
  className?: string;
}

/**
 * Compact buyer-fit score pill, colour-coded by tier (hot = lime, warm =
 * amber, cool = neutral). The single source of truth for the score chip on
 * company cards, the dossier, and the Buyer-Match leaderboard. Renders
 * nothing when the score is null so un-scored leads keep a stable layout.
 */
export default function BuyerFitBadge({
  score,
  size = 'sm',
  showLabel = false,
  className,
}: BuyerFitBadgeProps) {
  if (score === null || score === undefined || Number.isNaN(score)) return null;
  const rounded = Math.max(0, Math.min(100, Math.round(score)));
  const tier = buyerFitTier(rounded);
  const sizeClass = size === 'md' ? styles.sizeMd : styles.sizeSm;

  return (
    <span
      className={`${styles.badge} ${styles[`tier_${tier}`]} ${sizeClass}${
        className ? ` ${className}` : ''
      }`}
      title={`Buyer-fit score: ${rounded}/100`}
    >
      <span className={styles.score}>{rounded}</span>
      {showLabel ? <span className={styles.label}>fit</span> : null}
    </span>
  );
}

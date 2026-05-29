import React from 'react';
import { sourcingSignalMeta, type SourcingStatus } from '@/lib/signals/supplierShift';
import styles from './SourcingSignalBadge.module.css';

interface SourcingSignalLike {
  status?: string | null;
  headline?: string | null;
}

interface SourcingSignalBadgeProps {
  /** The `companies.sourcing_signal` jsonb (status + headline), or null. */
  signal: SourcingSignalLike | null | undefined;
  size?: 'sm' | 'md';
  className?: string;
}

const VARIANT_CLASS: Record<string, string> = {
  hot: 'hot',
  warn: 'warn',
  good: 'good',
  neutral: 'neutral',
};

/**
 * Supplier-shift signal pill — "Switching suppliers" (lime, high-intent),
 * "Volume declining" (amber), "Growing" (emerald), "Stable"/"New" (neutral).
 * Renders nothing when there's no signal, keeping layouts stable.
 */
export default function SourcingSignalBadge({
  signal,
  size = 'sm',
  className,
}: SourcingSignalBadgeProps) {
  const status = signal?.status as SourcingStatus | undefined;
  if (!status) return null;
  const meta = sourcingSignalMeta(status);
  const variantClass = styles[VARIANT_CLASS[meta.variant] ?? 'neutral'];
  const sizeClass = size === 'md' ? styles.sizeMd : styles.sizeSm;

  return (
    <span
      className={`${styles.badge} ${variantClass} ${sizeClass}${
        className ? ` ${className}` : ''
      }`}
      title={[meta.label, signal?.headline].filter(Boolean).join(' — ')}
    >
      {meta.label}
    </span>
  );
}

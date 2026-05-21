import React from 'react';
import { getIntent, type CompanyType } from '@/lib/intent';
import styles from './IntentChip.module.css';

interface IntentChipProps {
  /** Raw `companies.type` value — Importer / Exporter / Broker / null. */
  type: CompanyType | string | null | undefined;
  /** Visual scale. `sm` matches the card chips, `md` is hero-sized. */
  size?: 'sm' | 'md';
  /** Override the tooltip. Defaults to the intent's description prose. */
  title?: string;
  className?: string;
}

/**
 * BUYS / SELLS / BROKER pill — the one indicator a trader scanning a list
 * needs to see first. Coral for buyer (so it visually contrasts with the
 * lime "sell" accent), lime for seller, blue for broker, neutral grey
 * for un-enriched leads. See `src/lib/intent.ts` for the canonical mapping.
 */
export default function IntentChip({
  type,
  size = 'sm',
  title,
  className,
}: IntentChipProps) {
  const intent = getIntent(type ?? null);
  const sizeClass = size === 'md' ? styles.sizeMd : styles.sizeSm;
  const variantClass = styles[`intent_${intent.variant}`];

  return (
    <span
      className={`${styles.chip} ${sizeClass} ${variantClass}${
        className ? ` ${className}` : ''
      }`}
      title={title ?? intent.description}
    >
      {intent.label}
    </span>
  );
}

import { describe, it, expect } from 'vitest';
import {
  computeSourcingSignal,
  sourcingSignalMeta,
  type SignalShipment,
} from './supplierShift';

const DAY = 24 * 60 * 60 * 1000;
// Fixed "now" so window math (RECENT_DAYS=120, PRIOR_DAYS=365) is deterministic.
const NOW = Date.UTC(2026, 4, 26); // 2026-05-26
const daysAgo = (n: number) => new Date(NOW - n * DAY).toISOString();

/** `count` shipments from one supplier/origin at a fixed age, `mt` tonnes each. */
function ship(
  count: number,
  ageDays: number,
  supplier: string,
  origin: string,
  mt = 100,
): SignalShipment[] {
  return Array.from({ length: count }, () => ({
    supplier_name: supplier,
    origin_country: origin,
    shipment_date: daysAgo(ageDays),
    quantity_mt: mt,
  }));
}

describe('computeSourcingSignal — guards', () => {
  it('returns null with no dated shipments', () => {
    expect(computeSourcingSignal([], NOW)).toBeNull();
    expect(computeSourcingSignal([{ supplier_name: 'X' }], NOW)).toBeNull();
  });

  it('marks a thin, all-recent history as a new importer (low confidence)', () => {
    const sig = computeSourcingSignal(ship(3, 30, 'India Co', 'India'), NOW)!;
    expect(sig.status).toBe('new');
    expect(sig.confidence).toBe('low');
  });

  it('marks a thin history with older shipments as stable/limited', () => {
    const sig = computeSourcingSignal(
      [...ship(1, 30, 'A', 'India'), ...ship(3, 200, 'A', 'India')],
      NOW,
    )!;
    expect(sig.status).toBe('stable');
    expect(sig.headline).toMatch(/limited/i);
  });
});

describe('computeSourcingSignal — trends', () => {
  it('detects a supplier switch: established supplier collapses, a new one takes over', () => {
    const sig = computeSourcingSignal(
      [
        ...ship(10, 200, 'Vietnam Spice Co', 'Vietnam'),
        ...ship(5, 30, 'India Pepper Traders', 'India'),
      ],
      NOW,
    )!;
    expect(sig.status).toBe('switching');
    expect(sig.intent).toBe('high');
    expect(sig.decliningSupplier).toBe('Vietnam Spice Co');
    expect(sig.topSupplierNow).toBe('India Pepper Traders');
    expect(sig.dropPct).toBe(100);
    expect(sig.newOrigins).toContain('India');
  });

  it('flags a dormant importer (imports paused) as high-intent declining', () => {
    const sig = computeSourcingSignal(ship(6, 200, 'Vietnam Spice Co', 'Vietnam'), NOW)!;
    expect(sig.status).toBe('declining');
    expect(sig.intent).toBe('high');
    expect(sig.dropPct).toBe(100);
    expect(sig.decliningSupplier).toBe('Vietnam Spice Co');
    expect(sig.headline).toMatch(/paused/i);
  });

  it('detects declining volume from the same supplier (~49% drop)', () => {
    const sig = computeSourcingSignal(
      [
        ...ship(12, 200, 'Vietnam Spice Co', 'Vietnam'),
        ...ship(2, 30, 'Vietnam Spice Co', 'Vietnam'),
      ],
      NOW,
    )!;
    expect(sig.status).toBe('declining');
    expect(sig.dropPct).toBe(49);
  });

  it('detects growing volume from the same supplier', () => {
    const sig = computeSourcingSignal(
      [
        ...ship(5, 200, 'Vietnam Spice Co', 'Vietnam'),
        ...ship(6, 30, 'Vietnam Spice Co', 'Vietnam'),
      ],
      NOW,
    )!;
    expect(sig.status).toBe('growing');
    expect(sig.intent).toBe('low');
  });

  it('reports stable sourcing when volume holds steady', () => {
    const sig = computeSourcingSignal(
      [
        ...ship(10, 200, 'Vietnam Spice Co', 'Vietnam'),
        ...ship(3, 30, 'Vietnam Spice Co', 'Vietnam'),
      ],
      NOW,
    )!;
    expect(sig.status).toBe('stable');
  });
});

describe('sourcingSignalMeta', () => {
  it.each([
    ['switching', 'hot'],
    ['declining', 'warn'],
    ['growing', 'good'],
    ['new', 'neutral'],
    ['stable', 'neutral'],
  ] as const)('%s → %s variant', (status, variant) => {
    expect(sourcingSignalMeta(status).variant).toBe(variant);
  });
});

/**
 * Supplier-displacement signal.
 *
 * The single most actionable insight in customs data: a buyer whose volume
 * from their established supplier is dropping — or who has started sourcing
 * from a new origin — is *actively shopping*. That's the moment to reach out.
 *
 * Pure + dependency-free. Computes a {@link SourcingSignal} by comparing a
 * recent window of a company's shipments against the preceding window. Cached
 * on `companies.sourcing_signal` (computed at scrape ingest by
 * [runSignals.ts](./runSignals.ts) and surfaced on the dossier + Demand Radar).
 */

export type SourcingStatus = 'switching' | 'declining' | 'growing' | 'stable' | 'new';

export interface SignalShipment {
  supplier_name?: string | null;
  origin_country?: string | null;
  destination_country?: string | null;
  product?: string | null;
  shipment_date?: string | null;
  quantity_mt?: number | null;
  weight_kg?: number | null;
}

export interface SourcingSignal {
  status: SourcingStatus;
  /** One-line summary for badges/cards. */
  headline: string;
  /** How urgently a seller should act on this. */
  intent: 'high' | 'medium' | 'low';
  /** % the displaced/declining supplier's rate fell (0-100), when relevant. */
  dropPct?: number;
  /** Supplier losing share, when status is switching/declining. */
  decliningSupplier?: string;
  /** Supplier with the most recent-window volume. */
  topSupplierNow?: string;
  /** Origin countries seen in the recent window but not before. */
  newOrigins?: string[];
  recentVolumeMt?: number;
  priorVolumeMt?: number;
  /** Bullet evidence strings for the UI. */
  evidence: string[];
}

const DAY = 24 * 60 * 60 * 1000;
const RECENT_DAYS = 120; // ~4 months
const PRIOR_DAYS = 360; // the ~12 months before that

function volumeOf(s: SignalShipment): number {
  if (typeof s.quantity_mt === 'number' && s.quantity_mt > 0) return s.quantity_mt;
  if (typeof s.weight_kg === 'number' && s.weight_kg > 0) return s.weight_kg / 1000;
  return 1; // fall back to shipment count
}

function topKey(map: Map<string, number>): { key: string; value: number } | null {
  let best: { key: string; value: number } | null = null;
  for (const [key, value] of map) {
    if (!best || value > best.value) best = { key, value };
  }
  return best;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Compute the sourcing signal for one company from its shipment rows. Returns
 * `null` when there are no shipments (caller should leave the column null).
 */
export function computeSourcingSignal(
  shipments: SignalShipment[],
  now: number = Date.now(),
): SourcingSignal | null {
  const dated = shipments.filter((s) => s.shipment_date);
  if (dated.length === 0) return null;

  const recentStart = now - RECENT_DAYS * DAY;
  const priorStart = now - (RECENT_DAYS + PRIOR_DAYS) * DAY;

  const recent: SignalShipment[] = [];
  const prior: SignalShipment[] = [];
  for (const s of dated) {
    const t = new Date(s.shipment_date as string).getTime();
    if (Number.isNaN(t)) continue;
    if (t >= recentStart) recent.push(s);
    else if (t >= priorStart) prior.push(s);
  }

  const sumVol = (arr: SignalShipment[]) => arr.reduce((a, s) => a + volumeOf(s), 0);
  const bySupplier = (arr: SignalShipment[]) => {
    const m = new Map<string, number>();
    for (const s of arr) {
      const name = (s.supplier_name ?? '').trim();
      if (!name) continue;
      m.set(name, (m.get(name) ?? 0) + volumeOf(s));
    }
    return m;
  };
  const originsOf = (arr: SignalShipment[]) =>
    new Set(arr.map((s) => (s.origin_country ?? '').trim()).filter(Boolean));

  const recentVol = sumVol(recent);
  const priorVol = sumVol(prior);
  const recentRate = recent.length > 0 ? recentVol / RECENT_DAYS : 0;
  const priorRate = prior.length > 0 ? priorVol / PRIOR_DAYS : 0;

  const recentTop = topKey(bySupplier(recent));
  const priorTop = topKey(bySupplier(prior));
  const recentOrigins = originsOf(recent);
  const priorOrigins = originsOf(prior);
  const newOrigins = [...recentOrigins].filter((o) => !priorOrigins.has(o));

  const evidence: string[] = [];
  const recentVolStr = round1(recentVol).toLocaleString('en-US');
  const priorVolStr = round1(priorVol).toLocaleString('en-US');

  // No prior history → newly observed importer.
  if (prior.length === 0) {
    return {
      status: 'new',
      headline: 'Newly observed importer',
      intent: 'medium',
      topSupplierNow: recentTop?.key,
      newOrigins: newOrigins.length ? newOrigins : undefined,
      recentVolumeMt: round1(recentVol),
      evidence: [
        `${recent.length} shipment${recent.length === 1 ? '' : 's'} in the last ${RECENT_DAYS} days`,
        recentTop ? `Sourcing from ${recentTop.key}` : '',
      ].filter(Boolean),
    };
  }

  // Supplier switch: the established supplier is no longer the top in the
  // recent window, and its rate has materially fallen.
  if (
    priorTop &&
    recentTop &&
    priorTop.key !== recentTop.key
  ) {
    const priorTopPriorRate = (bySupplier(prior).get(priorTop.key) ?? 0) / PRIOR_DAYS;
    const priorTopRecentRate = (bySupplier(recent).get(priorTop.key) ?? 0) / RECENT_DAYS;
    const dropPct =
      priorTopPriorRate > 0
        ? Math.max(0, Math.min(100, Math.round((1 - priorTopRecentRate / priorTopPriorRate) * 100)))
        : 100;
    if (dropPct >= 35) {
      evidence.push(`${priorTop.key} volume down ~${dropPct}%`);
      evidence.push(`Now sourcing mainly from ${recentTop.key}`);
      if (newOrigins.length) evidence.push(`New origin: ${newOrigins.join(', ')}`);
      return {
        status: 'switching',
        headline: `Switching suppliers — ${priorTop.key} → ${recentTop.key}`,
        intent: 'high',
        dropPct,
        decliningSupplier: priorTop.key,
        topSupplierNow: recentTop.key,
        newOrigins: newOrigins.length ? newOrigins : undefined,
        recentVolumeMt: round1(recentVol),
        priorVolumeMt: round1(priorVol),
        evidence,
      };
    }
  }

  // Overall volume trend.
  if (priorRate > 0 && recentRate < priorRate * 0.7) {
    const dropPct = Math.round((1 - recentRate / priorRate) * 100);
    evidence.push(`Import rate down ~${dropPct}% vs prior period`);
    if (newOrigins.length) evidence.push(`Trying new origin: ${newOrigins.join(', ')}`);
    return {
      status: 'declining',
      headline: `Import volume declining (~${dropPct}%)`,
      intent: newOrigins.length ? 'high' : 'medium',
      dropPct,
      decliningSupplier: priorTop?.key,
      topSupplierNow: recentTop?.key,
      newOrigins: newOrigins.length ? newOrigins : undefined,
      recentVolumeMt: round1(recentVol),
      priorVolumeMt: round1(priorVol),
      evidence,
    };
  }

  if (priorRate > 0 && recentRate > priorRate * 1.3) {
    const upPct = Math.round((recentRate / priorRate - 1) * 100);
    evidence.push(`Import rate up ~${upPct}% vs prior period`);
    return {
      status: 'growing',
      headline: `Import volume growing (~${upPct}%)`,
      intent: 'low',
      topSupplierNow: recentTop?.key,
      newOrigins: newOrigins.length ? newOrigins : undefined,
      recentVolumeMt: round1(recentVol),
      priorVolumeMt: round1(priorVol),
      evidence,
    };
  }

  evidence.push(`Steady volume (~${recentVolStr} MT recent vs ${priorVolStr} MT prior)`);
  return {
    status: 'stable',
    headline: 'Stable sourcing',
    intent: 'low',
    topSupplierNow: recentTop?.key,
    recentVolumeMt: round1(recentVol),
    priorVolumeMt: round1(priorVol),
    evidence,
  };
}

/** Label + tone for the badge. */
export function sourcingSignalMeta(status: SourcingStatus): {
  label: string;
  variant: 'hot' | 'warn' | 'good' | 'neutral';
} {
  switch (status) {
    case 'switching':
      return { label: 'Switching suppliers', variant: 'hot' };
    case 'declining':
      return { label: 'Volume declining', variant: 'warn' };
    case 'growing':
      return { label: 'Growing', variant: 'good' };
    case 'new':
      return { label: 'New importer', variant: 'neutral' };
    default:
      return { label: 'Stable', variant: 'neutral' };
  }
}

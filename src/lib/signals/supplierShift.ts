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
  /** Rough confidence based on how much shipment history backs the signal. */
  confidence?: 'high' | 'medium' | 'low';
}

const DAY = 24 * 60 * 60 * 1000;
const RECENT_DAYS = 120; // ~4 months
const PRIOR_DAYS = 365; // the ~12 months before that

// Tuning guards — raise the bar so we don't flag noise on thin histories.
const MIN_TOTAL_SHIPMENTS = 5; // need a real history before asserting a trend
const MIN_RECENT_SHIPMENTS = 2; // one stray recent shipment isn't a "switch"
const SWITCH_DROP_PCT = 40; // prior-top supplier must fall at least this %
const SWITCH_NEW_SHARE = 0.4; // and the new top must hold >= this recent-volume share
const DECLINE_RATIO = 0.6; // recent rate < 60% of prior = declining
const GROW_RATIO = 1.4; // recent rate > 140% of prior = growing

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

  const confidence: 'high' | 'medium' | 'low' =
    dated.length >= 12 ? 'high' : dated.length > MIN_TOTAL_SHIPMENTS ? 'medium' : 'low';
  const recentVolStr = round1(recentVol).toLocaleString('en-US');
  const priorVolStr = round1(priorVol).toLocaleString('en-US');

  // Thin history → don't assert a trend we can't support.
  if (dated.length < MIN_TOTAL_SHIPMENTS) {
    return {
      status: prior.length === 0 ? 'new' : 'stable',
      headline: prior.length === 0 ? 'Newly observed importer' : 'Limited shipment history',
      intent: 'low',
      confidence: 'low',
      topSupplierNow: recentTop?.key,
      recentVolumeMt: round1(recentVol),
      evidence: [
        `${dated.length} shipment${dated.length === 1 ? '' : 's'} on record — limited history`,
      ],
    };
  }

  // Dormant: was importing, nothing recent — strong "lost their supplier" signal.
  if (recent.length === 0 && prior.length > 0) {
    return {
      status: 'declining',
      headline: 'Imports paused — no recent shipments',
      intent: 'high',
      confidence,
      dropPct: 100,
      decliningSupplier: priorTop?.key,
      recentVolumeMt: 0,
      priorVolumeMt: round1(priorVol),
      evidence: [
        `No shipments in the last ${RECENT_DAYS} days (previously active)`,
        priorTop ? `Previously sourced from ${priorTop.key}` : '',
      ].filter(Boolean),
    };
  }

  // No prior history → newly observed importer (with enough recent to be real).
  if (prior.length === 0) {
    return {
      status: 'new',
      headline: 'Newly observed importer',
      intent: 'medium',
      confidence,
      topSupplierNow: recentTop?.key,
      newOrigins: newOrigins.length ? newOrigins : undefined,
      recentVolumeMt: round1(recentVol),
      evidence: [
        `${recent.length} shipments in the last ${RECENT_DAYS} days`,
        recentTop ? `Sourcing from ${recentTop.key}` : '',
      ].filter(Boolean),
    };
  }

  // Supplier switch: established supplier dropped sharply AND a different
  // supplier now holds a meaningful share of recent volume.
  if (
    priorTop &&
    recentTop &&
    priorTop.key !== recentTop.key &&
    recent.length >= MIN_RECENT_SHIPMENTS
  ) {
    const priorTopPriorRate = (bySupplier(prior).get(priorTop.key) ?? 0) / PRIOR_DAYS;
    const priorTopRecentRate = (bySupplier(recent).get(priorTop.key) ?? 0) / RECENT_DAYS;
    const dropPct =
      priorTopPriorRate > 0
        ? Math.max(0, Math.min(100, Math.round((1 - priorTopRecentRate / priorTopPriorRate) * 100)))
        : 100;
    const newTopShare = recentVol > 0 ? recentTop.value / recentVol : 0;
    if (dropPct >= SWITCH_DROP_PCT && newTopShare >= SWITCH_NEW_SHARE) {
      const evidence = [
        `${priorTop.key} volume down ~${dropPct}%`,
        `Now sourcing mainly from ${recentTop.key}`,
      ];
      if (newOrigins.length) evidence.push(`New origin: ${newOrigins.join(', ')}`);
      return {
        status: 'switching',
        headline: `Switching suppliers — ${priorTop.key} → ${recentTop.key}`,
        intent: 'high',
        confidence,
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
  if (priorRate > 0 && recentRate < priorRate * DECLINE_RATIO) {
    const dropPct = Math.round((1 - recentRate / priorRate) * 100);
    const evidence = [`Import rate down ~${dropPct}% vs prior period`];
    if (newOrigins.length) evidence.push(`Trying new origin: ${newOrigins.join(', ')}`);
    return {
      status: 'declining',
      headline: `Import volume declining (~${dropPct}%)`,
      intent: newOrigins.length ? 'high' : 'medium',
      confidence,
      dropPct,
      decliningSupplier: priorTop?.key,
      topSupplierNow: recentTop?.key,
      newOrigins: newOrigins.length ? newOrigins : undefined,
      recentVolumeMt: round1(recentVol),
      priorVolumeMt: round1(priorVol),
      evidence,
    };
  }

  if (priorRate > 0 && recentRate > priorRate * GROW_RATIO) {
    const upPct = Math.round((recentRate / priorRate - 1) * 100);
    return {
      status: 'growing',
      headline: `Import volume growing (~${upPct}%)`,
      intent: 'low',
      confidence,
      topSupplierNow: recentTop?.key,
      newOrigins: newOrigins.length ? newOrigins : undefined,
      recentVolumeMt: round1(recentVol),
      priorVolumeMt: round1(priorVol),
      evidence: [`Import rate up ~${upPct}% vs prior period`],
    };
  }

  return {
    status: 'stable',
    headline: 'Stable sourcing',
    intent: 'low',
    confidence,
    topSupplierNow: recentTop?.key,
    recentVolumeMt: round1(recentVol),
    priorVolumeMt: round1(priorVol),
    evidence: [`Steady volume (~${recentVolStr} MT recent vs ${priorVolStr} MT prior)`],
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

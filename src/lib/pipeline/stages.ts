/**
 * Trade pipeline stage taxonomy.
 *
 * The DB enforces these nine values via the `deals_pipeline_stage_check`
 * CHECK constraint added in `supabase/migrations/20260521120000_pipeline_trade_stages.sql`.
 * Keep this file in sync with that migration — any change here without a
 * matching migration will produce stage-update failures at the DB layer.
 *
 * Closed Won / Closed Lost remain distinct values for reporting but the UI
 * groups them visually under one terminal column header ("Closed").
 */

export const DEAL_STAGES = [
  'New Lead',
  'Qualified',
  'Sample Sent',
  'Quote Issued',
  'Negotiation',
  'PO Confirmed',
  'Shipped',
  'Closed Won',
  'Closed Lost',
] as const;

export type DealStage = (typeof DEAL_STAGES)[number];

/** Variant key — drives the column colour. */
export type StageVariant =
  | 'neutral'
  | 'amber'
  | 'blue'
  | 'violet'
  | 'orange'
  | 'lime'
  | 'cyan'
  | 'green'
  | 'red';

export interface StageMeta {
  /** Canonical value stored in `deals_pipeline.stage`. */
  key: DealStage;
  /** Short human-readable column label. */
  label: string;
  /** One-line description shown in tooltips / empty states. */
  description: string;
  /** Variant tag — CSS Modules look up `.stage_<variant>`. */
  variant: StageVariant;
}

/**
 * Ordered list of stages as they appear left-to-right on the kanban. Closed
 * Lost is placed after Closed Won so moving "backward" from a lost deal still
 * lands on a sensible neighbour, but the visual column treats them as one.
 */
export const STAGE_META: readonly StageMeta[] = [
  {
    key: 'New Lead',
    label: 'New Lead',
    description: 'Just identified, no contact yet.',
    variant: 'neutral',
  },
  {
    key: 'Qualified',
    label: 'Qualified',
    description: 'First reply received, buying capacity / supply validated.',
    variant: 'amber',
  },
  {
    key: 'Sample Sent',
    label: 'Sample Sent',
    description: 'Physical sample on the way to the buyer.',
    variant: 'blue',
  },
  {
    key: 'Quote Issued',
    label: 'Quote Issued',
    description: 'Formal price quote (CIF / FOB, container count) sent.',
    variant: 'violet',
  },
  {
    key: 'Negotiation',
    label: 'Negotiation',
    description: 'Back-and-forth on price, terms, or incoterms.',
    variant: 'orange',
  },
  {
    key: 'PO Confirmed',
    label: 'PO Confirmed',
    description: 'Purchase order signed, awaiting payment / L/C.',
    variant: 'lime',
  },
  {
    key: 'Shipped',
    label: 'Shipped',
    description: 'Booking issued, container left the port.',
    variant: 'cyan',
  },
  {
    key: 'Closed Won',
    label: 'Closed Won',
    description: 'Deal completed — revenue recognised.',
    variant: 'green',
  },
  {
    key: 'Closed Lost',
    label: 'Closed Lost',
    description: 'Deal lost — note the reason in deal notes.',
    variant: 'red',
  },
] as const;

const STAGE_SET = new Set<DealStage>(DEAL_STAGES);

/**
 * Coerce any raw DB string to a known stage. Returns `New Lead` for null /
 * unknown values so an out-of-band write can't crash the board.
 */
export function normalizeStage(raw: string | null | undefined): DealStage {
  if (raw && STAGE_SET.has(raw as DealStage)) return raw as DealStage;
  return 'New Lead';
}

export function isDealStage(value: unknown): value is DealStage {
  return typeof value === 'string' && STAGE_SET.has(value as DealStage);
}

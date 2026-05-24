/**
 * Opportunity detection.
 *
 * Turns raw events (an inbound demand, a company's sourcing signal, a buyer-fit
 * score) into a scored, deduped {@link OpportunityCandidate} when — and only
 * when — it's something the org should act on. Pure + dependency-light so it
 * can run at ingest time (webhook / scrape) or in a backfill.
 */
import { matchesOrgCommodity } from '@/lib/scoring/buyerFit';

export type OpportunityType =
  | 'demand_match'
  | 'supplier_switch'
  | 'new_fit_buyer'
  | 'volume_spike';

export interface OpportunityCandidate {
  type: OpportunityType;
  title: string;
  summary: string;
  priority: number; // 0-100, higher = hotter
  product?: string | null;
  companyId?: string | null;
  threadId?: string | null;
  evidence?: Record<string, unknown>;
  /** Stable key so re-detection upserts instead of duplicating. */
  dedupeKey: string;
}

export interface OppOrg {
  commodities?: string[] | null;
  target_markets?: string[] | null;
}

export interface DemandLike {
  product?: string | null;
  quantity?: string | null;
  incoterm?: string | null;
  port?: string | null;
  raw_intent?: string | null;
  has_demand?: boolean | null;
}

export interface CompanyLike {
  id: string;
  name: string;
  type?: string | null;
  products_dealt?: string[] | null;
  hs_codes?: unknown;
  buyer_fit_score?: number | null;
  sourcing_signal?: {
    status?: string | null;
    headline?: string | null;
    intent?: string | null;
  } | null;
}

const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

function companyProducts(c: CompanyLike): string[] {
  const out = [...(c.products_dealt ?? [])];
  if (Array.isArray(c.hs_codes)) {
    for (const h of c.hs_codes) {
      if (h && typeof h === 'object') {
        const obj = h as Record<string, unknown>;
        const v = obj.description ?? obj.code;
        if (typeof v === 'string') out.push(v);
      }
    }
  }
  return out.filter(Boolean);
}

function companyMatchesOrg(c: CompanyLike, org: OppOrg): boolean {
  const commodities = (org.commodities ?? []).filter(Boolean);
  if (commodities.length === 0) return true;
  return companyProducts(c).some((p) => matchesOrgCommodity(p, commodities));
}

/** Inbound buyer demand matching what the org sells — an act-now lead. */
export function detectDemandOpportunity(
  demand: DemandLike,
  threadId: string,
  org: OppOrg,
): OpportunityCandidate | null {
  const product = demand.product?.trim();
  if (!product) return null;
  const commodities = (org.commodities ?? []).filter(Boolean);
  const matches = commodities.length === 0 || matchesOrgCommodity(product, commodities);
  const qty = demand.quantity ? `${demand.quantity} ` : '';
  const lane = demand.port ? ` to ${demand.port}` : '';
  const inco = demand.incoterm ? ` (${demand.incoterm})` : '';
  return {
    type: 'demand_match',
    title: `Buyer wants ${product}`,
    summary: `${qty}${product}${inco}${lane} — inbound request${
      matches ? ' matching your commodities' : ''
    }.`,
    priority: clamp(matches ? 88 : 60),
    product,
    threadId,
    evidence: {
      quantity: demand.quantity ?? null,
      incoterm: demand.incoterm ?? null,
      port: demand.port ?? null,
      raw_intent: demand.raw_intent ?? null,
      matchesCommodities: matches,
    },
    dedupeKey: `demand:${threadId}`,
  };
}

/** A buyer who just started switching / reducing supply for what you sell. */
export function detectSwitchOpportunity(
  c: CompanyLike,
  org: OppOrg,
): OpportunityCandidate | null {
  const status = c.sourcing_signal?.status;
  if (status !== 'switching' && status !== 'declining') return null;
  if (!companyMatchesOrg(c, org)) return null;
  const base = status === 'switching' ? 92 : 76;
  const fitBoost = (c.buyer_fit_score ?? 0) * 0.05;
  return {
    type: 'supplier_switch',
    title: `${c.name} is ${status === 'switching' ? 'switching suppliers' : 'reducing imports'}`,
    summary:
      c.sourcing_signal?.headline ??
      `${c.name} shows a ${status} sourcing signal — high intent to engage.`,
    priority: clamp(base + fitBoost),
    companyId: c.id,
    evidence: {
      status,
      headline: c.sourcing_signal?.headline ?? null,
      buyerFit: c.buyer_fit_score ?? null,
    },
    dedupeKey: `switch:${c.id}:${status}`,
  };
}

/** A freshly-scored, high-fit importer for the org's commodities. */
export function detectFitBuyerOpportunity(
  c: CompanyLike,
  org: OppOrg,
): OpportunityCandidate | null {
  const score = c.buyer_fit_score ?? 0;
  if (score < 70) return null;
  if ((c.type ?? '').toLowerCase() === 'exporter') return null; // we want buyers
  if (!companyMatchesOrg(c, org)) return null;
  return {
    type: 'new_fit_buyer',
    title: `High-fit buyer: ${c.name}`,
    summary: `${c.name} scores ${Math.round(score)}/100 on your commodities — strong buyer-fit.`,
    priority: clamp(score),
    companyId: c.id,
    evidence: { buyerFit: score, products: companyProducts(c).slice(0, 5) },
    dedupeKey: `fitbuyer:${c.id}`,
  };
}

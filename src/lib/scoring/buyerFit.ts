/**
 * Buyer-fit scoring.
 *
 * Turns the customs-grade intelligence we now capture (shipment volume,
 * recency, HS-coded products, trade lanes) into a single 0-100 score that
 * answers the only question a trade-CRM user actually has: *"of all these
 * companies, which ones should I reach out to first?"*
 *
 * The score is computed against the SIGNED-IN ORG's profile — the commodities
 * they trade and the markets they target (captured during onboarding). It
 * assumes the org is SELLING and looking for buyers, so an `Importer` with
 * heavy recent shipments of a matching commodity scores highest.
 *
 * Pure + dependency-free so it can run server-side at ingest, in a backfill
 * job, or live inside the Buyer-Match engine without touching the DB.
 */

export interface BuyerFitCompany {
  type?: string | null;
  products_dealt?: string[] | null;
  origin_countries?: string[] | null;
  destination_countries?: string[] | null;
  hq_country?: string | null;
  total_shipments?: number | null;
  last_shipment_date?: string | null;
  /** jsonb array of { code, description, shipments } */
  hs_codes?: unknown;
}

export interface BuyerFitOrg {
  commodities?: string[] | null;
  target_markets?: string[] | null;
}

export interface BuyerFitBreakdown {
  /** Each sub-score is normalised 0-1; multiply by its weight for points. */
  commodityMatch: number;
  shipmentVolume: number;
  recency: number;
  tradeDirection: number;
  marketFit: number;
}

export interface BuyerFitResult {
  /** 0-100, rounded. */
  score: number;
  breakdown: BuyerFitBreakdown;
  /** Human-readable justifications for the UI ("1,240 shipments on record"). */
  reasons: string[];
}

/** Points each component contributes at a perfect (1.0) sub-score. Sums to 100. */
export const BUYER_FIT_WEIGHTS = {
  commodityMatch: 40,
  shipmentVolume: 25,
  recency: 15,
  tradeDirection: 10,
  marketFit: 10,
} as const;

const norm = (s: string): string => s.toLowerCase().trim();

/** Loose containment match in either direction (e.g. "pepper" ~ "black pepper"). */
function looseMatch(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/**
 * Broad commodity → member-product taxonomy. Org commodities are often
 * generic categories ("spices", "grains") while company products are specific
 * ("Black Pepper 550 ASTA"). Without this map a perfect buyer would score 0
 * on commodity fit. Keep entries lowercase; extend freely.
 */
const COMMODITY_TAXONOMY: Record<string, string[]> = {
  spices: [
    'pepper', 'cumin', 'coriander', 'cardamom', 'cinnamon', 'cassia', 'clove',
    'chilli', 'chili', 'ginger', 'turmeric', 'nutmeg', 'fennel', 'fenugreek',
    'star anise', 'mace', 'paprika', 'saffron', 'spice',
  ],
  grains: [
    'rice', 'basmati', 'jasmine rice', 'wheat', 'maize', 'corn', 'barley',
    'sorghum', 'millet', 'oats', 'pulses', 'lentil', 'chickpea', 'grain',
  ],
  oilseeds: [
    'sesame', 'groundnut', 'peanut', 'soybean', 'soya', 'sunflower', 'mustard',
    'rapeseed', 'canola', 'castor', 'oilseed', 'cashew',
  ],
  coffee: ['coffee', 'arabica', 'robusta', 'espresso', 'green coffee'],
  nuts: ['cashew', 'almond', 'walnut', 'pistachio', 'hazelnut', 'nut'],
};

/**
 * Does an org commodity match a company product? Direct loose match first,
 * then category → member expansion via the taxonomy.
 */
function commodityMatches(commodity: string, product: string): boolean {
  if (looseMatch(commodity, product)) return true;
  const members = COMMODITY_TAXONOMY[norm(commodity)];
  if (members) {
    const p = norm(product);
    if (members.some((m) => p.includes(m))) return true;
  }
  return false;
}

/**
 * Target markets are also generic ("UAE", "Europe") while company locations
 * are specific country names ("United Arab Emirates", "Germany"). Map region /
 * abbreviation → member countries so market fit isn't silently missed.
 */
const MARKET_TAXONOMY: Record<string, string[]> = {
  uae: ['united arab emirates', 'emirates', 'dubai', 'sharjah', 'abu dhabi', 'ajman'],
  'saudi arabia': ['saudi', 'ksa', 'riyadh', 'jeddah', 'dammam'],
  gcc: ['united arab emirates', 'saudi', 'qatar', 'kuwait', 'bahrain', 'oman'],
  europe: [
    'germany', 'france', 'italy', 'spain', 'netherlands', 'poland', 'austria',
    'belgium', 'united kingdom', 'uk', 'portugal', 'greece', 'sweden',
    'denmark', 'switzerland', 'czech', 'romania', 'hungary', 'ireland', 'europe',
  ],
};

function marketMatches(orgMarket: string, companyMarket: string): boolean {
  if (looseMatch(orgMarket, companyMarket)) return true;
  const aliases = MARKET_TAXONOMY[norm(orgMarket)];
  if (aliases) {
    const cm = norm(companyMarket);
    if (aliases.some((a) => cm.includes(a) || a.includes(cm))) return true;
  }
  return false;
}

/** Pull product-ish strings out of the hs_codes jsonb column. */
function hsCodeProducts(hsCodes: unknown): string[] {
  if (!Array.isArray(hsCodes)) return [];
  const out: string[] = [];
  for (const raw of hsCodes) {
    if (typeof raw === 'string') {
      out.push(raw);
    } else if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      const v = obj.description ?? obj.code ?? obj.product;
      if (typeof v === 'string') out.push(v);
    }
  }
  return out;
}

function monthsSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const ms = Date.now() - then.getTime();
  return ms / (1000 * 60 * 60 * 24 * 30.44);
}

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/**
 * Score one company for one org. Returns 0-100 + a per-component breakdown +
 * reasons. Designed to degrade gracefully: a company with no customs data
 * still gets a (low) commodity/direction-based score rather than throwing.
 */
export function scoreBuyerFit(company: BuyerFitCompany, org: BuyerFitOrg): BuyerFitResult {
  const reasons: string[] = [];

  const orgCommodities = (org.commodities ?? []).filter(Boolean);
  const orgMarkets = (org.target_markets ?? []).filter(Boolean);

  // 1. Commodity match — overlap of the org's commodities with the company's
  //    declared products AND its HS-coded customs products.
  const companyProducts = [
    ...(company.products_dealt ?? []),
    ...hsCodeProducts(company.hs_codes),
  ].filter(Boolean);

  let commodityMatch: number;
  if (orgCommodities.length === 0) {
    // Org hasn't told us what they trade — can't assess, stay neutral.
    commodityMatch = 0.5;
  } else if (companyProducts.length === 0) {
    commodityMatch = 0.1;
  } else {
    const matched = orgCommodities.filter((c) =>
      companyProducts.some((p) => commodityMatches(c, p)),
    );
    commodityMatch = Math.min(1, matched.length / orgCommodities.length);
    if (matched.length > 0) {
      reasons.push(
        `Trades ${matched.slice(0, 3).join(', ')}${matched.length > 3 ? '…' : ''}`,
      );
    }
  }

  // 2. Shipment volume — log-scaled so 1,000+ shipments ≈ full marks.
  const total = company.total_shipments ?? 0;
  const shipmentVolume = total > 0 ? Math.min(1, Math.log10(total + 1) / 3) : 0;
  if (total > 0) reasons.push(`${formatNumber(total)} shipments on record`);

  // 3. Recency — full marks within 3 months, linear decay to 0 by 24 months.
  const months = monthsSince(company.last_shipment_date);
  let recency: number;
  if (months === null) {
    recency = total > 0 ? 0.25 : 0;
  } else if (months <= 3) {
    recency = 1;
    reasons.push('Active in the last quarter');
  } else if (months >= 24) {
    recency = 0;
  } else {
    recency = 1 - (months - 3) / 21;
  }

  // 4. Trade direction — assumes the org is selling and wants buyers.
  const type = (company.type ?? '').toLowerCase();
  let tradeDirection: number;
  if (type === 'importer') {
    tradeDirection = 1;
    reasons.push('Importer — actively buys');
  } else if (type === 'broker') {
    tradeDirection = 0.6;
  } else if (type === 'exporter') {
    tradeDirection = 0.3;
  } else {
    tradeDirection = 0.5;
  }

  // 5. Market fit — does the company touch any of the org's target markets?
  const companyMarkets = [
    company.hq_country,
    ...(company.destination_countries ?? []),
    ...(company.origin_countries ?? []),
  ].filter((m): m is string => Boolean(m));
  let marketFit: number;
  if (orgMarkets.length === 0) {
    marketFit = 0.5;
  } else {
    const hit = orgMarkets.find((m) => companyMarkets.some((cm) => marketMatches(m, cm)));
    if (hit) {
      marketFit = 1;
      reasons.push(`In target market: ${hit}`);
    } else {
      marketFit = 0.2;
    }
  }

  const breakdown: BuyerFitBreakdown = {
    commodityMatch,
    shipmentVolume,
    recency,
    tradeDirection,
    marketFit,
  };

  const score = Math.round(
    breakdown.commodityMatch * BUYER_FIT_WEIGHTS.commodityMatch +
      breakdown.shipmentVolume * BUYER_FIT_WEIGHTS.shipmentVolume +
      breakdown.recency * BUYER_FIT_WEIGHTS.recency +
      breakdown.tradeDirection * BUYER_FIT_WEIGHTS.tradeDirection +
      breakdown.marketFit * BUYER_FIT_WEIGHTS.marketFit,
  );

  return { score: Math.max(0, Math.min(100, score)), breakdown, reasons };
}

/** Coarse label for a score, for chips/badges. */
export function buyerFitTier(score: number): 'hot' | 'warm' | 'cool' {
  if (score >= 70) return 'hot';
  if (score >= 40) return 'warm';
  return 'cool';
}

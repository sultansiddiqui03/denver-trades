import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import { runApifyActorSync } from '@/lib/agents/dispatchScrape';
import { mapItems } from '@/lib/agents/scraperActors';
import type { ScrapedHsCode, ScrapedPlace } from '@/lib/agents/apifyReplay';
import { scoreOrgCompanies } from '@/lib/scoring/runScoring';
import { detectFromCompany } from '@/lib/opportunities/runDetect';
import {
  fuzzySameName,
  normalizeCoreName,
  levenshtein,
  upsertCanonicalCompany,
} from '@/lib/entity/companyMatch';
import { normalizeProductQuery } from '@/lib/agents/productQuery';

/**
 * Product → buyer discovery engine — the scalable wedge.
 *
 * "Find buyers who provably import what you sell." ImportYeti has no single
 * call that returns "buyers of black pepper": a product/keyword search returns
 * overseas SUPPLIERS of that product, and the US BUYERS only exist as each
 * supplier's `topTradingPartners` (the US importers who buy from them). This
 * engine turns a product term into a ranked list of real US buyers:
 *
 *   1. Run a `type:'any'` product search (synchronously) → supplier records.
 *   2. Keep only suppliers that genuinely DEAL the commodity, judged by HS
 *      chapter DOMINANCE — the commodity's customs chapter (spices = 09) must
 *      be the supplier's top chapter or ≥25% of its shipments. This is the
 *      accuracy crux: a naive "has chapter 09" test wrongly keeps Black&Decker
 *      (one incidental spice shipment among 18 chapters of tools) and a
 *      name-based test wrongly keeps "King Pepper Products" (a sauces importer).
 *   3. Harvest the US trading partners of the relevant suppliers → these are
 *      the buyers. Rank by how many distinct relevant suppliers ship to them.
 *   4. Upsert each as an `Importer` company with customs-derived evidence, then
 *      buyer-fit-score them and run opportunity detection.
 *
 * The discovered leads are intentionally THIN (name + country + the suppliers
 * they buy from) — a true "we found these buyers" list. Enriching each to a
 * full customs profile is a deliberate follow-up: re-run the
 * `zen-studio~importyeti-scraper~buyers` (type=company) lookup on the winners.
 */

/**
 * Org commodity → customs HS chapter(s). The HS chapter is the most reliable
 * relevance signal because it's a hard customs fact, not a keyword. Lowercase
 * keys; extend alongside the buyerFit taxonomy.
 */
const COMMODITY_HS_CHAPTERS: Record<string, string[]> = {
  spices: ['09'],
  coffee: ['09'], // coffee = 0901, tea/maté/spices share chapter 09
  tea: ['09'],
  grains: ['10', '11'],
  cereals: ['10', '11'],
  pulses: ['07'], // dried leguminous vegetables = 0713
  oilseeds: ['12'],
  nuts: ['08'],
  'dried fruits': ['08'],
  sugar: ['17'],
  cocoa: ['18'],
  rubber: ['40'],
  cotton: ['52'],
  textiles: ['52', '61', '62'],
  seafood: ['03'],
  'edible oils': ['15'],
};

/** Free product term → HS chapter, for when the caller passes a product, not an org category. */
const PRODUCT_HS_CHAPTERS: Array<{ match: RegExp; chapters: string[] }> = [
  { match: /pepper|spice|cumin|coriander|cardamom|cinnamon|cassia|clove|chilli|chili|ginger|turmeric|nutmeg|fennel|fenugreek|anise|mace|paprika|saffron|vanilla/i, chapters: ['09'] },
  { match: /coffee|arabica|robusta|\btea\b|mate/i, chapters: ['09'] },
  { match: /rice|wheat|maize|corn|barley|sorghum|millet|oats|grain|cereal|flour|malt|starch/i, chapters: ['10', '11'] },
  { match: /lentil|chickpea|pulse|bean|pea\b|gram\b/i, chapters: ['07'] },
  { match: /sesame|groundnut|peanut|soybean|soya|sunflower|mustard|rapeseed|canola|castor|oilseed|copra/i, chapters: ['12'] },
  { match: /cashew|almond|walnut|pistachio|hazelnut|raisin|date\b|dried fruit|\bnut\b/i, chapters: ['08'] },
  { match: /sugar|jaggery|molasses/i, chapters: ['17'] },
  { match: /cocoa|cacao|cacao/i, chapters: ['18'] },
  { match: /\brubber\b|latex/i, chapters: ['40'] },
  { match: /cotton|yarn|fabric|textile|garment|apparel/i, chapters: ['52', '61', '62'] },
  { match: /shrimp|prawn|fish|seafood|tuna|crab/i, chapters: ['03'] },
  { match: /palm oil|coconut oil|edible oil|olive oil|vegetable oil/i, chapters: ['15'] },
];

const US_LIKE = new Set([
  'united states', 'usa', 'us', 'u.s.', 'u.s.a.', 'united states of america',
]);

// Customs trading-partner fields are noisy: bills of lading often carry
// placeholder consignees ("Shipper", "To Order", "N A Trade") or redaction
// markers ("Missing in source document") instead of a real buyer. Drop those so
// the discovered buyer list stays clean.
const JUNK_NAME_PATTERNS: RegExp[] = [
  /^shipper$/i, /^consignee$/i, /^to order/i, /^to the order/i, /^order$/i,
  /^n\.?\/?a\.?$/i, /^na$/i, /^not available/i, /^unknown/i, /missing in source/i,
  /^various/i, /^confidential/i, /^see (above|attached|document)/i, /^to be /i,
  /^same as/i, /^no consignee/i, /^unidentified/i, /^withheld/i,
];

function isJunkBuyerName(name: string): boolean {
  const t = name.trim();
  if (t.length < 3) return true;
  if (JUNK_NAME_PATTERNS.some((re) => re.test(t))) return true;
  const core = normalizeCoreName(t);
  if (!core) return true;
  // After stripping corporate suffixes, a real company keeps at least one
  // multi-letter token; "N A Trade" collapses to single letters → junk.
  const tokens = core.split(/\s+/).filter(Boolean);
  if (tokens.every((tok) => tok.length <= 1)) return true;
  return false;
}

export interface DiscoveredBuyer {
  name: string;
  country: string;
  /** How many distinct commodity-relevant suppliers ship to this buyer. */
  supplierCount: number;
  /** Names of those suppliers — the evidence trail. */
  viaSuppliers: string[];
  /** Set once persisted. */
  companyId?: string;
  /** True when a same-named company already existed in the org (not re-inserted). */
  alreadyKnown?: boolean;
  /** True when a type=company lookup successfully filled the full customs profile. */
  enriched?: boolean;
}

export interface DiscoverBuyersResult {
  product: string;
  targetChapters: string[];
  suppliersScanned: number;
  relevantSuppliers: number;
  candidateBuyers: number;
  inserted: number;
  /** How many of the inserted leads were enriched to a full profile inline. */
  enriched: number;
  /** Resolved buyers that have a website → contact discovery can reach them. */
  reachable: number;
  /** Resolved buyers with no website yet → not contactable until enriched. */
  unreachable: number;
  buyers: DiscoveredBuyer[];
}

const norm = (s: string): string => s.toLowerCase().trim();

/** Resolve the customs HS chapters to filter on, from org commodities + the product term. */
function resolveTargetChapters(product: string, orgCommodities: string[]): string[] {
  const out = new Set<string>();
  for (const c of orgCommodities) {
    (COMMODITY_HS_CHAPTERS[norm(c)] ?? []).forEach((ch) => out.add(ch));
  }
  for (const { match, chapters } of PRODUCT_HS_CHAPTERS) {
    if (match.test(product)) chapters.forEach((ch) => out.add(ch));
  }
  return [...out];
}

/**
 * A supplier genuinely DEALS the commodity when the target HS chapter dominates
 * its shipments — the top chapter, or ≥25% share. Falls back to permissive
 * (keep) when we have no chapter signal at all, so the engine still works for
 * commodities outside the chapter map.
 */
function supplierDealsCommodity(hsCodes: ScrapedHsCode[] | undefined, chapters: Set<string>): boolean {
  if (chapters.size === 0) return true;
  if (!Array.isArray(hsCodes) || hsCodes.length === 0) return false;
  let total = 0;
  let target = 0;
  let topChapter: string | undefined;
  let topShipments = -1;
  for (const h of hsCodes) {
    const ship = h.shipments ?? 0;
    const chapter = (h.code ?? '').slice(0, 2);
    total += ship;
    if (ship > topShipments) {
      topShipments = ship;
      topChapter = chapter;
    }
    if (chapters.has(chapter)) target += ship;
  }
  if (total <= 0) return false;
  const topIsTarget = topChapter ? chapters.has(topChapter) : false;
  return topIsTarget || target / total >= 0.25;
}

function toJson(value: unknown): Json {
  return value as Json;
}

export interface DiscoverBuyersOptions {
  /** Suppliers to fetch from the product search (default 25). */
  maxSuppliers?: number;
  /** Max ranked buyers to persist (default 15). */
  maxBuyers?: number;
  /**
   * Enrich the top N freshly-inserted leads inline with a `type=company` lookup
   * (fills shipment volume / HS codes / suppliers so they score on their real
   * customs footprint). Each adds one synchronous Apify run (~40s), so keep it
   * small under the 300s function ceiling. Default 0 (discovery only).
   */
  enrichTop?: number;
}

/**
 * Run the full discovery pipeline for one product under one org. Synchronous —
 * suitable for an admin/API request within the 300s function limit at the
 * default run sizes.
 */
export async function discoverBuyersForProduct(
  supabase: SupabaseClient<Database>,
  orgId: string,
  product: string,
  options: DiscoverBuyersOptions = {},
): Promise<DiscoverBuyersResult> {
  // "rice exporters in usa" → "rice" so the customs product search actually hits.
  product = normalizeProductQuery(product);
  const maxSuppliers = options.maxSuppliers ?? 25;
  const maxBuyers = options.maxBuyers ?? 15;
  const enrichTop = options.enrichTop ?? 0;

  const { data: org } = await supabase
    .from('organizations')
    .select('commodities')
    .eq('id', orgId)
    .single();
  const orgCommodities = (org?.commodities ?? []).filter(Boolean) as string[];
  const targetChapters = resolveTargetChapters(product, orgCommodities);
  const chapterSet = new Set(targetChapters);

  // 1. Product search → suppliers (synchronous run).
  const raw = await runApifyActorSync('zen-studio~importyeti-scraper', {
    query: product,
    searchType: 'search',
    type: 'any',
    maxResults: maxSuppliers,
  });
  const suppliers = mapItems(raw, 'zen-studio~importyeti-scraper');

  // 2. Keep suppliers that genuinely deal the commodity (HS-chapter dominance).
  const relevant = suppliers.filter((s) => supplierDealsCommodity(s.hsCodes, chapterSet));

  // 3. Harvest US trading partners → rank by # of relevant suppliers shipping
  //    to them. Merge name variants fuzzily so "Mcilhenny"/"Mcllhenny" count once.
  const buyers: DiscoveredBuyer[] = [];
  const addSupplier = (buyer: DiscoveredBuyer, supplierName?: string) => {
    if (supplierName && !buyer.viaSuppliers.includes(supplierName)) {
      buyer.viaSuppliers.push(supplierName);
      buyer.supplierCount = buyer.viaSuppliers.length;
    }
  };
  for (const supplier of relevant) {
    for (const p of supplier.topTradingPartners ?? []) {
      if (!p.name || isJunkBuyerName(p.name)) continue;
      if (!US_LIKE.has(norm(p.country ?? ''))) continue; // ImportYeti buyers are US importers
      const match = buyers.find((b) => fuzzySameName(b.name, p.name));
      if (match) {
        addSupplier(match, supplier.title);
      } else {
        const buyer: DiscoveredBuyer = {
          name: p.name,
          country: 'United States',
          supplierCount: 0,
          viaSuppliers: [],
        };
        addSupplier(buyer, supplier.title);
        buyers.push(buyer);
      }
    }
  }

  const ranked = buyers
    .sort((a, b) => b.supplierCount - a.supplierCount || a.name.localeCompare(b.name))
    .slice(0, maxBuyers);

  // 4. Resolve each to a canonical company (merge into an existing row when one
  //    fuzzy-matches; otherwise insert a fresh Importer lead). `insertedIds`
  //    holds only the brand-new rows — those are the ones worth (re)scoring.
  const insertedIds: string[] = [];
  for (const buyer of ranked) {
    const suppliersList = buyer.viaSuppliers.slice(0, 5).join(', ');
    const result = await upsertCanonicalCompany(
      supabase,
      orgId,
      {
        name: buyer.name,
        type: 'Importer',
        hq_country: 'United States',
        hq_city: '',
        origin_countries: [],
        destination_countries: [],
        products_dealt: [product],
        website: null,
        description:
          `Discovered via customs records: imports ${product} into the US` +
          (suppliersList ? `, sourcing from ${suppliersList}` : '') +
          `. Customs-derived buyer lead — re-run a company lookup to enrich the full profile.`,
        is_enriched: false,
        enrichment_source: `apify-discovery:${product}`,
        confidence_score: 0.55,
        // Evidence trail for the dossier / UI — the suppliers proving the import.
        trade_metrics: toJson({
          discovery: {
            product,
            supplier_count: buyer.supplierCount,
            via_suppliers: buyer.viaSuppliers.slice(0, 10),
            target_hs_chapters: targetChapters,
          },
        }),
      },
      { source: 'discovery', ref: product },
    );

    if (!result) continue;
    buyer.companyId = result.id;
    if (result.merged) {
      buyer.alreadyKnown = true;
    } else {
      insertedIds.push(result.id);
    }
  }

  // 5. Optionally enrich the top N inserted leads inline (fills their real
  //    customs footprint) BEFORE scoring, so scores reflect enriched data.
  if (enrichTop > 0) {
    const toEnrich = ranked.filter((b) => b.companyId && !b.alreadyKnown).slice(0, enrichTop);
    for (const buyer of toEnrich) {
      try {
        buyer.enriched = await enrichBuyerByName(supabase, buyer.companyId!, buyer.name);
      } catch (e) {
        console.error(`Buyer discovery: enrichment failed for "${buyer.name}":`, e);
      }
    }
  }

  // 6. Score + detect opportunities for the freshly-inserted buyers (best-effort).
  if (insertedIds.length > 0) {
    try {
      await scoreOrgCompanies(supabase, orgId, { companyIds: insertedIds });
    } catch (e) {
      console.error('Buyer discovery: scoring failed:', e);
    }
    for (const id of insertedIds) {
      try {
        await detectFromCompany(supabase, orgId, id);
      } catch (e) {
        console.error(`Buyer discovery: opportunity detection failed for ${id}:`, e);
      }
    }
  }

  // Reachability: of the resolved buyers, how many have a website (so contact
  // discovery can reach them) vs not — surfaced so the UI can prompt enrichment.
  let reachable = 0;
  let unreachable = 0;
  const buyerIds = ranked.map((b) => b.companyId).filter((id): id is string => Boolean(id));
  if (buyerIds.length > 0) {
    const { data: rows } = await supabase.from('companies').select('website').in('id', buyerIds);
    for (const r of rows ?? []) {
      if (r.website) reachable++;
      else unreachable++;
    }
  }

  return {
    product,
    targetChapters,
    suppliersScanned: suppliers.length,
    relevantSuppliers: relevant.length,
    candidateBuyers: buyers.length,
    inserted: insertedIds.length,
    enriched: ranked.filter((b) => b.enriched).length,
    reachable,
    unreachable,
    buyers: ranked,
  };
}

/* -------------------------------------------------------------------------- */
/* Enrichment — turn a thin lead into a full customs profile                  */
/* -------------------------------------------------------------------------- */

/** Parse a source date string into a YYYY-MM-DD column value, or null. */
function normaliseShipmentDate(value?: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * From the candidates a `type=company` lookup returns for a name, pick the best
 * match: prefer the closest normalized-name match, breaking ties by the largest
 * shipment footprint (the canonical entity, not a tiny namesake).
 */
function pickBestMatch(name: string, candidates: ScrapedPlace[]): ScrapedPlace | null {
  const target = normalizeCoreName(name);
  let best: ScrapedPlace | null = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    const core = normalizeCoreName(c.title ?? '');
    if (!core) continue;
    const dist = levenshtein(target, core);
    // Lower distance is better; large shipment counts break ties (log-scaled).
    const score = -dist * 100 + Math.log10((c.totalShipments ?? 0) + 1);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/**
 * Enrich one already-inserted discovery lead by re-running the ImportYeti
 * `type=company` lookup on its name and folding the matched profile's customs
 * facts (shipment volume, recency, HS codes, suppliers, partners, trademarks,
 * profile URL) onto the row. Returns true when a profile was applied. The
 * existing `trade_metrics.discovery` evidence trail is preserved.
 */
export async function enrichBuyerByName(
  supabase: SupabaseClient<Database>,
  companyId: string,
  name: string,
): Promise<boolean> {
  const raw = await runApifyActorSync('zen-studio~importyeti-scraper', {
    query: name,
    searchType: 'search',
    type: 'company',
    maxResults: 5,
  });
  const candidates = mapItems(raw, 'zen-studio~importyeti-scraper~buyers');
  const best = pickBestMatch(name, candidates);
  if (!best) return false;

  // Preserve the discovery evidence trail already on the row.
  const { data: current } = await supabase
    .from('companies')
    .select('trade_metrics')
    .eq('id', companyId)
    .maybeSingle();
  const existingMetrics =
    current?.trade_metrics && typeof current.trade_metrics === 'object'
      ? (current.trade_metrics as Record<string, unknown>)
      : {};

  const shipments = best.totalShipments ?? 0;
  const confidence = Math.min(
    0.95,
    0.6 + (shipments >= 500 ? 0.25 : shipments >= 100 ? 0.18 : shipments >= 10 ? 0.1 : 0),
  );

  const { error } = await supabase
    .from('companies')
    .update({
      total_shipments: best.totalShipments ?? null,
      last_shipment_date: normaliseShipmentDate(best.lastShipmentDate),
      top_suppliers: toJson(best.topSuppliers ?? null),
      hs_codes: toJson(best.hsCodes ?? null),
      top_trading_partners: toJson(best.topTradingPartners ?? null),
      trademarks: toJson(best.trademarks ?? null),
      source_url: best.sourceUrl ?? null,
      hq_city: best.city ?? '',
      is_enriched: true,
      enriched_at: new Date().toISOString(),
      confidence_score: Number(confidence.toFixed(2)),
      trade_metrics: toJson({ ...existingMetrics, enriched_via: 'importyeti-company-lookup' }),
    })
    .eq('id', companyId);

  if (error) {
    console.error(`enrichBuyerByName: update failed for ${companyId}:`, error);
    return false;
  }
  return true;
}

/**
 * Backfill enrichment for existing thin discovery leads in an org (those still
 * `is_enriched=false` with an `apify-discovery:` source). Enriches up to `limit`
 * of them, then re-scores + re-detects. Used by the admin enrich endpoint.
 */
export async function enrichThinDiscoveryLeads(
  supabase: SupabaseClient<Database>,
  orgId: string,
  limit = 10,
): Promise<{ attempted: number; enriched: number }> {
  const { data: leads } = await supabase
    .from('companies')
    .select('id, name')
    .eq('org_id', orgId)
    .eq('is_enriched', false)
    .like('enrichment_source', 'apify-discovery:%')
    .limit(limit);

  if (!leads || leads.length === 0) return { attempted: 0, enriched: 0 };

  let enriched = 0;
  const touched: string[] = [];
  for (const lead of leads) {
    try {
      if (await enrichBuyerByName(supabase, lead.id, lead.name)) {
        enriched++;
        touched.push(lead.id);
      }
    } catch (e) {
      console.error(`enrichThinDiscoveryLeads: failed for ${lead.name}:`, e);
    }
  }

  if (touched.length > 0) {
    try {
      await scoreOrgCompanies(supabase, orgId, { companyIds: touched });
    } catch (e) {
      console.error('enrichThinDiscoveryLeads: scoring failed:', e);
    }
    for (const id of touched) {
      try {
        await detectFromCompany(supabase, orgId, id);
      } catch (e) {
        console.error(`enrichThinDiscoveryLeads: detection failed for ${id}:`, e);
      }
    }
  }

  return { attempted: leads.length, enriched };
}

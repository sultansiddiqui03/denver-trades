import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import { runApifyActorSync } from '@/lib/agents/dispatchScrape';
import { mapItems } from '@/lib/agents/scraperActors';
import type { ScrapedHsCode, ScrapedPlace } from '@/lib/agents/apifyReplay';
import { scoreOrgCompanies } from '@/lib/scoring/runScoring';
import { detectFromCompany } from '@/lib/opportunities/runDetect';

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
  coffee: ['09'], // 0901
  grains: ['10', '11'],
  oilseeds: ['12'],
  nuts: ['08'],
};

/** Free product term → HS chapter, for when the caller passes a product, not an org category. */
const PRODUCT_HS_CHAPTERS: Array<{ match: RegExp; chapters: string[] }> = [
  { match: /pepper|spice|cumin|coriander|cardamom|cinnamon|cassia|clove|chilli|chili|ginger|turmeric|nutmeg|fennel|fenugreek|anise|mace|paprika|saffron/i, chapters: ['09'] },
  { match: /coffee|arabica|robusta/i, chapters: ['09'] },
  { match: /rice|wheat|maize|corn|barley|sorghum|millet|oats|grain|cereal/i, chapters: ['10', '11'] },
  { match: /sesame|groundnut|peanut|soybean|soya|sunflower|mustard|rapeseed|canola|oilseed/i, chapters: ['12'] },
  { match: /cashew|almond|walnut|pistachio|hazelnut|\bnut\b/i, chapters: ['08'] },
];

const US_LIKE = new Set([
  'united states', 'usa', 'us', 'u.s.', 'u.s.a.', 'united states of america',
]);

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
}

export interface DiscoverBuyersResult {
  product: string;
  targetChapters: string[];
  suppliersScanned: number;
  relevantSuppliers: number;
  candidateBuyers: number;
  inserted: number;
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
  const maxSuppliers = options.maxSuppliers ?? 25;
  const maxBuyers = options.maxBuyers ?? 15;

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

  // 3. Harvest US trading partners → rank by # of relevant suppliers shipping to them.
  const byBuyer = new Map<string, DiscoveredBuyer>();
  for (const supplier of relevant) {
    const partners = supplier.topTradingPartners ?? [];
    for (const p of partners) {
      if (!p.name) continue;
      const country = p.country ?? '';
      if (!US_LIKE.has(norm(country))) continue; // ImportYeti buyers are US importers
      const key = norm(p.name);
      const existing = byBuyer.get(key);
      if (existing) {
        if (supplier.title && !existing.viaSuppliers.includes(supplier.title)) {
          existing.viaSuppliers.push(supplier.title);
          existing.supplierCount = existing.viaSuppliers.length;
        }
      } else {
        byBuyer.set(key, {
          name: p.name,
          country: 'United States',
          supplierCount: 1,
          viaSuppliers: supplier.title ? [supplier.title] : [],
        });
      }
    }
  }

  const ranked = [...byBuyer.values()]
    .sort((a, b) => b.supplierCount - a.supplierCount || a.name.localeCompare(b.name))
    .slice(0, maxBuyers);

  // 4. Upsert each as an Importer lead (dedupe by name within the org).
  const insertedIds: string[] = [];
  for (const buyer of ranked) {
    const { data: existing } = await supabase
      .from('companies')
      .select('id')
      .eq('org_id', orgId)
      .ilike('name', buyer.name)
      .limit(1)
      .maybeSingle();

    if (existing) {
      buyer.companyId = existing.id;
      buyer.alreadyKnown = true;
      continue;
    }

    const suppliersList = buyer.viaSuppliers.slice(0, 5).join(', ');
    const { data: inserted, error } = await supabase
      .from('companies')
      .insert({
        org_id: orgId,
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
      })
      .select('id')
      .single();

    if (error || !inserted) {
      console.error(`Buyer discovery: insert failed for "${buyer.name}":`, error);
      continue;
    }
    buyer.companyId = inserted.id;
    insertedIds.push(inserted.id);
  }

  // 5. Score + detect opportunities for the freshly-inserted buyers (best-effort).
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

  return {
    product,
    targetChapters,
    suppliersScanned: suppliers.length,
    relevantSuppliers: relevant.length,
    candidateBuyers: byBuyer.size,
    inserted: insertedIds.length,
    buyers: ranked,
  };
}

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';

/**
 * Entity resolution for companies.
 *
 * One real-world buyer can surface from many sources — the ImportYeti US
 * lookup, the product-discovery harvest, a future commercial customs API, an
 * enrichment provider. Without a merge step each pass inserts a fresh row and
 * the same company fragments into duplicates (we saw "Mccormick" land 3× and
 * "Mcilhenny"/"Mcllhenny" split). This module keeps ONE canonical row per
 * company: match incoming records against existing rows by normalized/fuzzy
 * name (+ country), fill only the gaps, and append a provenance entry recording
 * every contributing source.
 */

type CompanyRow = Database['public']['Tables']['companies']['Row'];
type CompanyInsert = Database['public']['Tables']['companies']['Insert'];

export interface SourceEntry {
  /** e.g. 'importyeti', 'discovery', 'enrichment:apollo'. */
  source: string;
  /** Optional reference — dataset id, search product, etc. */
  ref?: string | null;
}

const NAME_SUFFIXES = new Set([
  'inc', 'incorporated', 'llc', 'ltd', 'limited', 'corp', 'corporation', 'co',
  'company', 'international', 'intl', 'trade', 'trading', 'products', 'product',
  'imports', 'import', 'exports', 'export', 'group', 'holdings', 'enterprises',
  'enterprise', 'industries', 'foods', 'usa', 'us', 'the', 'and', 'pvt', 'private',
]);

/** Lowercase, strip punctuation, and drop generic corporate/trade suffix words. */
export function normalizeCoreName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !NAME_SUFFIXES.has(w))
    .join(' ')
    .trim();
}

/** Classic Levenshtein edit distance — small inputs only (company names). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Two names are "the same company" when their normalized cores match exactly,
 * or are within a tight edit distance (≤2) on cores long enough that the
 * closeness is meaningful — catches OCR/spelling variants ("Mcilhenny" vs
 * "Mcllhenny", "Waterglider" vs "Waterglinder") without over-merging short or
 * genuinely distinct names.
 */
export function fuzzySameName(a: string, b: string): boolean {
  const ca = normalizeCoreName(a);
  const cb = normalizeCoreName(b);
  if (!ca || !cb) return false;
  if (ca === cb) return true;
  if (Math.min(ca.length, cb.length) < 5) return false;
  const dist = levenshtein(ca, cb);
  return dist <= 2 && dist / Math.max(ca.length, cb.length) <= 0.2;
}

const norm = (s: string): string => s.toLowerCase().trim();

/** Loose country equality — tolerant of "United States"/"USA"/"US" etc. */
function sameCountry(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return true; // unknown on either side → don't block a match
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const US = new Set(['united states', 'usa', 'us', 'u.s.', 'u.s.a.', 'united states of america']);
  return US.has(x) && US.has(y);
}

/**
 * Find an existing canonical company in the org that the given name (+ optional
 * country) resolves to, or null. In-app fuzzy match over the org's companies —
 * fine at current scale (tens–hundreds per org); revisit with a trigram index
 * if an org ever holds tens of thousands.
 */
export async function findExistingCompany(
  supabase: SupabaseClient<Database>,
  orgId: string,
  name: string,
  country?: string | null,
): Promise<CompanyRow | null> {
  const { data } = await supabase
    .from('companies')
    .select('*')
    .eq('org_id', orgId)
    .limit(1000);
  if (!data) return null;
  for (const c of data as CompanyRow[]) {
    if (!fuzzySameName(c.name, name)) continue;
    if (country && c.hq_country && !sameCountry(c.hq_country, country)) continue;
    return c;
  }
  return null;
}

function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/** Fields safe to backfill onto an existing row when it's missing them. */
const MERGEABLE_FIELDS: (keyof CompanyInsert)[] = [
  'website', 'hq_country', 'hq_city', 'description',
  'products_dealt', 'origin_countries', 'destination_countries',
  'total_shipments', 'last_shipment_date', 'top_suppliers', 'hs_codes',
  'top_trading_partners', 'trademarks', 'source_url', 'trade_metrics',
  'contacts', 'type',
];

function appendSource(existing: Json | null | undefined, entry: SourceEntry): Json {
  const base = Array.isArray(existing) ? (existing as unknown[]) : [];
  return [...base, { source: entry.source, ref: entry.ref ?? null, at: new Date().toISOString() }] as Json;
}

/**
 * Insert a company, or MERGE the incoming record into the existing canonical
 * row when one resolves by fuzzy name + country. Merge is conservative
 * (fill-empty only — never clobbers good data) and always appends a provenance
 * entry. Returns the canonical id and whether it was a merge.
 */
export async function upsertCanonicalCompany(
  supabase: SupabaseClient<Database>,
  orgId: string,
  payload: Omit<CompanyInsert, 'org_id' | 'sources'> & { name: string },
  source: SourceEntry,
): Promise<{ id: string; merged: boolean } | null> {
  const existing = await findExistingCompany(supabase, orgId, payload.name, payload.hq_country ?? null);

  if (existing) {
    const update: Record<string, unknown> = { sources: appendSource(existing.sources, source) };
    for (const key of MERGEABLE_FIELDS) {
      const incoming = (payload as Record<string, unknown>)[key as string];
      const current = (existing as Record<string, unknown>)[key as string];
      if (!isEmptyValue(incoming) && isEmptyValue(current)) {
        update[key as string] = incoming;
      }
    }
    // A customs profile arriving for a previously-thin row should mark it enriched.
    if (payload.is_enriched && !existing.is_enriched) {
      update.is_enriched = true;
      update.enriched_at = new Date().toISOString();
    }
    const { error } = await supabase
      .from('companies')
      .update(update as Database['public']['Tables']['companies']['Update'])
      .eq('id', existing.id);
    if (error) {
      console.error(`upsertCanonicalCompany: merge failed for ${existing.id}:`, error);
      return null;
    }
    return { id: existing.id, merged: true };
  }

  const { data: inserted, error } = await supabase
    .from('companies')
    .insert({ ...payload, org_id: orgId, sources: appendSource(null, source) })
    .select('id')
    .single();
  if (error || !inserted) {
    console.error(`upsertCanonicalCompany: insert failed for "${payload.name}":`, error);
    return null;
  }
  return { id: inserted.id, merged: false };
}

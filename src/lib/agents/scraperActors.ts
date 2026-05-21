import type { ScrapedPlace } from './apifyReplay';

/**
 * Adapter layer for swappable Apify scraper actors.
 *
 * Today our Lead Scraper agent dispatches a Google-Maps actor that gives us
 * **business directory data** (name, website, phone, city, country). That's
 * enough to bootstrap a directory, but a "buyer that actually buys what we
 * sell" is only provably true when you can show their **customs-grade
 * shipment history** — last N months of port-of-entry records, top suppliers,
 * HS codes, container counts.
 *
 * Apify hosts several ImportYeti / customs-data scrapers in its store that
 * surface exactly that shape. Each has a different input contract (e.g.
 * `query` vs `searchStringsArray`, `maxResults` vs `maxCrawledPlacesPerSearch`)
 * and a different output schema. Rather than `if (actorId === '...')` branches
 * sprinkled through `dispatchLeadScraper`, we encapsulate that contract behind
 * a `ScraperActor` adapter so the route file stays declarative.
 *
 * Switching default actor is a single env var:
 * ```
 * vercel env add APIFY_ACTOR_ID production
 * # Paste one of the keys from SCRAPER_ACTORS below
 * ```
 *
 * Adding a new actor = adding one entry to {@link SCRAPER_ACTORS}.
 */
export type ScraperDataKind = 'directory' | 'customs';

export interface ScraperActor {
  /** Apify actor technical id, e.g. `compass~crawler-google-places`. */
  id: string;
  /** Short label surfaced in admin / logs / dossier "Source:" line. */
  label: string;
  /** Coarse data-quality tier — drives copy on the dossier. */
  dataKind: ScraperDataKind;
  /**
   * Build the request body posted to `/v2/acts/<id>/runs`. Every actor has its
   * own preferred input keys, so we centralise the field shape here.
   */
  buildInput(searchQuery: string, maxResults: number): unknown;
  /**
   * Convert one raw Apify dataset record into our normalised {@link ScrapedPlace}
   * shape (which the enrichment prompt and DB insert expect). Returns `null`
   * when the record is unusable (e.g. missing name) so the caller can skip it
   * cleanly.
   */
  mapItem(raw: unknown): ScrapedPlace | null;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function asObject(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asNonEmptyArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) && value.length > 0 ? value : undefined;
}

/**
 * Pull a clean human-readable HS-code description from ImportYeti's
 * `hsCodeSummary` array. Items look like:
 *   { code: '0904.11', description: 'Pepper, Black; whole', shipments: 47 }
 * We take description first (more searchable) and fall back to code.
 */
function describeHsItem(item: unknown): string | undefined {
  const obj = asObject(item);
  if (!obj) return undefined;
  return asString(obj.description) ?? asString(obj.code) ?? asString(obj.hsCode);
}

/**
 * Extract a country name from one ImportYeti `topTradingPartners` entry.
 * Each entry is roughly `{ name: 'PEPPER FACTORY', country: 'Vietnam', ... }`.
 */
function partnerCountry(item: unknown): string | undefined {
  const obj = asObject(item);
  if (!obj) return undefined;
  return asString(obj.country) ?? asString(obj.countryName);
}

/* -------------------------------------------------------------------------- */
/* Actor 1: compass/crawler-google-places (default — directory data)          */
/* -------------------------------------------------------------------------- */

const googleMapsActor: ScraperActor = {
  id: 'compass~crawler-google-places',
  label: 'Google Maps (directory)',
  dataKind: 'directory',
  buildInput(searchQuery: string, maxResults: number) {
    // `compass/crawler-google-places` expects `searchStringsArray` (not
    // `searchStrings`). Output fields (title, categoryName, website, phone,
    // street, city, countryCode, description) align with ScrapedPlace so the
    // identity mapItem below is safe.
    return {
      searchStringsArray: [searchQuery],
      maxCrawledPlacesPerSearch: maxResults,
    };
  },
  mapItem(raw: unknown): ScrapedPlace | null {
    const obj = asObject(raw);
    if (!obj) return null;
    const title = asString(obj.title);
    if (!title) return null;
    return {
      title,
      categoryName: asString(obj.categoryName),
      website: asString(obj.website),
      phone: asString(obj.phone),
      city: asString(obj.city),
      countryCode: asString(obj.countryCode),
      street: asString(obj.street),
      address: asString(obj.address),
      description: asString(obj.description),
    };
  },
};

/* -------------------------------------------------------------------------- */
/* Actor 2: zen-studio/importyeti-scraper (customs data — primary upgrade)    */
/* -------------------------------------------------------------------------- */

const importYetiZenActor: ScraperActor = {
  id: 'zen-studio~importyeti-scraper',
  label: 'ImportYeti — customs data (zen-studio)',
  dataKind: 'customs',
  buildInput(searchQuery: string, maxResults: number) {
    // Schema as published at https://apify.com/zen-studio/importyeti-scraper
    // (verified 2026-05-22). `query` is the only required field. We keep
    // every result by default and cap with maxResults to control cost
    // (pay-per-result at $6.99 / 1k profiles).
    return {
      query: searchQuery,
      searchType: 'search',
      type: 'any',
      mostRecentShipment: 'any',
      maxResults,
    };
  },
  mapItem(raw: unknown): ScrapedPlace | null {
    const obj = asObject(raw);
    if (!obj) return null;
    const name = asString(obj.name);
    if (!name) return null;

    // Build a Gemini-friendly description that surfaces the customs-grade
    // signal (HS codes, partner countries, shipment volume) so the enrichment
    // pass has rich substrate to classify Importer vs Exporter.
    const total = typeof obj.totalShipments === 'number' ? obj.totalShipments : undefined;
    const mostRecent = asString(obj.mostRecentShipment);
    const hsBits = asNonEmptyArray(obj.hsCodeSummary)
      ?.slice(0, 5)
      .map(describeHsItem)
      .filter((s): s is string => Boolean(s));
    const partners = asNonEmptyArray(obj.topTradingPartners)
      ?.slice(0, 5)
      .map(partnerCountry)
      .filter((s): s is string => Boolean(s));
    const lines: string[] = [];
    if (total !== undefined) {
      const recent = mostRecent ? `, most recent ${mostRecent}` : '';
      lines.push(`Customs records: ${total} shipments${recent}.`);
    }
    if (hsBits && hsBits.length > 0) {
      lines.push(`Top HS-coded products: ${hsBits.join('; ')}.`);
    }
    if (partners && partners.length > 0) {
      lines.push(`Top trading-partner countries: ${partners.join(', ')}.`);
    }
    const description = lines.join(' ').trim() || undefined;

    return {
      title: name,
      // `type` in ImportYeti = "Supplier" (overseas exporter) | "Company"
      // (US importer). Surfaced as categoryName so the enrichment prompt
      // can lean on it when deciding Importer vs Exporter.
      categoryName: asString(obj.type),
      website: asString(obj.website),
      phone: asString(obj.phone),
      city: asString(obj.city),
      countryCode: asString(obj.countryCode),
      street: undefined,
      address: asString(obj.addressPlain) ?? asString(obj.address),
      description,
    };
  },
};

/* -------------------------------------------------------------------------- */
/* Actor 3: lulzasaur/importyeti-scraper (customs data — budget alternative)  */
/* -------------------------------------------------------------------------- */

const importYetiLulzActor: ScraperActor = {
  id: 'lulzasaur~importyeti-scraper',
  label: 'ImportYeti — customs data (lulzasaur)',
  dataKind: 'customs',
  buildInput(searchQuery: string, maxResults: number) {
    // Schema verified at https://apify.com/lulzasaur/importyeti-scraper
    // 2026-05-22. Supports company / shipments / search modes; we use
    // search mode for symmetry with the other actors. Cheaper at $5/1k
    // results vs zen-studio's $6.99/1k but exposes fewer fields per record.
    return {
      mode: 'search',
      searchQuery,
      limit: maxResults,
      maxPages: 5,
    };
  },
  mapItem(raw: unknown): ScrapedPlace | null {
    const obj = asObject(raw);
    if (!obj) return null;
    const name = asString(obj.name) ?? asString(obj.companyName);
    if (!name) return null;

    const profileObj = asObject(obj.profile) ?? obj;
    const topProducts = asNonEmptyArray(profileObj.topProducts)
      ?.slice(0, 5)
      .map((p) => asString(p) ?? describeHsItem(p))
      .filter((s): s is string => Boolean(s));
    const hsCodes = asNonEmptyArray(profileObj.hsCodes)
      ?.slice(0, 5)
      .map(describeHsItem)
      .filter((s): s is string => Boolean(s));
    const total = typeof obj.totalShipments === 'number' ? obj.totalShipments : undefined;
    const lines: string[] = [];
    if (total !== undefined) lines.push(`Customs records: ${total} shipments.`);
    if (topProducts && topProducts.length > 0) {
      lines.push(`Top products: ${topProducts.join('; ')}.`);
    }
    if (hsCodes && hsCodes.length > 0) {
      lines.push(`HS codes: ${hsCodes.join(', ')}.`);
    }
    const description = lines.join(' ').trim() || undefined;

    return {
      title: name,
      categoryName: undefined,
      website: asString(profileObj.website),
      phone: asString(profileObj.phone),
      city: undefined,
      countryCode: asString(obj.country) ?? asString(profileObj.country),
      street: undefined,
      address: asString(obj.address),
      description,
    };
  },
};

/* -------------------------------------------------------------------------- */
/* Registry + lookup                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Canonical list of supported actors keyed by Apify technical id.
 *
 * The keys here must exactly match the value an operator would paste into
 * `APIFY_ACTOR_ID` (e.g. `vercel env add APIFY_ACTOR_ID production` →
 * `compass~crawler-google-places`). Apify uses `~` as the username/name
 * separator in the URL form — keep that throughout.
 */
export const SCRAPER_ACTORS: Record<string, ScraperActor> = {
  [googleMapsActor.id]: googleMapsActor,
  [importYetiZenActor.id]: importYetiZenActor,
  [importYetiLulzActor.id]: importYetiLulzActor,
};

/**
 * Identifier of the actor that ships as the production default. Kept
 * separate from the registry so swapping the default is a one-line change
 * and the env override path is fully isolated from registry layout.
 */
export const DEFAULT_SCRAPER_ACTOR_ID = googleMapsActor.id;

/**
 * Pick the actor for a given env-var value. Falls back to the default when
 * the env is unset OR when an unknown id is supplied (we choose to be
 * permissive here so a typo never bricks production — the dispatcher logs
 * the fallback so operators can spot the misconfiguration).
 */
export function pickActor(envValue: string | undefined): ScraperActor {
  if (!envValue) {
    return SCRAPER_ACTORS[DEFAULT_SCRAPER_ACTOR_ID];
  }
  const trimmed = envValue.trim();
  // Tolerate both `username~actor` and `username/actor` — Apify exposes both
  // forms on its docs/store pages and operators commonly copy the slash form.
  const normalised = trimmed.replace(/\//g, '~');
  return SCRAPER_ACTORS[normalised] ?? SCRAPER_ACTORS[DEFAULT_SCRAPER_ACTOR_ID];
}

/**
 * Run the matching actor's {@link ScraperActor.mapItem} over every record.
 * `null` rows are dropped, so the returned array is safe to feed straight
 * into `enrichAndInsertScrapedItems`.
 *
 * When `actorId` doesn't match a registered actor we conservatively assume
 * the default (Google Maps) — this matches `pickActor`'s permissive lookup
 * and keeps replays of pre-refactor datasets working.
 */
export function mapItems(rawItems: unknown[], actorId: string | undefined): ScrapedPlace[] {
  const actor = pickActor(actorId);
  const mapped: ScrapedPlace[] = [];
  for (const raw of rawItems) {
    const item = actor.mapItem(raw);
    if (item) mapped.push(item);
  }
  return mapped;
}

/**
 * Build the `enrichment_source` string we persist on each company.
 *
 * Format: `apify:<datasetId>[:<actorId>]`.
 *
 * The `:<actorId>` suffix is **optional and additive**:
 *   - Existing pre-refactor rows look like `apify:ffeKO5Oq…` — keep working.
 *   - The {@link AgentRunLeadsPreview} component looks up rows with a `like
 *     'apify:<dataset>%'` query so both forms match the same run.
 *
 * `parseEnrichmentSource` parses this back to a structured object.
 */
export function buildEnrichmentSource(datasetId: string, actorId: string): string {
  return `apify:${datasetId}:${actorId}`;
}

export interface ParsedEnrichmentSource {
  /** Raw `enrichment_source` string. */
  raw: string;
  /** Apify dataset id, e.g. `ffeKO5Oq7meoNAXLf`. */
  datasetId: string | null;
  /** Apify actor id (Tilde form), e.g. `compass~crawler-google-places`. */
  actorId: string | null;
  /** Resolved actor metadata, or `null` if not registered / not Apify. */
  actor: ScraperActor | null;
}

export function parseEnrichmentSource(raw: string | null | undefined): ParsedEnrichmentSource | null {
  if (!raw) return null;
  if (!raw.startsWith('apify:')) {
    return { raw, datasetId: null, actorId: null, actor: null };
  }
  const tail = raw.slice('apify:'.length);
  const parts = tail.split(':');
  const datasetId = parts[0] || null;
  const actorId = parts[1] || null;
  const actor = actorId ? SCRAPER_ACTORS[actorId] ?? null : null;
  return { raw, datasetId, actorId, actor };
}

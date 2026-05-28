import type {
  ScrapedPlace,
  ScrapedSupplier,
  ScrapedHsCode,
  ScrapedTradingPartner,
  ScrapedShipment,
  ScrapedShipmentRow,
} from './apifyReplay';

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
export type ScraperDataKind = 'directory' | 'customs' | 'shipments';

export interface ScraperActor {
  /**
   * Registry key. Usually the Apify technical id (`compass~crawler-google-places`),
   * but may be synthetic when one Apify actor backs two modes (see
   * {@link apifyActorId}). This is what `enrichment_source` stores and what
   * `pickActor`/the webhook callback resolve against.
   */
  id: string;
  /**
   * The REAL Apify actor id used in the dispatch URL `/v2/acts/<id>/runs`.
   * Defaults to {@link id}. Set this when the registry key is synthetic (e.g.
   * the same ImportYeti actor in `company` vs `shipments` mode).
   */
  apifyActorId?: string;
  /** Short label surfaced in admin / logs / dossier "Source:" line. */
  label: string;
  /**
   * Coarse data tier. `directory`/`customs` produce one record per company
   * (mapped via {@link mapItem}); `shipments` produces a flat list of shipment
   * rows (mapped via {@link mapShipmentRow}) that the ingestion groups by buyer.
   */
  dataKind: ScraperDataKind;
  /** Default number of records to request per run (shipments need many more). */
  defaultRunSize?: number;
  /**
   * Build the request body posted to `/v2/acts/<id>/runs`. Every actor has its
   * own preferred input keys, so we centralise the field shape here.
   */
  buildInput(searchQuery: string, maxResults: number): unknown;
  /**
   * Convert one raw record into our normalised {@link ScrapedPlace} (company)
   * shape. Required for `directory`/`customs` actors; omitted for `shipments`.
   * Returns `null` for unusable records.
   */
  mapItem?(raw: unknown): ScrapedPlace | null;
  /**
   * Convert one raw record into a {@link ScrapedShipmentRow}. Required for
   * `shipments` actors. Returns `null` for unusable records (e.g. no buyer).
   */
  mapShipmentRow?(raw: unknown): ScrapedShipmentRow | null;
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

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value.replace(/[, ]/g, ''));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function asUrl(value: unknown): string | undefined {
  const s = asString(value);
  if (!s) return undefined;
  return /^https?:\/\//i.test(s) ? s : undefined;
}

/**
 * Parse a supplier list into ScrapedSupplier[]. Tolerates arrays of plain
 * strings or objects with assorted key names across actors.
 */
function parseSuppliers(value: unknown): ScrapedSupplier[] | undefined {
  const arr = asNonEmptyArray(value);
  if (!arr) return undefined;
  const out: ScrapedSupplier[] = [];
  for (const raw of arr.slice(0, 10)) {
    if (typeof raw === 'string') {
      const name = raw.trim();
      if (name) out.push({ name });
      continue;
    }
    const obj = asObject(raw);
    if (!obj) continue;
    const name =
      asString(obj.name) ??
      asString(obj.companyName) ??
      asString(obj.supplierName) ??
      asString(obj.supplier);
    if (!name) continue;
    out.push({
      name,
      country: asString(obj.country) ?? asString(obj.countryName),
      shipments:
        asNumber(obj.shipments) ?? asNumber(obj.totalShipments) ?? asNumber(obj.count),
    });
  }
  return out.length > 0 ? out : undefined;
}

function parsePartners(value: unknown): ScrapedTradingPartner[] | undefined {
  const arr = asNonEmptyArray(value);
  if (!arr) return undefined;
  const out: ScrapedTradingPartner[] = [];
  for (const raw of arr.slice(0, 10)) {
    if (typeof raw === 'string') {
      const name = raw.trim();
      if (name) out.push({ name });
      continue;
    }
    const obj = asObject(raw);
    if (!obj) continue;
    const name =
      asString(obj.name) ?? asString(obj.companyName) ?? asString(obj.partner);
    if (!name) continue;
    out.push({
      name,
      country: asString(obj.country) ?? asString(obj.countryName),
      role: asString(obj.role) ?? asString(obj.type),
    });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Parse an HS-code list into ScrapedHsCode[]. Source items look like
 *   { code: '0904.11', description: 'Pepper, Black; whole', shipments: 47 }
 * but some actors emit plain product strings — handle both.
 */
function parseHsCodes(value: unknown): ScrapedHsCode[] | undefined {
  const arr = asNonEmptyArray(value);
  if (!arr) return undefined;
  const out: ScrapedHsCode[] = [];
  for (const raw of arr.slice(0, 12)) {
    if (typeof raw === 'string') {
      const description = raw.trim();
      if (description) out.push({ description });
      continue;
    }
    const obj = asObject(raw);
    if (!obj) continue;
    const code = asString(obj.code) ?? asString(obj.hsCode) ?? asString(obj.hs);
    const description =
      asString(obj.description) ?? asString(obj.product) ?? asString(obj.name);
    if (!code && !description) continue;
    out.push({ code, description, shipments: asNumber(obj.shipments) ?? asNumber(obj.count) });
  }
  return out.length > 0 ? out : undefined;
}

function parseTrademarks(value: unknown): string[] | undefined {
  const arr = asNonEmptyArray(value);
  if (!arr) return undefined;
  const out: string[] = [];
  for (const raw of arr.slice(0, 20)) {
    let name: string | undefined;
    if (typeof raw === 'string') {
      name = raw.trim() || undefined;
    } else {
      const obj = asObject(raw);
      name = obj
        ? asString(obj.name) ?? asString(obj.trademark) ?? asString(obj.mark)
        : undefined;
    }
    if (name) out.push(name);
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Parse a per-shipment / contract array, when the actor exposes shipment-level
 * detail (some ImportYeti "shipments" modes do). Defensive about key names.
 */
function parseShipments(value: unknown): ScrapedShipment[] | undefined {
  const arr = asNonEmptyArray(value);
  if (!arr) return undefined;
  const out: ScrapedShipment[] = [];
  for (const raw of arr.slice(0, 200)) {
    const obj = asObject(raw);
    if (!obj) continue;
    const date =
      asString(obj.date) ?? asString(obj.shipmentDate) ?? asString(obj.arrivalDate);
    const product =
      asString(obj.product) ??
      asString(obj.productDescription) ??
      asString(obj.description);
    if (!date && !product) continue;
    out.push({
      product,
      hsCode: asString(obj.hsCode) ?? asString(obj.hs) ?? asString(obj.code),
      supplier:
        asString(obj.supplier) ??
        asString(obj.supplierName) ??
        asString(obj.shipper) ??
        asString(obj.consignor),
      originCountry:
        asString(obj.originCountry) ??
        asString(obj.origin) ??
        asString(obj.countryOfOrigin),
      destinationCountry:
        asString(obj.destinationCountry) ??
        asString(obj.destination) ??
        asString(obj.countryOfDestination),
      portLoading: asString(obj.portLoading) ?? asString(obj.originPort),
      portDischarge: asString(obj.portDischarge) ?? asString(obj.destinationPort),
      quantityMt: asNumber(obj.quantityMt) ?? asNumber(obj.quantityTons),
      weightKg: asNumber(obj.weightKg) ?? asNumber(obj.weight),
      valueUsd: asNumber(obj.valueUsd) ?? asNumber(obj.value),
      incoterm: asString(obj.incoterm),
      date,
      carrier: asString(obj.carrier) ?? asString(obj.vessel),
      billOfLading:
        asString(obj.billOfLading) ?? asString(obj.blNumber) ?? asString(obj.bolNumber),
    });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Build a prose description that surfaces the customs signal (volume, HS
 * codes, partners) so the Gemini enrichment pass still has rich substrate to
 * classify Importer vs Exporter — even though the structured fields are now
 * persisted separately.
 */
function buildCustomsDescription(input: {
  totalShipments?: number;
  lastShipmentDate?: string;
  hsCodes?: ScrapedHsCode[];
  topTradingPartners?: ScrapedTradingPartner[];
  topSuppliers?: ScrapedSupplier[];
}): string | undefined {
  const lines: string[] = [];
  if (input.totalShipments !== undefined) {
    const recent = input.lastShipmentDate ? `, most recent ${input.lastShipmentDate}` : '';
    lines.push(`Customs records: ${input.totalShipments} shipments${recent}.`);
  }
  const hs = (input.hsCodes ?? [])
    .map((h) => h.description ?? h.code)
    .filter((s): s is string => Boolean(s))
    .slice(0, 5);
  if (hs.length > 0) lines.push(`Top HS-coded products: ${hs.join('; ')}.`);
  const partners = (input.topTradingPartners ?? [])
    .map((p) => p.country ?? p.name)
    .filter((s): s is string => Boolean(s))
    .slice(0, 5);
  if (partners.length > 0) lines.push(`Top trading partners: ${partners.join(', ')}.`);
  const suppliers = (input.topSuppliers ?? [])
    .map((s) => s.name)
    .filter(Boolean)
    .slice(0, 5);
  if (suppliers.length > 0) lines.push(`Top suppliers: ${suppliers.join(', ')}.`);
  const text = lines.join(' ').trim();
  return text.length > 0 ? text : undefined;
}

/**
 * Map ONE raw ImportYeti-class customs record into our normalised
 * {@link ScrapedPlace}, populating both directory fields AND the structured
 * customs intelligence. Shared by every ImportYeti actor below so they can
 * never drift. Defensive about field names because the zen-studio /
 * lulzasaur / "US Import Records" actors each name things slightly
 * differently; unknown shapes degrade gracefully to `null` fields.
 */
function mapImportYetiRecord(raw: unknown): ScrapedPlace | null {
  const obj = asObject(raw);
  if (!obj) return null;
  // Some actors nest the bulk of the profile under a `profile` key.
  const profile = asObject(obj.profile) ?? obj;

  const name =
    asString(obj.name) ??
    asString(obj.companyName) ??
    asString(profile.name) ??
    asString(obj.title);
  if (!name) return null;

  const totalShipments =
    asNumber(obj.totalShipments) ??
    asNumber(obj.shipmentsCount) ??
    asNumber(profile.totalShipments);
  const lastShipmentDate =
    asString(obj.mostRecentShipment) ??
    asString(obj.lastShipment) ??
    asString(obj.lastShipmentDate) ??
    asString(profile.mostRecentShipment);
  // Supplier/partner/HS key names differ across actors: zen-studio emits
  // `topSuppliers` / `topTradingPartners` / `hsCodeSummary`; lulzasaur company
  // mode emits `suppliers` / `buyers` / `hsCodes`+`topProducts`. Fall through
  // every known alias so the customs signal is captured regardless of source.
  const topSuppliers = parseSuppliers(
    obj.topSuppliers ?? obj.suppliers ?? profile.topSuppliers ?? profile.suppliers,
  );
  const topTradingPartners = parsePartners(
    obj.topTradingPartners ??
      profile.topTradingPartners ??
      obj.buyers ??
      obj.topCustomers ??
      profile.buyers ??
      profile.topCustomers,
  );
  const hsCodes = parseHsCodes(
    obj.hsCodeSummary ??
      obj.hsCodes ??
      obj.htsCodes ??
      profile.hsCodes ??
      profile.htsCodes ??
      profile.topProducts,
  );
  const trademarks = parseTrademarks(obj.trademarks ?? profile.trademarks);
  const sourceUrl =
    asUrl(obj.detailUrl) ??
    asUrl(obj.url) ??
    asUrl(obj.profileUrl) ??
    asUrl(obj.importYetiUrl);

  return {
    title: name,
    // ImportYeti `type` ("Supplier" = overseas exporter, "Company" = US
    // importer) is a strong classification hint for the enrichment LLM.
    categoryName: asString(obj.type) ?? asString(profile.type),
    website: asString(obj.website) ?? asString(profile.website),
    phone: asString(obj.phone) ?? asString(profile.phone),
    city: asString(obj.city) ?? asString(profile.city),
    countryCode:
      asString(obj.countryCode) ?? asString(obj.country) ?? asString(profile.country),
    street: undefined,
    address:
      asString(obj.addressPlain) ?? asString(obj.address) ?? asString(profile.address),
    description: buildCustomsDescription({
      totalShipments,
      lastShipmentDate,
      hsCodes,
      topTradingPartners,
      topSuppliers,
    }),
    totalShipments,
    lastShipmentDate,
    topSuppliers,
    hsCodes,
    topTradingPartners,
    trademarks,
    sourceUrl,
    shipments: parseShipments(
      obj.shipments ?? obj.shipmentRecords ?? obj.recentShipments ?? profile.shipments,
    ),
  };
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
  // Customs-mode default run size. ImportYeti returns 10 results/page and the
  // `type` filter is applied within the fetched window, so a small size (the
  // old global default of 5) can filter out *every* importer when the search's
  // top results are supplier-heavy — which is exactly what happened for spice
  // product keywords (the query came back empty). 25 matches the actor's own
  // prefill and reliably surfaces buyers past the supplier rows.
  defaultRunSize: 25,
  label: 'ImportYeti — customs data (zen-studio)',
  dataKind: 'customs',
  buildInput(searchQuery: string, maxResults: number) {
    // Input contract verified against the actor's live input schema
    // (api.apify.com/v2/acts/zen-studio~importyeti-scraper/builds/default,
    // 2026-05-29). `query` is the only required field.
    //
    // WEDGE-CRITICAL: ImportYeti is built on US import bills of lading, so a
    // `type: 'company'` result is a US IMPORTER (a BUYER), while `type:
    // 'supplier'` is the overseas EXPORTER they buy from. Our product promise
    // is "find buyers who provably import what you sell" — so we request
    // `company`. The previous `type: 'any'` returned mostly suppliers (the
    // exporter's competitors), which silently broke the core value prop.
    //
    // `mostRecentShipment` enum is 'any' | '6mo' | '12mo'. '12mo' biases the
    // result set toward buyers who are importing RIGHT NOW (also feeds
    // buyer-fit recency) without being as strict as 6mo.
    return {
      query: searchQuery,
      searchType: 'search',
      type: 'company',
      mostRecentShipment: '12mo',
      maxResults,
    };
  },
  mapItem: mapImportYetiRecord,
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
  mapItem: mapImportYetiRecord,
};

/* -------------------------------------------------------------------------- */
/* Actor 4: ImportYeti "US Import Records & Supplier Data" (object-id keyed)   */
/* -------------------------------------------------------------------------- */

/**
 * The actor surfaced in the operator's Apify console screenshot
 * (console.apify.com/actors/7sDq1LHYZAlHQS9yW). Its dataset records carry
 * exactly the columns we want to capture: name, type, countryCode, address,
 * totalShipments, mostRecentShipment, topSuppliers, trademarks, detailUrl —
 * all handled by the shared {@link mapImportYetiRecord}.
 *
 * Keyed by Apify object-id (no `username~name` slug available from the console
 * URL). `pickActor` matches this verbatim, and `/v2/acts/<id>/runs` accepts an
 * object id, so APIFY_ACTOR_ID=7sDq1LHYZAlHQS9yW resolves here.
 *
 * NOTE: the input contract below is a best-effort guess (most ImportYeti
 * actors take a free-text `query`/`searchQuery`). Verify against the actor's
 * Input tab before promoting it to the dispatch default.
 */
const importYetiUsRecordsActor: ScraperActor = {
  id: '7sDq1LHYZAlHQS9yW',
  label: 'ImportYeti — US Import Records & Supplier Data',
  dataKind: 'customs',
  buildInput(searchQuery: string, maxResults: number) {
    return {
      query: searchQuery,
      searchQuery,
      maxResults,
      maxItems: maxResults,
    };
  },
  mapItem: mapImportYetiRecord,
};

/* -------------------------------------------------------------------------- */
/* Registry + lookup                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Map one raw ImportYeti shipments-mode record into a {@link ScrapedShipmentRow}.
 * Field names per the actor's documented output (buyerName, supplierName,
 * productDescription, hsCode, shipmentDate, weight, quantity, portOfLading,
 * portOfUnlading, country, vesselName) with defensive fallbacks. Returns null
 * when there's no buyer to attribute the shipment to.
 */
function mapImportYetiShipment(raw: unknown): ScrapedShipmentRow | null {
  const obj = asObject(raw);
  if (!obj) return null;
  const buyerName =
    asString(obj.buyerName) ??
    asString(obj.consignee) ??
    asString(obj.consigneeName) ??
    asString(obj.importer);
  if (!buyerName) return null;

  const weight = asNumber(obj.weight) ?? asNumber(obj.weightKg);
  const originCountry =
    asString(obj.country) ?? asString(obj.originCountry) ?? asString(obj.countryOfOrigin);
  const destinationCountry =
    asString(obj.destinationCountry) ??
    asString(obj.arrivalCountry) ??
    asString(obj.countryOfDestination);

  return {
    buyerName,
    buyerCountry:
      asString(obj.buyerCountry) ?? asString(obj.arrivalCountry) ?? destinationCountry,
    buyerCity: asString(obj.buyerCity) ?? asString(obj.consigneeCity),
    supplier:
      asString(obj.supplierName) ??
      asString(obj.shipper) ??
      asString(obj.exporter) ??
      asString(obj.supplier),
    product:
      asString(obj.productDescription) ??
      asString(obj.product) ??
      asString(obj.description),
    hsCode: asString(obj.hsCode) ?? asString(obj.hs) ?? asString(obj.code),
    originCountry,
    destinationCountry,
    portLoading: asString(obj.portOfLading) ?? asString(obj.portLoading),
    portDischarge: asString(obj.portOfUnlading) ?? asString(obj.portDischarge),
    weightKg: weight,
    quantityMt:
      weight !== undefined ? Math.round((weight / 1000) * 10) / 10 : asNumber(obj.quantityMt),
    valueUsd: asNumber(obj.value) ?? asNumber(obj.valueUsd),
    incoterm: asString(obj.incoterm),
    date: asString(obj.shipmentDate) ?? asString(obj.date) ?? asString(obj.arrivalDate),
    carrier: asString(obj.vesselName) ?? asString(obj.carrier) ?? asString(obj.vessel),
    billOfLading:
      asString(obj.billOfLading) ?? asString(obj.blNumber) ?? asString(obj.bolNumber),
  };
}

/* -------------------------------------------------------------------------- */
/* Actor 5: ImportYeti shipments mode (per-shipment / contract rows)          */
/* -------------------------------------------------------------------------- */

/**
 * Shipment-level ImportYeti data. Backed by the same lulzasaur Apify actor as
 * {@link importYetiLulzActor} but run in `shipments` mode, which returns a flat
 * list of individual shipments (buyer, supplier, product, HS, date, qty, ports)
 * rather than one company summary. The ingestion groups these by buyer to build
 * companies WITH a real per-shipment timeline + supplier-shift signal.
 *
 * Registry key is synthetic (`…~shipments`) so it can coexist with the
 * company-mode entry; {@link ScraperActor.apifyActorId} carries the real Apify
 * id used for dispatch. Verify the field mapping against a live run.
 */
const importYetiShipmentsActor: ScraperActor = {
  id: 'lulzasaur~importyeti-scraper~shipments',
  apifyActorId: 'lulzasaur~importyeti-scraper',
  label: 'ImportYeti — shipment-level customs records',
  dataKind: 'shipments',
  defaultRunSize: 200,
  buildInput(searchQuery: string, maxResults: number) {
    return {
      mode: 'shipments',
      searchQuery,
      limit: Math.max(1, Math.min(500, maxResults)),
      maxPages: 10,
    };
  },
  mapShipmentRow: mapImportYetiShipment,
};

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
  [importYetiUsRecordsActor.id]: importYetiUsRecordsActor,
  [importYetiShipmentsActor.id]: importYetiShipmentsActor,
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
  if (!actor.mapItem) return [];
  const mapped: ScrapedPlace[] = [];
  for (const raw of rawItems) {
    const item = actor.mapItem(raw);
    if (item) mapped.push(item);
  }
  return mapped;
}

/**
 * Map raw records via the actor's {@link ScraperActor.mapShipmentRow} — the
 * shipments-mode counterpart to {@link mapItems}. Returns [] for actors that
 * don't expose a shipment mapper.
 */
export function mapShipmentRows(
  rawItems: unknown[],
  actorId: string | undefined,
): ScrapedShipmentRow[] {
  const actor = pickActor(actorId);
  if (!actor.mapShipmentRow) return [];
  const mapped: ScrapedShipmentRow[] = [];
  for (const raw of rawItems) {
    const row = actor.mapShipmentRow(raw);
    if (row) mapped.push(row);
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

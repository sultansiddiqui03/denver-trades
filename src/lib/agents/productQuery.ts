/**
 * Normalize a free-text search into a clean product term.
 *
 * Users type things like "rice exporters in usa", "black pepper buyers", or
 * "list of cumin suppliers india". Customs actors expect either a bare PRODUCT
 * ("rice") or a company name — a full phrase slugifies to a non-existent
 * company and returns nothing (exactly what broke "rice exporters in usa").
 * This strips role words, intent/filler words, and geographies down to the
 * product so product searches actually hit.
 */

// Role words — who they're looking for, not what's traded.
const ROLE_WORDS = new Set([
  'exporter', 'exporters', 'importer', 'importers', 'supplier', 'suppliers',
  'buyer', 'buyers', 'seller', 'sellers', 'manufacturer', 'manufacturers',
  'distributor', 'distributors', 'wholesaler', 'wholesalers', 'trader',
  'traders', 'vendor', 'vendors', 'company', 'companies', 'firm', 'firms',
  'business', 'businesses', 'dealer', 'dealers', 'merchant', 'merchants',
]);

// Intent / filler words.
const FILLER_WORDS = new Set([
  'in', 'of', 'for', 'the', 'a', 'an', 'and', 'or', 'to', 'from', 'near',
  'me', 'top', 'best', 'find', 'list', 'all', 'any', 'show', 'get', 'search',
  'who', 'that', 'buy', 'buys', 'sell', 'sells', 'import', 'imports', 'export',
  'exports', 'trade', 'trades', 'trading', 'looking', 'want', 'wanted', 'need',
]);

// Geographies — countries / regions / common abbreviations & demonyms.
const GEO_WORDS = new Set([
  'usa', 'us', 'u.s.', 'u.s.a.', 'america', 'american', 'united', 'states',
  'india', 'indian', 'china', 'chinese', 'uae', 'emirates', 'dubai',
  'saudi', 'arabia', 'arabian', 'ksa', 'qatar', 'kuwait', 'bahrain', 'oman',
  'europe', 'european', 'eu', 'uk', 'britain', 'british', 'england', 'germany',
  'german', 'france', 'french', 'italy', 'italian', 'spain', 'spanish',
  'netherlands', 'dutch', 'vietnam', 'vietnamese', 'indonesia', 'indonesian',
  'brazil', 'brazilian', 'canada', 'canadian', 'mexico', 'japan', 'japanese',
  'korea', 'korean', 'singapore', 'malaysia', 'thailand', 'turkey', 'turkish',
  'egypt', 'africa', 'african', 'asia', 'asian', 'gcc', 'worldwide', 'global',
  'overseas', 'abroad', 'domestic', 'international',
]);

const STOPWORDS = new Set([...ROLE_WORDS, ...FILLER_WORDS, ...GEO_WORDS]);

/**
 * Reduce a query to its product term. Keeps multi-word products intact
 * ("black pepper", "basmati rice"). Falls back to a trimmed version of the
 * original when stripping would leave nothing (e.g. the user typed a company
 * name or a single geo/role word).
 */
export function normalizeProductQuery(raw: string): string {
  const cleaned = (raw || '').toLowerCase().replace(/[^a-z0-9\s&-]+/g, ' ');
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  const kept = tokens.filter((t) => !STOPWORDS.has(t));
  if (kept.length === 0) {
    // Nothing recognizable as a product — return the original trimmed input so
    // a deliberate company-name search still flows through unchanged.
    return raw.trim();
  }
  return kept.join(' ').trim();
}

/** True when normalization actually changed the query (for logging / UX hints). */
export function wasQueryNormalized(raw: string): boolean {
  return normalizeProductQuery(raw).toLowerCase() !== (raw || '').trim().toLowerCase();
}

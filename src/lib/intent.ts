/**
 * Trade-speak for company.type. We store the raw value as Importer / Exporter
 * / Broker (the historical DB enum) but the UI now reads "BUYS" / "SELLS" /
 * "BROKER" — much more obvious to a trader scanning a list of leads.
 *
 * Tradyon and other vertical CRMs lead with this framing too — see the
 * "Find Buyers" / "Find Sellers" sidebar split. Don't rename the DB column;
 * every consumer of `companies.type` keeps using Importer / Exporter / Broker.
 */
export type CompanyType = 'Importer' | 'Exporter' | 'Broker';

export type IntentVariant = 'buyer' | 'seller' | 'broker' | 'unknown';

export interface IntentMeta {
  /** The capitalised display label, e.g. "BUYS" */
  label: string;
  /** Variant key — UI maps this to a CSS class for color. */
  variant: IntentVariant;
  /** Short prose form for plain-English contexts. */
  description: string;
}

const META: Record<CompanyType, IntentMeta> = {
  Importer: { label: 'BUYS', variant: 'buyer', description: 'Buys / imports' },
  Exporter: { label: 'SELLS', variant: 'seller', description: 'Sells / exports' },
  Broker: { label: 'BROKER', variant: 'broker', description: 'Brokers deals' },
};

const UNKNOWN: IntentMeta = {
  label: 'UNCLASSIFIED',
  variant: 'unknown',
  description: 'Type not yet enriched',
};

/**
 * Return the canonical intent presentation for a company.type value.
 * Returns an "unknown" placeholder if the type is null / unrecognised,
 * which keeps card layouts stable for partially-enriched leads.
 */
export function getIntent(type: string | null | undefined): IntentMeta {
  if (!type) return UNKNOWN;
  if (type === 'Importer' || type === 'Exporter' || type === 'Broker') {
    return META[type];
  }
  return UNKNOWN;
}

/**
 * The reverse: map the URL-friendly filter slug back to the canonical
 * DB enum value. Used by /dashboard/search when reading ?intent= query.
 */
export function intentSlugToType(slug: string | null | undefined): CompanyType | null {
  switch (slug) {
    case 'buyers':
    case 'buyer':
    case 'importer':
      return 'Importer';
    case 'sellers':
    case 'seller':
    case 'exporter':
      return 'Exporter';
    case 'brokers':
    case 'broker':
      return 'Broker';
    default:
      return null;
  }
}

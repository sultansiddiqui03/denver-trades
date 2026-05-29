import React from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  MapPin,
  Ship,
} from 'lucide-react';
import { getUserContext } from '@/lib/auth/server';
import IntentChip from '@/components/IntentChip';
import BuyerFitBadge from '@/components/BuyerFitBadge';
import SourcingSignalBadge from '@/components/SourcingSignalBadge';
import { type CompanyType } from '@/lib/intent';
import { parseEnrichmentSource } from '@/lib/agents/scraperActors';
import { formatNumber, relativeFromNow } from '@/lib/format';
import CompanyDossierTabs, {
  HeroActions,
  type DossierCompany,
} from './CompanyDossierTabs';
import ScoreBreakdown from './ScoreBreakdown';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

interface HsCodeEntry {
  code: string;
  description?: string;
  shipments?: number;
}

interface SupplierEntry {
  name: string;
  country?: string;
  shipments?: number;
}

interface TradingPartnerEntry {
  name: string;
  country?: string;
  role?: string;
}

interface ScoreBreakdownData {
  commodityMatch?: number;
  shipmentVolume?: number;
  recency?: number;
  tradeDirection?: number;
  marketFit?: number;
  reasons?: string[];
}

interface ShipmentRow {
  id: string;
  shipment_date: string | null;
  quantity_mt: number | null;
  product: string | null;
  supplier_name: string | null;
  origin_country: string | null;
  destination_country: string | null;
  port_loading: string | null;
  port_discharge: string | null;
  value_usd: number | null;
  incoterm: string | null;
}

interface SourcingSignalData {
  status?: string | null;
  headline?: string | null;
  intent?: string | null;
  evidence?: string[];
  [key: string]: unknown;
}

interface CompanyRow {
  id: string;
  name: string;
  type: string | null;
  hq_city: string | null;
  hq_country: string | null;
  website: string | null;
  description: string | null;
  origin_countries: string[] | null;
  destination_countries: string[] | null;
  products_dealt: string[] | null;
  contacts: unknown;
  is_enriched: boolean | null;
  is_favorited: boolean | null;
  enriched_at: string | null;
  enrichment_source: string | null;
  total_shipments: number | null;
  last_shipment_date: string | null;
  source_url: string | null;
  top_suppliers: unknown;
  hs_codes: unknown;
  top_trading_partners: unknown;
  trademarks: unknown;
  buyer_fit_score: number | null;
  score_breakdown: unknown;
  sourcing_signal: unknown;
  trade_metrics: unknown;
  sources: unknown;
}

interface DiscoveryEvidence {
  product?: string;
  supplier_count?: number;
  via_suppliers?: string[];
}

interface SourceEntry {
  source: string;
  ref?: string | null;
  at?: string | null;
}

function normaliseDiscoveryEvidence(raw: unknown): DiscoveryEvidence | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = (raw as Record<string, unknown>).discovery;
  if (!d || typeof d !== 'object') return null;
  return d as DiscoveryEvidence;
}

function normaliseSources(raw: unknown): SourceEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is SourceEntry => typeof s === 'object' && s !== null && 'source' in s);
}

function normaliseHsCodes(raw: unknown): HsCodeEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is HsCodeEntry => typeof e === 'object' && e !== null && 'code' in e);
}

function normaliseSuppliers(raw: unknown): SupplierEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is SupplierEntry => typeof e === 'object' && e !== null && 'name' in e);
}

function normaliseTradingPartners(raw: unknown): TradingPartnerEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is TradingPartnerEntry => typeof e === 'object' && e !== null && 'name' in e);
}

function normaliseTrademarks(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is string => typeof t === 'string');
}

function normaliseScoreBreakdown(raw: unknown): ScoreBreakdownData | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as ScoreBreakdownData;
}

function normaliseSourcingSignal(raw: unknown): SourcingSignalData | null {
  if (!raw || typeof raw !== 'object') return null;
  return raw as SourcingSignalData;
}

function formatEnrichedDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function hostname(url: string | null): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}

function normaliseType(t: string | null): CompanyType | null {
  if (t === 'Importer' || t === 'Exporter' || t === 'Broker') return t;
  return null;
}

interface ContactEntry {
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  title?: string;
  [key: string]: unknown;
}

function normaliseContacts(raw: unknown): ContactEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c): c is ContactEntry => typeof c === 'object' && c !== null,
  );
}

// Next 16: params is a Promise that resolves to the route params.
// See `node_modules/next/dist/docs` if this signature drifts.
interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CompanyDossierPage({ params }: PageProps) {
  const { id } = await params;

  const context = await getUserContext();
  if (!context) redirect('/');

  const { orgId, supabase } = context;

  const [{ data, error }, { data: shipmentsData }] = await Promise.all([
    supabase
      .from('companies')
      .select(
        'id, name, type, hq_city, hq_country, website, description, origin_countries, destination_countries, products_dealt, contacts, is_enriched, is_favorited, enriched_at, enrichment_source, total_shipments, last_shipment_date, source_url, top_suppliers, hs_codes, top_trading_partners, trademarks, buyer_fit_score, score_breakdown, sourcing_signal, trade_metrics, sources',
      )
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle(),
    supabase
      .from('shipments')
      .select(
        'id, shipment_date, quantity_mt, product, supplier_name, origin_country, destination_country, port_loading, port_discharge, value_usd, incoterm',
      )
      .eq('company_id', id)
      .eq('org_id', orgId)
      .order('shipment_date', { ascending: false })
      .limit(200),
  ]);

  if (error) {
    console.error('Company dossier load error:', error);
  }
  if (!data) notFound();

  const company = data as CompanyRow;
  const type = normaliseType(company.type);
  const host = hostname(company.website);
  const enrichedAt = formatEnrichedDate(company.enriched_at);
  const sourceInfo = parseEnrichmentSource(company.enrichment_source);
  const sourceLabel = sourceInfo?.actor
    ? `Source: ${sourceInfo.actor.dataKind === 'customs' ? 'Customs data' : 'Directory'} — ${sourceInfo.actor.label}`
    : null;

  const hsCodes = normaliseHsCodes(company.hs_codes);
  const topSuppliers = normaliseSuppliers(company.top_suppliers);
  const topTradingPartners = normaliseTradingPartners(company.top_trading_partners);
  const trademarks = normaliseTrademarks(company.trademarks);
  const scoreBreakdown = normaliseScoreBreakdown(company.score_breakdown);
  const sourcingSignal = normaliseSourcingSignal(company.sourcing_signal);
  const shipments = (shipmentsData ?? []) as ShipmentRow[];

  const lastShipRelative = relativeFromNow(company.last_shipment_date);

  const dossierCompany: DossierCompany = {
    id: company.id,
    name: company.name,
    type,
    hq_city: company.hq_city,
    hq_country: company.hq_country,
    description: company.description,
    origin_countries: company.origin_countries,
    destination_countries: company.destination_countries,
    products_dealt: company.products_dealt,
    contacts: normaliseContacts(company.contacts),
    total_shipments: company.total_shipments,
    last_shipment_date: company.last_shipment_date,
    source_url: company.source_url,
    top_suppliers: topSuppliers,
    hs_codes: hsCodes,
    top_trading_partners: topTradingPartners,
    trademarks,
    buyer_fit_score: company.buyer_fit_score,
    score_breakdown: scoreBreakdown,
    shipments,
    sourcing_signal: sourcingSignal,
    discovery_evidence: normaliseDiscoveryEvidence(company.trade_metrics),
    sources: normaliseSources(company.sources),
  };

  return (
    <div className={`${styles.dossierContainer} fade-in`}>
      <Link href="/dashboard/companies" className={styles.backLink}>
        <ArrowLeft size={16} strokeWidth={1.8} />
        Back to companies
      </Link>

      {/* — Hero — visible without scroll, Tradyon-style profile header */}
      <section className={styles.hero}>
        <div className={styles.heroTopRow}>
          <div className={styles.heroIdentity}>
            <h1 className={styles.companyName}>{company.name}</h1>

            <div className={styles.heroMetaRow}>
              <span className={styles.metaItem}>
                <MapPin
                  size={16}
                  strokeWidth={1.6}
                  className={styles.metaIcon}
                />
                {[company.hq_city, company.hq_country]
                  .filter(Boolean)
                  .join(', ') || 'Location unknown'}
              </span>

              {host ? (
                <a
                  href={company.website ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.websiteLink}
                >
                  <ExternalLink size={14} strokeWidth={1.6} />
                  {host}
                </a>
              ) : null}

              {company.total_shipments != null ? (
                <span className={styles.metaItem}>
                  <Ship size={15} strokeWidth={1.6} className={styles.metaIcon} />
                  {formatNumber(company.total_shipments)} shipments
                  {lastShipRelative ? ` · ${lastShipRelative}` : ''}
                </span>
              ) : null}
            </div>

            {company.description ? (
              <p className={styles.description}>{company.description}</p>
            ) : null}
          </div>

          <div className={styles.heroRight}>
            <div className={styles.heroChips}>
              <IntentChip type={type} size="md" />
              <BuyerFitBadge score={company.buyer_fit_score} size="md" showLabel />
              <SourcingSignalBadge signal={sourcingSignal} size="md" />
              {company.is_enriched ? (
                <span
                  className={styles.enrichedStamp}
                  title="Enriched by AI"
                >
                  <CheckCircle2 size={13} strokeWidth={2} />
                  Enriched{enrichedAt ? ` · ${enrichedAt}` : ''}
                </span>
              ) : (
                <span className={styles.unenrichedStamp}>Not enriched</span>
              )}
              {sourceLabel ? (
                <span
                  className={styles.sourceStamp}
                  title={sourceInfo?.raw ?? undefined}
                >
                  {sourceLabel}
                </span>
              ) : null}
            </div>
            {sourcingSignal?.evidence && sourcingSignal.evidence.length > 0 && (
              <p className={styles.signalEvidence}>
                {sourcingSignal.evidence.slice(0, 2).join(' · ')}
              </p>
            )}

            {scoreBreakdown ? (
              <ScoreBreakdown breakdown={scoreBreakdown} />
            ) : null}

            <HeroActions
              companyId={company.id}
              companyName={company.name}
              initialFavorited={Boolean(company.is_favorited)}
            />
          </div>
        </div>
      </section>

      <CompanyDossierTabs company={dossierCompany} />
    </div>
  );
}

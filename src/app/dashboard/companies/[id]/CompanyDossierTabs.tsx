'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ExternalLink,
  Globe,
  Mail,
  Package,
  Phone,
  Send,
  Ship,
  Star,
  Tag,
  Users,
} from 'lucide-react';
import { useToast } from '@/components/Toast';
import EmptyState from '@/components/EmptyState';
import { getIntent, type CompanyType } from '@/lib/intent';
import { formatNumber, formatDate, relativeFromNow } from '@/lib/format';
import ShipmentChart from './ShipmentChart';
import heroStyles from './page.module.css';
import styles from './CompanyDossierTabs.module.css';

type TabKey = 'overview' | 'shipments' | 'commodities' | 'contacts';

interface ContactEntry {
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  title?: string;
  [key: string]: unknown;
}

export interface HsCodeEntry {
  code: string;
  description?: string;
  shipments?: number;
}

export interface SupplierEntry {
  name: string;
  country?: string;
  shipments?: number;
}

export interface TradingPartnerEntry {
  name: string;
  country?: string;
  role?: string;
}

export interface ScoreBreakdownData {
  commodityMatch?: number;
  shipmentVolume?: number;
  recency?: number;
  tradeDirection?: number;
  marketFit?: number;
  reasons?: string[];
}

export interface DossierCompany {
  id: string;
  name: string;
  type: CompanyType | null;
  hq_city: string | null;
  hq_country: string | null;
  description: string | null;
  origin_countries: string[] | null;
  destination_countries: string[] | null;
  products_dealt: string[] | null;
  contacts: ContactEntry[] | null;
  total_shipments?: number | null;
  last_shipment_date?: string | null;
  source_url?: string | null;
  top_suppliers?: SupplierEntry[] | null;
  hs_codes?: HsCodeEntry[] | null;
  top_trading_partners?: TradingPartnerEntry[] | null;
  trademarks?: string[] | null;
  buyer_fit_score?: number | null;
  score_breakdown?: ScoreBreakdownData | null;
}

interface CompanyDossierTabsProps {
  company: DossierCompany;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'shipments', label: 'Shipment History' },
  { key: 'commodities', label: 'Commodities' },
  { key: 'contacts', label: 'Contacts' },
];

function initials(name: string | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('') || '?';
}

interface HeroActionsProps {
  companyId: string;
  companyName: string;
  initialFavorited: boolean;
}

/**
 * Star/Unstar + Generate outreach buttons. Star posts to the existing
 * `/api/companies/favorite` route with an optimistic UI flip; outreach
 * navigates to the outreach center with the company id pre-loaded in
 * the URL so the page can hydrate the recipient field (see
 * `dashboard/outreach/page.tsx` for the consumer).
 */
export function HeroActions({
  companyId,
  companyName,
  initialFavorited,
}: HeroActionsProps) {
  const { toast } = useToast();
  const [favorited, setFavorited] = useState(initialFavorited);
  const [pending, setPending] = useState(false);

  const handleToggleFavorite = async () => {
    if (pending) return;
    const next = !favorited;
    setFavorited(next);
    setPending(true);
    try {
      const res = await fetch('/api/companies/favorite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, favorited: next }),
      });
      const data = await res.json();
      if (!data?.success) {
        setFavorited(!next);
        toast(data?.error || 'Failed to save favorite', 'error');
      }
    } catch (err) {
      console.error('Favorite toggle error:', err);
      setFavorited(!next);
      toast('Failed to save favorite', 'error');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={heroStyles.actionRow}>
      <button
        type="button"
        className={`${heroStyles.favoriteBtn} ${
          favorited ? heroStyles.favoriteActive : ''
        }`}
        onClick={handleToggleFavorite}
        aria-pressed={favorited}
        aria-label={favorited ? 'Unstar company' : 'Star company'}
      >
        <Star
          size={16}
          strokeWidth={1.8}
          fill={favorited ? 'currentColor' : 'none'}
        />
        {favorited ? 'Starred' : 'Star'}
      </button>
      <Link
        href={`/dashboard/outreach?companyId=${encodeURIComponent(
          companyId,
        )}&companyName=${encodeURIComponent(companyName)}`}
        className={heroStyles.outreachBtn}
      >
        <Send size={16} strokeWidth={1.8} />
        Generate outreach
      </Link>
    </div>
  );
}

function ShipmentsTab({ company }: { company: DossierCompany }) {
  const hasAnyData =
    company.total_shipments != null ||
    (company.hs_codes && company.hs_codes.length > 0) ||
    (company.top_suppliers && company.top_suppliers.length > 0) ||
    (company.top_trading_partners && company.top_trading_partners.length > 0) ||
    (company.trademarks && company.trademarks.length > 0);

  if (!hasAnyData) {
    return (
      <div className="fade-in">
        <EmptyState
          icon={<Ship size={48} strokeWidth={1} />}
          title="No customs data yet."
          description="Customs-grade shipment intelligence (ImportYeti) will appear here once this company is enriched from that source."
        />
      </div>
    );
  }

  const hsCodes = company.hs_codes ?? [];
  const suppliers = company.top_suppliers ?? [];
  const partners = company.top_trading_partners ?? [];
  const marks = company.trademarks ?? [];
  const lastRel = relativeFromNow(company.last_shipment_date);
  const lastFmt = formatDate(company.last_shipment_date);

  return (
    <div className={`fade-in ${styles.shipmentsPanel}`}>
      {/* Headline stats */}
      <div className={styles.shipmentStats}>
        {company.total_shipments != null && (
          <div className={styles.shipmentStat}>
            <span className={styles.statValue}>{formatNumber(company.total_shipments)}</span>
            <span className={styles.statLabel}>Total shipments</span>
          </div>
        )}
        {lastFmt && (
          <div className={styles.shipmentStat}>
            <span className={styles.statValue}>{lastRel || lastFmt}</span>
            <span className={styles.statLabel}>Last shipment{lastRel ? ` · ${lastFmt}` : ''}</span>
          </div>
        )}
        {company.source_url && (
          <a
            href={company.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.sourceLink}
          >
            <ExternalLink size={13} strokeWidth={1.8} />
            View source profile
          </a>
        )}
      </div>

      {/* HS code chart */}
      {hsCodes.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>
            <Package size={15} strokeWidth={1.8} />
            Shipments by HS code
          </h3>
          <ShipmentChart hsCodes={hsCodes} />
        </div>
      )}

      {/* Top suppliers */}
      {suppliers.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>
            <Globe size={15} strokeWidth={1.8} />
            Top suppliers
          </h3>
          <div className={styles.supplierList}>
            {suppliers.map((s, i) => (
              <div key={`${s.name}-${i}`} className={styles.supplierRow}>
                <span className={styles.supplierName}>{s.name}</span>
                {s.country && <span className={styles.supplierCountry}>{s.country}</span>}
                {s.shipments != null && (
                  <span className={styles.supplierShipments}>
                    {formatNumber(s.shipments)} shp
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top trading partners */}
      {partners.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>
            <Ship size={15} strokeWidth={1.8} />
            Top trading partners
          </h3>
          <div className={styles.supplierList}>
            {partners.map((p, i) => (
              <div key={`${p.name}-${i}`} className={styles.supplierRow}>
                <span className={styles.supplierName}>{p.name}</span>
                {p.country && <span className={styles.supplierCountry}>{p.country}</span>}
                {p.role && <span className={styles.partnerRole}>{p.role}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trademarks */}
      {marks.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>
            <Tag size={15} strokeWidth={1.8} />
            Trademarks
          </h3>
          <div className={styles.trademarkChips}>
            {marks.map((tm) => (
              <span key={tm} className={styles.trademarkChip}>{tm}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CompanyDossierTabs({ company }: CompanyDossierTabsProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  const intent = getIntent(company.type);
  const origin = (company.origin_countries ?? []).filter(Boolean);
  const dest = (company.destination_countries ?? []).filter(Boolean);
  const products = (company.products_dealt ?? []).filter(Boolean);
  const contacts = company.contacts ?? [];

  return (
    <div className={styles.tabsCard}>
      <div className={styles.tabsBar} role="tablist" aria-label="Company dossier tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={activeTab === t.key}
            className={`${styles.tabItem} ${activeTab === t.key ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.tabPanel}>
        {activeTab === 'overview' && (
          <div className="fade-in">
            <div className={styles.overviewGrid}>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Profile type</span>
                <span
                  className={`${styles.fieldValue} ${
                    company.type ? '' : styles.fieldMuted
                  }`}
                >
                  {company.type ?? 'Unclassified'}
                  {company.type ? ` · ${intent.description}` : ''}
                </span>
              </div>

              <div className={styles.field}>
                <span className={styles.fieldLabel}>Country (HQ)</span>
                <span
                  className={`${styles.fieldValue} ${
                    company.hq_country ? '' : styles.fieldMuted
                  }`}
                >
                  {[company.hq_city, company.hq_country].filter(Boolean).join(', ') ||
                    'Unknown'}
                </span>
              </div>

              <div className={styles.field}>
                <span className={styles.fieldLabel}>Sources from</span>
                <span
                  className={`${styles.fieldValue} ${
                    origin.length ? '' : styles.fieldMuted
                  }`}
                >
                  <span className={styles.fieldRow}>
                    <ArrowDownToLine
                      size={15}
                      strokeWidth={1.8}
                      className={styles.fieldIconIn}
                      aria-hidden="true"
                    />
                    <span>{origin.length ? origin.join(', ') : 'Not yet enriched'}</span>
                  </span>
                </span>
              </div>

              <div className={styles.field}>
                <span className={styles.fieldLabel}>Ships to</span>
                <span
                  className={`${styles.fieldValue} ${
                    dest.length ? '' : styles.fieldMuted
                  }`}
                >
                  <span className={styles.fieldRow}>
                    <ArrowUpFromLine
                      size={15}
                      strokeWidth={1.8}
                      className={styles.fieldIconOut}
                      aria-hidden="true"
                    />
                    <span>{dest.length ? dest.join(', ') : 'Not yet enriched'}</span>
                  </span>
                </span>
              </div>
            </div>

            <div className={styles.productSection}>
              <span className={styles.fieldLabel}>Products dealt in</span>
              {products.length === 0 ? (
                <p className={`${styles.fieldValue} ${styles.fieldMuted}`}>
                  No products enriched yet.
                </p>
              ) : (
                <div className={styles.productChips}>
                  {products.map((p) => (
                    <span key={p} className={styles.productChip}>
                      {p}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'shipments' && (
          <ShipmentsTab company={company} />
        )}

        {activeTab === 'commodities' && (
          <div className="fade-in">
            {products.length === 0 && !company.hs_codes?.length ? (
              <EmptyState
                title="No commodities enriched yet."
                description="Run enrichment on this company to populate the products it deals in. Each product becomes a clickable chip that finds related buyers and sellers."
              />
            ) : (
              <>
                {products.length > 0 && (
                  <>
                    <p className={styles.commodityHelp}>
                      Click any commodity to find more buyers and sellers dealing in it.
                    </p>
                    <div className={styles.commodityChips}>
                      {products.map((p) => (
                        <Link
                          key={p}
                          href={`/dashboard/search?q=${encodeURIComponent(p)}`}
                          className={styles.commodityChip}
                        >
                          {p}
                        </Link>
                      ))}
                    </div>
                  </>
                )}

                {company.hs_codes && company.hs_codes.length > 0 && (
                  <div className={styles.hsSection}>
                    <span className={styles.hsSectionTitle}>
                      <Package size={14} strokeWidth={1.8} />
                      HS Codes
                    </span>
                    <div className={styles.hsTable}>
                      {company.hs_codes.map((hs) => (
                        <div key={hs.code} className={styles.hsRow}>
                          <span className={styles.hsCode}>{hs.code}</span>
                          <span className={styles.hsDesc}>{hs.description ?? '—'}</span>
                          {hs.shipments != null ? (
                            <span className={styles.hsShipments}>
                              {formatNumber(hs.shipments)} shp
                            </span>
                          ) : (
                            <span />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'contacts' && (
          <div className="fade-in">
            {contacts.length === 0 ? (
              <EmptyState
                icon={<Users size={48} strokeWidth={1} />}
                title="No verified contacts yet."
                description="Click Enrich on this company to fetch decision-maker details — names, roles, email, and phone where available."
              />
            ) : (
              <div className={styles.contactsList}>
                {contacts.map((c, idx) => {
                  const role = c.role ?? c.title ?? '';
                  return (
                    <div key={`${c.email ?? c.name ?? idx}`} className={styles.contactCard}>
                      <div className={styles.contactAvatar}>{initials(c.name)}</div>
                      <div className={styles.contactDetails}>
                        <span className={styles.contactName}>
                          {c.name ?? 'Unnamed contact'}
                        </span>
                        {role ? <span className={styles.contactRole}>{role}</span> : null}
                      </div>
                      <div className={styles.contactLinks}>
                        {c.email ? (
                          <a
                            href={`mailto:${c.email}`}
                            className={styles.contactLink}
                          >
                            <Mail size={14} strokeWidth={1.8} />
                            {c.email}
                          </a>
                        ) : null}
                        {c.phone ? (
                          <a
                            href={`tel:${c.phone}`}
                            className={styles.contactLink}
                          >
                            <Phone size={14} strokeWidth={1.8} />
                            {c.phone}
                          </a>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

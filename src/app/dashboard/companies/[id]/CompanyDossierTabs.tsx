'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Mail,
  Phone,
  Send,
  Star,
  Users,
} from 'lucide-react';
import { useToast } from '@/components/Toast';
import EmptyState from '@/components/EmptyState';
import { getIntent, type CompanyType } from '@/lib/intent';
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
          <div className={`fade-in ${styles.shipmentStub}`}>
            <EmptyState
              title="Shipment data not yet enriched."
              description="Customs-data enrichment (ImportYeti / Panjiva-style actor) is roadmapped — when it lands you'll see this lead's last 12 months of port-of-entry shipments here, with origin port, destination port, container count, and commodity."
            />
            <div className={styles.shipmentStubBars} aria-hidden="true">
              {[40, 64, 28, 80, 52, 72, 36, 90, 48, 60, 32, 76].map((h, i) => (
                <div
                  key={i}
                  className={styles.shipmentStubBar}
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>
        )}

        {activeTab === 'commodities' && (
          <div className="fade-in">
            {products.length === 0 ? (
              <EmptyState
                title="No commodities enriched yet."
                description="Run enrichment on this company to populate the products it deals in. Each product becomes a clickable chip that finds related buyers and sellers."
              />
            ) : (
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

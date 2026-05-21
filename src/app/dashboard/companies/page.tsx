import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Building2, MapPin, ExternalLink, Sparkles } from 'lucide-react';
import { getUserContext } from '@/lib/auth/server';
import EmptyState from '@/components/EmptyState';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

interface CompanyRow {
  id: string;
  name: string;
  type: 'Importer' | 'Exporter' | 'Broker' | null;
  hq_city: string | null;
  hq_country: string | null;
  website: string | null;
  products_dealt: string[] | null;
  is_enriched: boolean | null;
  created_at: string | null;
}

function typeBadgeClass(type: CompanyRow['type']): string {
  switch (type) {
    case 'Importer':
      return 'badge badge-lime';
    case 'Exporter':
      return 'badge badge-blue';
    case 'Broker':
      return 'badge badge-yellow';
    default:
      return 'badge';
  }
}

function hostname(url: string | null): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}

export default async function CompaniesDirectory() {
  const context = await getUserContext();
  if (!context) redirect('/');

  const { orgId, supabase } = context;

  const { data: companies } = await supabase
    .from('companies')
    .select('id, name, type, hq_city, hq_country, website, products_dealt, is_enriched, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(200);

  const rows: CompanyRow[] = (companies ?? []) as CompanyRow[];

  return (
    <div className={`${styles.directoryContainer} fade-in`}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Companies</h1>
          <span className={styles.subtitle}>
            {rows.length === 0
              ? 'No companies yet'
              : `${rows.length} ${rows.length === 1 ? 'company' : 'companies'} in your directory`}
          </span>
        </div>
        <Link href="/dashboard/search" className="btn-primary">
          Search & enrich
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className={styles.emptyWrap}>
          <EmptyState
            icon={<Building2 size={48} strokeWidth={1} />}
            title="Your directory is empty"
            description="Run the Lead Scraper Agent to discover commodity buyers and sellers, or use AI search to seed companies from natural-language queries."
          />
          <div className={styles.emptyActions}>
            <Link href="/dashboard/search" className="btn-primary">
              Open AI search
            </Link>
            <Link href="/dashboard/agents" className="btn-secondary">
              Run Lead Scraper
            </Link>
          </div>
        </div>
      ) : (
        <div className={styles.grid}>
          {rows.map((c) => {
            const products = c.products_dealt ?? [];
            const visibleProducts = products.slice(0, 3);
            const extraCount = Math.max(0, products.length - visibleProducts.length);
            const host = hostname(c.website);

            return (
              <Link
                key={c.id}
                href={`/dashboard/companies/${c.id}`}
                className={styles.card}
              >
                <div className={styles.cardTop}>
                  <div className={styles.titleStack}>
                    <h3 className={styles.companyName}>{c.name}</h3>
                    <div className={styles.geo}>
                      <MapPin size={14} strokeWidth={1.6} />
                      <span>
                        {[c.hq_city, c.hq_country].filter(Boolean).join(', ') ||
                          'Location unknown'}
                      </span>
                    </div>
                  </div>
                  <span className={typeBadgeClass(c.type)}>{c.type ?? 'Unknown'}</span>
                </div>

                {products.length > 0 && (
                  <div className={styles.chipRow}>
                    {visibleProducts.map((p) => (
                      <span key={p} className={styles.chip}>
                        {p}
                      </span>
                    ))}
                    {extraCount > 0 && (
                      <span className={styles.chipMore}>+{extraCount} more</span>
                    )}
                  </div>
                )}

                <div className={styles.cardFooter}>
                  {host ? (
                    <span className={styles.website}>
                      <ExternalLink size={13} strokeWidth={1.6} />
                      {host}
                    </span>
                  ) : (
                    <span className={styles.websiteMuted}>No website</span>
                  )}
                  {c.is_enriched ? (
                    <span className={styles.enrichedTag}>
                      <Sparkles size={12} strokeWidth={1.8} />
                      Enriched
                    </span>
                  ) : (
                    <span className={styles.unenrichedTag}>Not enriched</span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

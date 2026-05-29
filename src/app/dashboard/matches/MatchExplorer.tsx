'use client';

import React, { useState, useCallback, useTransition, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Target, Loader2, Inbox, Send, Medal, Radar, Search, Sparkles, Mail } from 'lucide-react';
import BuyerFitBadge from '@/components/BuyerFitBadge';
import SourcingSignalBadge from '@/components/SourcingSignalBadge';
import IntentChip from '@/components/IntentChip';
import { useToast } from '@/components/Toast';
import { formatNumber, relativeFromNow } from '@/lib/format';
import styles from './MatchExplorer.module.css';

interface DiscoverSummary {
  product: string;
  suppliersScanned: number;
  relevantSuppliers: number;
  candidateBuyers: number;
  inserted: number;
}

interface HsCode {
  code?: string;
  description?: string;
  shipments?: number;
}

interface MatchResult {
  id: string;
  name: string;
  type: string | null;
  hq_country: string | null;
  hq_city: string | null;
  total_shipments: number | null;
  last_shipment_date: string | null;
  hs_codes: unknown;
  products_dealt: string[] | null;
  score: number;
  tier: 'hot' | 'warm' | 'cool';
  reasons: string[];
  sourcing_signal?: { status?: string | null; headline?: string | null } | null;
}

interface DemandItem {
  id: string;
  product: string;
  quantity?: string;
  raw_intent?: string;
}

interface MatchExplorerProps {
  orgCommodities: string[];
  demandItems: DemandItem[];
  initialCommodity: string | null;
  initialResults: MatchResult[];
}

function hsCodeList(raw: unknown): HsCode[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is HsCode =>
      item !== null && typeof item === 'object' && 'description' in item,
  );
}

function RankMedal({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <span className={`${styles.medal} ${styles.medal1}`}>
        <Medal size={14} strokeWidth={2} />1
      </span>
    );
  if (rank === 2)
    return (
      <span className={`${styles.medal} ${styles.medal2}`}>
        <Medal size={14} strokeWidth={2} />2
      </span>
    );
  if (rank === 3)
    return (
      <span className={`${styles.medal} ${styles.medal3}`}>
        <Medal size={14} strokeWidth={2} />3
      </span>
    );
  return <span className={styles.rankNumber}>#{rank}</span>;
}

function MatchCard({
  match,
  rank,
  commodity,
}: {
  match: MatchResult;
  rank: number;
  commodity: string | null;
}) {
  const hsCodes = hsCodeList(match.hs_codes).slice(0, 3);
  const outreachHref = `/dashboard/outreach?companyId=${encodeURIComponent(match.id)}&companyName=${encodeURIComponent(match.name)}${commodity ? `&product=${encodeURIComponent(commodity)}` : ''}`;

  return (
    <div className={`${styles.matchCard} ${rank <= 3 ? styles.topCard : ''} fade-in`}>
      <div className={styles.rankCol}>
        <RankMedal rank={rank} />
      </div>

      <div className={styles.mainCol}>
        <div className={styles.cardTop}>
          <div className={styles.nameRow}>
            <Link href={`/dashboard/companies/${match.id}`} className={styles.companyLink}>
              {match.name}
            </Link>
            {match.hq_city || match.hq_country ? (
              <span className={styles.geo}>
                {[match.hq_city, match.hq_country].filter(Boolean).join(', ')}
              </span>
            ) : null}
          </div>
          <div className={styles.badgeRow}>
            <IntentChip type={match.type} size="sm" />
            <BuyerFitBadge score={match.score} size="md" showLabel />
            <SourcingSignalBadge signal={match.sourcing_signal} size="sm" />
          </div>
        </div>

        <div className={styles.metricsRow}>
          {match.total_shipments != null && (
            <span className={styles.metric}>
              <span className={styles.metricVal}>{formatNumber(match.total_shipments)}</span>
              <span className={styles.metricLabel}>shipments</span>
            </span>
          )}
          {match.last_shipment_date && (
            <span className={styles.metric}>
              <span className={styles.metricVal}>{relativeFromNow(match.last_shipment_date)}</span>
              <span className={styles.metricLabel}>last active</span>
            </span>
          )}
        </div>

        {hsCodes.length > 0 && (
          <div className={styles.hsRow}>
            {hsCodes.map((hs, i) => (
              <span key={i} className={styles.hsChip}>
                {hs.description ?? hs.code}
              </span>
            ))}
          </div>
        )}

        {match.reasons.length > 0 && (
          <div className={styles.reasonsRow}>
            {match.reasons.map((r, i) => (
              <span key={i} className={styles.reasonChip}>
                {r}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className={styles.actionCol}>
        <Link href={outreachHref} className={`btn-primary ${styles.outreachBtn}`}>
          <Send size={14} strokeWidth={2} />
          Generate outreach
        </Link>
      </div>
    </div>
  );
}

export default function MatchExplorer({
  orgCommodities,
  demandItems,
  initialCommodity,
  initialResults,
}: MatchExplorerProps) {
  const [selected, setSelected] = useState<string | null>(initialCommodity);
  const [freeText, setFreeText] = useState('');
  const [results, setResults] = useState<MatchResult[]>(initialResults);
  const [activeCommodity, setActiveCommodity] = useState<string | null>(initialCommodity);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Live customs discovery — distinct from the (fast) re-ranking transition.
  const [discoverInput, setDiscoverInput] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [findingContacts, setFindingContacts] = useState(false);
  const [summary, setSummary] = useState<DiscoverSummary | null>(null);

  const runMatch = useCallback(
    (commodity: string | null, demandId?: string) => {
      startTransition(async () => {
        setError(null);
        try {
          const body: Record<string, unknown> = { limit: 20 };
          if (commodity) body.commodity = commodity;
          if (demandId) body.demandId = demandId;

          const res = await fetch('/api/matches', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error ?? 'Match failed');
          setResults(json.results ?? []);
          setActiveCommodity(json.commodity ?? commodity);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : 'Something went wrong');
        }
      });
    },
    [],
  );

  const runDiscover = useCallback(
    async (product: string) => {
      setDiscovering(true);
      setError(null);
      setSummary(null);
      try {
        const res = await fetch('/api/discover-buyers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Discovery failed');
        setSummary({
          product,
          suppliersScanned: json.suppliersScanned ?? 0,
          relevantSuppliers: json.relevantSuppliers ?? 0,
          candidateBuyers: json.candidateBuyers ?? 0,
          inserted: json.inserted ?? 0,
        });
        toast(
          `Found ${json.candidateBuyers ?? 0} buyer${(json.candidateBuyers ?? 0) === 1 ? '' : 's'} of ${product}` +
            ` — ${json.inserted ?? 0} new`,
          'success',
        );
        setSelected(null);
        runMatch(product); // refresh the leaderboard to surface the new buyers
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Discovery failed';
        setError(msg);
        toast(msg, 'error');
      } finally {
        setDiscovering(false);
      }
    },
    [runMatch, toast],
  );

  const runEnrich = useCallback(async () => {
    setEnriching(true);
    try {
      const res = await fetch('/api/discover-buyers/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 5 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Enrichment failed');
      toast(
        `Enriched ${json.enriched ?? 0} of ${json.attempted ?? 0} lead${(json.attempted ?? 0) === 1 ? '' : 's'} with full customs profiles`,
        (json.enriched ?? 0) > 0 ? 'success' : 'info',
      );
      if (summary) runMatch(summary.product);
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Enrichment failed', 'error');
    } finally {
      setEnriching(false);
    }
  }, [runMatch, toast, summary]);

  const runFindContacts = useCallback(async () => {
    setFindingContacts(true);
    try {
      const res = await fetch('/api/discover-buyers/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 5 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Contact lookup failed');
      if ((json.attempted ?? 0) === 0) {
        toast('No reachable buyers yet — enrich profiles first to surface websites.', 'info');
      } else {
        toast(
          `Found contacts for ${json.withContacts ?? 0} of ${json.attempted ?? 0} buyer${(json.attempted ?? 0) === 1 ? '' : 's'} with a website`,
          (json.withContacts ?? 0) > 0 ? 'success' : 'info',
        );
      }
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Contact lookup failed', 'error');
    } finally {
      setFindingContacts(false);
    }
  }, [toast]);

  const handleDiscoverSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = discoverInput.trim();
    if (!val || discovering) return;
    runDiscover(val);
  };

  const selectChip = (c: string) => {
    setSelected(c);
    setFreeText('');
    runMatch(c);
  };

  const handleFreeTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = freeText.trim();
    if (!val) return;
    setSelected(null);
    runMatch(val);
  };

  const handleDemand = (item: DemandItem) => {
    setSelected(null);
    setFreeText('');
    runMatch(item.product, item.id);
  };

  // Auto-focus free-text when no chip is active
  useEffect(() => {
    if (!selected && inputRef.current) inputRef.current.focus();
  }, [selected]);

  return (
    <div className={styles.explorer}>
      <section className={styles.pickerSection}>
        <div className={styles.pickerLabel}>
          <Target size={16} strokeWidth={1.8} />
          <span>Match for commodity</span>
        </div>

        <div className={styles.chipRow}>
          {orgCommodities.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => selectChip(c)}
              className={`${styles.commodityChip} ${selected === c ? styles.active : ''}`}
            >
              {c}
            </button>
          ))}
        </div>

        <form onSubmit={handleFreeTextSubmit} className={styles.freeTextRow}>
          <input
            ref={inputRef}
            type="text"
            className={`input ${styles.freeInput}`}
            placeholder="Or type any commodity…"
            value={freeText}
            onChange={(e) => {
              setFreeText(e.target.value);
              if (selected) setSelected(null);
            }}
            aria-label="Custom commodity"
          />
          <button type="submit" className="btn-secondary" disabled={!freeText.trim()}>
            Match
          </button>
        </form>
      </section>

      <section className={styles.discoverSection}>
        <div className={styles.pickerLabel}>
          <Radar size={16} strokeWidth={1.8} />
          <span>Discover new buyers from live customs records</span>
        </div>
        <p className={styles.discoverHint}>
          Scans US import bills of lading for a product, keeps only the suppliers
          that genuinely ship it, then surfaces the US importers buying from them —
          real, customs-provable buyers you don&apos;t have yet.
        </p>

        <form onSubmit={handleDiscoverSubmit} className={styles.freeTextRow}>
          <input
            type="text"
            className={`input ${styles.freeInput}`}
            placeholder="Product to find buyers for, e.g. black pepper"
            value={discoverInput}
            onChange={(e) => setDiscoverInput(e.target.value)}
            disabled={discovering}
            aria-label="Product to discover buyers for"
          />
          <button
            type="submit"
            className={`btn-primary ${styles.actionBtn}`}
            disabled={discovering || !discoverInput.trim()}
          >
            {discovering ? (
              <>
                <Loader2 size={14} className={styles.spin} /> Scanning…
              </>
            ) : (
              <>
                <Search size={14} strokeWidth={2} /> Discover buyers
              </>
            )}
          </button>
        </form>

        {discovering && (
          <p className={styles.discoverProgress}>
            <Loader2 size={14} className={styles.spin} />
            Scanning customs records — this can take up to a minute.
          </p>
        )}

        {summary && (
          <div className={styles.summaryBanner}>
            <span>
              <strong>{summary.suppliersScanned}</strong> suppliers scanned
            </span>
            <span>
              <strong>{summary.relevantSuppliers}</strong> genuinely ship {summary.product}
            </span>
            <span>
              <strong>{summary.candidateBuyers}</strong> buyers · <strong>{summary.inserted}</strong> new
            </span>
            <div className={styles.summaryActions}>
              <button
                type="button"
                className={`btn-secondary ${styles.actionBtn}`}
                onClick={runEnrich}
                disabled={enriching}
              >
                {enriching ? (
                  <>
                    <Loader2 size={14} className={styles.spin} /> Enriching…
                  </>
                ) : (
                  <>
                    <Sparkles size={14} strokeWidth={2} /> Enrich profiles
                  </>
                )}
              </button>
              <button
                type="button"
                className={`btn-secondary ${styles.actionBtn}`}
                onClick={runFindContacts}
                disabled={findingContacts}
              >
                {findingContacts ? (
                  <>
                    <Loader2 size={14} className={styles.spin} /> Finding…
                  </>
                ) : (
                  <>
                    <Mail size={14} strokeWidth={2} /> Find contacts
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </section>

      {demandItems.length > 0 && (
        <section className={styles.demandSection}>
          <div className={styles.pickerLabel}>
            <Inbox size={16} strokeWidth={1.8} />
            <span>Match from Active Demand</span>
          </div>
          <div className={styles.demandRow}>
            {demandItems.map((d) => (
              <button
                key={d.id}
                type="button"
                className={styles.demandCard}
                onClick={() => handleDemand(d)}
              >
                <span className={styles.demandProduct}>{d.product}</span>
                {d.quantity && <span className={styles.demandMeta}>{d.quantity}</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className={styles.leaderboardSection}>
        <div className={styles.leaderboardHeader}>
          <h2 className={styles.leaderboardTitle}>
            {activeCommodity ? (
              <>
                Best buyers for{' '}
                <span className={styles.commodityHighlight}>{activeCommodity}</span>
              </>
            ) : (
              'Buyer leaderboard'
            )}
          </h2>
          {isPending && (
            <span className={styles.loadingIndicator}>
              <Loader2 size={16} className={styles.spin} />
              Ranking…
            </span>
          )}
        </div>

        {error && <div className={styles.errorBanner}>{error}</div>}

        {!isPending && results.length === 0 && (
          <div className={styles.emptyState}>
            <Target size={40} strokeWidth={1} className={styles.emptyIcon} />
            <p className={styles.emptyTitle}>No scored companies yet</p>
            <p className={styles.emptyBody}>
              Run the Lead Scraper Agent or enrich your directory to generate buyer-fit scores.
            </p>
            <Link href="/dashboard/agents" className="btn-secondary">
              Run Lead Scraper
            </Link>
          </div>
        )}

        {!isPending && results.length > 0 && (
          <ol className={styles.leaderboard}>
            {results.map((match, i) => (
              <li key={match.id}>
                <MatchCard match={match} rank={i + 1} commodity={activeCommodity} />
              </li>
            ))}
          </ol>
        )}

        {isPending && (
          <div className={styles.skeletonList}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={`skeleton ${styles.skeletonCard}`} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

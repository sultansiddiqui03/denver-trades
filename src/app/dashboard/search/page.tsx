'use client';

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Download,
  ExternalLink,
  MapPin,
  Search as SearchIcon,
  Sparkles,
  Star,
} from 'lucide-react';
import { useToast } from '@/components/Toast';
import EmptyState from '@/components/EmptyState';
import Button from '@/components/Button';
import SearchSuggestions from '@/components/SearchSuggestions';
import { exportToCsv } from '@/lib/exportCsv';
import { getIntent, intentSlugToType, type CompanyType } from '@/lib/intent';
import styles from './page.module.css';

interface Company {
  id: string;
  name: string;
  hq_country: string;
  hq_city: string;
  type: CompanyType;
  confidence_score: number;
  products_dealt: string[];
  origin_countries?: string[] | null;
  destination_countries?: string[] | null;
  description?: string;
  website?: string | null;
  is_favorited: boolean;
  is_enriched: boolean;
  enriched_at?: string | null;
}

function formatEnrichedDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function hostname(url: string | null | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}

const suggestions = [
  'Black pepper importers in UAE',
  'Coriander seed exporters in India',
  'Cashew buyers',
  'Robusta coffee suppliers',
];

const TOAST_ENRICH_FAIL = 'Enrichment failed — check Claude/Gemini keys';

type SearchMode = 'keyword' | 'semantic';

type IntentFilter = 'All' | CompanyType;

const INTENT_FILTERS: { value: IntentFilter; label: string }[] = [
  { value: 'All', label: 'All' },
  { value: 'Importer', label: 'Buyers' },
  { value: 'Exporter', label: 'Sellers' },
  { value: 'Broker', label: 'Brokers' },
];

// Next 16 prerender step disallows useSearchParams() outside a Suspense
// boundary — wrap the body in Suspense so the static shell prerenders, then
// the search params hook activates client-side on hydration.
export default function SearchWorkspacePage() {
  return (
    <Suspense fallback={null}>
      <SearchWorkspace />
    </Suspense>
  );
}

function SearchWorkspace() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('keyword');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [filterCountry, setFilterCountry] = useState('All');
  // intent filter (Buyers / Sellers / Brokers) reads ?intent=buyers etc. from
  // the URL so the sidebar's Find Buyers / Find Sellers links land here pre-set.
  const initialIntent: IntentFilter = intentSlugToType(searchParams.get('intent')) ?? 'All';
  const [filterType, setFilterType] = useState<IntentFilter>(initialIntent);
  const [loading, setLoading] = useState(false);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  // Typeahead state — the dropdown component listens to these via refs/props.
  const inputRef = useRef<HTMLInputElement>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Keyword: GET /api/search (Gemini intent extraction → SQL).
  // Semantic: POST /api/search/semantic (OpenAI embedding → pgvector HNSW).
  // Semantic requires a non-trivial query; keyword falls back to listing all.
  const performSearch = useCallback(
    async (searchQuery: string = '', currentMode: SearchMode = mode) => {
      setLoading(true);
      try {
        let data;
        if (currentMode === 'semantic') {
          if (searchQuery.trim().length < 2) {
            // Semantic with no query is meaningless — fall back to keyword listing.
            const response = await fetch('/api/search?q=');
            data = await response.json();
          } else {
            const response = await fetch('/api/search/semantic', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: searchQuery, limit: 20 }),
            });
            data = await response.json();
          }
        } else {
          const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
          data = await response.json();
        }

        if (data.success) {
          setCompanies(data.results || []);
        } else if (data.error) {
          toast(data.error, 'error');
        }
      } catch (err) {
        console.error('Error querying search API:', err);
        toast('Search failed — see console for details', 'error');
      } finally {
        setLoading(false);
      }
    },
    [mode, toast]
  );

  const handleModeChange = (next: SearchMode) => {
    setMode(next);
    // Re-run the current query under the new mode so the UI updates immediately.
    performSearch(query, next);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void performSearch();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [performSearch]);

  // Sync the intent filter when the URL changes (e.g. sidebar nav clicks).
  // The project's react-hooks/set-state-in-effect rule disallows direct
  // setState inside effects — defer into a microtask the same way
  // CommandPalette does for its localStorage rehydrate.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = intentSlugToType(searchParams.get('intent')) ?? 'All';
      setFilterType(next);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [searchParams]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(query);
    // Close the typeahead so the dropdown doesn't sit on top of fresh results.
    setIsInputFocused(false);
    inputRef.current?.blur();
  };

  const handleSuggestionClick = (sug: string) => {
    setQuery(sug);
    performSearch(sug);
    setIsInputFocused(false);
    inputRef.current?.blur();
  };

  // Stable handler reference so SearchSuggestions can subscribe to keydowns
  // without re-binding on every parent render.
  const handleSuggestionsClose = useCallback(() => {
    setIsInputFocused(false);
  }, []);

  const handleFavoriteToggle = async (id: string, currentVal: boolean) => {
    const next = !currentVal;
    // Optimistic toggle
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, is_favorited: next } : c));

    try {
      const res = await fetch('/api/companies/favorite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: id, favorited: next }),
      });
      const data = await res.json();
      if (!data.success) {
        // Rollback on failure
        setCompanies(prev => prev.map(c => c.id === id ? { ...c, is_favorited: currentVal } : c));
        toast(data.error || 'Failed to save favorite', 'error');
      }
    } catch (err) {
      console.error('Favorite toggle error:', err);
      setCompanies(prev => prev.map(c => c.id === id ? { ...c, is_favorited: currentVal } : c));
      toast('Failed to save favorite', 'error');
    }
  };

  const handleEnrich = async (id: string) => {
    setEnrichingId(id);
    try {
      const res = await fetch('/api/companies/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: id }),
      });
      const data = await res.json();
      if (data.success && data.company) {
        setCompanies(prev =>
          prev.map(c => (c.id === id ? { ...c, ...data.company, is_enriched: true } : c))
        );
        toast(`${data.company.name} enriched`, 'success');
      } else {
        toast(data.error || TOAST_ENRICH_FAIL, 'error');
      }
    } catch (err) {
      console.error('Enrichment error:', err);
      toast(TOAST_ENRICH_FAIL, 'error');
    } finally {
      setEnrichingId(null);
    }
  };

  // Filter Logic client-side for quick narrow downs
  const filteredCompanies = companies.filter((c) => {
    const matchesCountry = filterCountry === 'All' || c.hq_country === filterCountry;
    const matchesType = filterType === 'All' || c.type === filterType;
    return matchesCountry && matchesType;
  });

  // Extract unique countries for filter list
  const uniqueCountries = Array.from(new Set(companies.map(c => c.hq_country))).filter(Boolean).sort();
  const hasActiveFilters = filterCountry !== 'All' || filterType !== 'All';
  const dbIsEmpty = !loading && companies.length === 0;
  const filteredOut = !loading && companies.length > 0 && filteredCompanies.length === 0;

  return (
    <div className={`${styles.searchContainer} fade-in`}>
      {/* Header — intent-aware title so Find Buyers / Find Sellers feel native */}
      <div className={styles.searchHeader}>
        <h1 className={styles.searchTitle}>
          {filterType === 'Importer'
            ? 'Find buyers'
            : filterType === 'Exporter'
              ? 'Find sellers'
              : filterType === 'Broker'
                ? 'Find brokers'
                : 'AI search'}
        </h1>
        <span className={styles.searchSubtitle}>
          {filterType === 'Importer'
            ? 'Discover importers who are actually buying what you sell. Powered by Gemini intent parsing.'
            : filterType === 'Exporter'
              ? 'Surface exporters and producers with the goods you want to source. Powered by Gemini.'
              : mode === 'semantic'
                ? 'Vector similarity over embedded company profiles. Powered by OpenAI + pgvector.'
                : 'Query global buyer & seller directories in plain English. Powered by Gemini.'}
        </span>
      </div>

      {/* Intent pills — Tradyon-style Buyers / Sellers / Brokers split. Each
          pill drives the same state the country filter uses. */}
      <div className={styles.intentPills} role="tablist" aria-label="Filter by trade intent">
        {INTENT_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="tab"
            aria-selected={filterType === f.value}
            className={`${styles.intentPill} ${filterType === f.value ? styles.intentPillActive : ''} ${
              f.value !== 'All' ? styles[`intentPill_${f.value.toLowerCase()}`] || '' : ''
            }`}
            onClick={() => setFilterType(f.value)}
          >
            {f.label}
            {filterType === f.value && companies.length > 0 ? (
              <span className={styles.intentPillCount}>
                {f.value === 'All'
                  ? companies.length
                  : companies.filter((c) => c.type === f.value).length}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Mode toggle */}
      <div className={styles.modeToggle} role="tablist" aria-label="Search mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'keyword'}
          className={`${styles.modeBtn} ${mode === 'keyword' ? styles.modeBtnActive : ''}`}
          onClick={() => handleModeChange('keyword')}
        >
          Keyword
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'semantic'}
          className={`${styles.modeBtn} ${mode === 'semantic' ? styles.modeBtnActive : ''}`}
          onClick={() => handleModeChange('semantic')}
        >
          Semantic
        </button>
      </div>

      {/* Input box card */}
      <form onSubmit={handleSearchSubmit} className={styles.searchBoxCard}>
        <div className={styles.inputGroup}>
          <SearchIcon className={styles.searchIcon} size={18} strokeWidth={1.6} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            className={styles.searchInput}
            placeholder="Describe who you want to find — e.g. pepper buyers in Jebel Ali"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => {
              // Defer so a click inside the dropdown can land before the blur
              // closes it — the SearchSuggestions handler also calls onClose
              // when the user clicks fully outside.
              window.setTimeout(() => setIsInputFocused(false), 120);
            }}
            aria-label="Search query"
            role="combobox"
            aria-autocomplete="list"
            aria-controls="search-suggestions-listbox"
            aria-expanded={isInputFocused && query.trim().length > 0}
          />
          <button type="submit" className={styles.searchBtn} disabled={loading}>
            {loading ? 'Searching…' : 'Search'}
          </button>
          <SearchSuggestions
            query={query}
            onSelect={handleSuggestionClick}
            inputRef={inputRef}
            isInputFocused={isInputFocused}
            onClose={handleSuggestionsClose}
          />
        </div>

        {/* Suggestions — static "Try" row stays for the empty-query state.
            Once the user starts typing, the typeahead dropdown above takes
            over (it only renders when there's a non-empty query + focus). */}
        {query.trim().length === 0 && (
          <div className={styles.suggestionsRow}>
            <span className={styles.suggestionLabel}>Try</span>
            {suggestions.map((sug) => (
              <button
                key={sug}
                type="button"
                className={styles.suggestionBadge}
                onClick={() => handleSuggestionClick(sug)}
              >
                {sug}
              </button>
            ))}
          </div>
        )}
      </form>

      {/* Results Workspace */}
      <div className={styles.resultsSection}>
        <div className={styles.resultsMeta}>
          <span className={styles.resultsCount}>
            {filteredCompanies.length} {filteredCompanies.length === 1 ? 'match' : 'matches'}
          </span>

          <div className={styles.filtersRow}>
            <select
              className={styles.filterSelect}
              value={filterCountry}
              onChange={(e) => setFilterCountry(e.target.value)}
              aria-label="Filter by country"
            >
              <option value="All">All countries</option>
              {uniqueCountries.map(country => (
                <option key={country} value={country}>{country}</option>
              ))}
            </select>

            <button
              type="button"
              className={styles.exportBtn}
              disabled={filteredCompanies.length === 0}
              onClick={() => {
                if (filteredCompanies.length === 0) return;
                exportToCsv('denver-trades-companies', filteredCompanies.map(c => ({
                  Name: c.name,
                  Type: c.type,
                  Country: c.hq_country,
                  City: c.hq_city,
                  Products: (c.products_dealt || []).join('; '),
                  Website: c.website || '',
                  'Match Score': `${Math.round(c.confidence_score * 100)}%`,
                  Enriched: c.is_enriched ? 'Yes' : 'No',
                  Description: c.description || '',
                })));
                toast(`Exported ${filteredCompanies.length} companies to CSV`, 'success');
              }}
            >
              <Download size={14} strokeWidth={1.8} />
              Export CSV
            </button>
          </div>
        </div>

        {/* Loading Skeleton */}
        {loading ? (
          <div className={styles.skeletonGrid}>
            <div className="skeleton" style={{ height: '180px', borderRadius: 'var(--radius-lg)' }} />
            <div className="skeleton" style={{ height: '180px', borderRadius: 'var(--radius-lg)' }} />
            <div className="skeleton" style={{ height: '180px', borderRadius: 'var(--radius-lg)' }} />
            <div className="skeleton" style={{ height: '180px', borderRadius: 'var(--radius-lg)' }} />
          </div>
        ) : dbIsEmpty ? (
          <EmptyState
            icon={<SearchIcon size={48} strokeWidth={1} />}
            title="No companies in your directory yet"
            description="Run the Lead Scraper Agent to discover commodity buyers and sellers from Google Maps, or try a broader query."
            actionLabel="Run Lead Scraper"
            onAction={() => { window.location.href = '/dashboard/agents'; }}
          />
        ) : filteredOut ? (
          <EmptyState
            icon={<SearchIcon size={48} strokeWidth={1} />}
            title="No matches with these filters"
            description={
              hasActiveFilters
                ? 'Clear the country or type filter to widen the result set.'
                : 'Try a broader query like "spice importers" or run the Lead Scraper Agent to seed new companies.'
            }
            actionLabel={hasActiveFilters ? 'Clear filters' : 'Run Lead Scraper'}
            onAction={() => {
              if (hasActiveFilters) {
                setFilterCountry('All');
                setFilterType('All');
              } else {
                window.location.href = '/dashboard/agents';
              }
            }}
          />
        ) : (
          /* Company Card Grid */
          <div className={styles.resultsGrid}>
            {filteredCompanies.map((c) => {
              const products = c.products_dealt || [];
              const visibleProducts = products.slice(0, 3);
              const extraCount = Math.max(0, products.length - visibleProducts.length);
              const host = hostname(c.website);
              const intent = getIntent(c.type);
              const origin = (c.origin_countries || []).filter(Boolean);
              const dest = (c.destination_countries || []).filter(Boolean);
              const enrichedAt = formatEnrichedDate(c.enriched_at);

              return (
                <div key={c.id} className={styles.resultCard}>
                  <div className={styles.cardHeader}>
                    <div className={styles.companyTitleWrap}>
                      <Link href={`/dashboard/companies/${c.id}`} className={styles.companyNameLink}>
                        <h3 className={styles.companyName}>{c.name}</h3>
                      </Link>
                      <div className={styles.companyGeo}>
                        <MapPin size={14} strokeWidth={1.6} />
                        <span>
                          {[c.hq_city, c.hq_country].filter(Boolean).join(', ') || 'Location unknown'}
                        </span>
                      </div>
                    </div>
                    <div className={styles.cardHeaderRight}>
                      <span
                        className={`${styles.intentChip} ${styles[`intent_${intent.variant}`]}`}
                        title={intent.description}
                      >
                        {intent.label}
                      </span>
                      <div className={styles.scoreBadge}>
                        {Math.round(c.confidence_score * 100)}% match
                      </div>
                    </div>
                  </div>

                  <div className={styles.cardBody}>
                    {/* Trade lanes — the bit Tradyon leads with. Hidden when
                        neither side has any countries (un-enriched leads). */}
                    {(origin.length > 0 || dest.length > 0) && (
                      <div className={styles.tradeLanes}>
                        {origin.length > 0 && (
                          <div className={styles.tradeLane}>
                            <ArrowDownToLine size={13} strokeWidth={1.8} className={styles.tradeLaneIconIn} aria-hidden="true" />
                            <span className={styles.tradeLaneLabel}>Sources from</span>
                            <span className={styles.tradeLaneCountries}>
                              {origin.slice(0, 3).join(', ')}
                              {origin.length > 3 ? ` +${origin.length - 3}` : ''}
                            </span>
                          </div>
                        )}
                        {dest.length > 0 && (
                          <div className={styles.tradeLane}>
                            <ArrowUpFromLine size={13} strokeWidth={1.8} className={styles.tradeLaneIconOut} aria-hidden="true" />
                            <span className={styles.tradeLaneLabel}>Ships to</span>
                            <span className={styles.tradeLaneCountries}>
                              {dest.slice(0, 3).join(', ')}
                              {dest.length > 3 ? ` +${dest.length - 3}` : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className={styles.productsWrap}>
                      {visibleProducts.map((p) => (
                        <span key={p} className={styles.productChip}>
                          {p}
                        </span>
                      ))}
                      {extraCount > 0 && (
                        <span className={styles.productChipMore}>+{extraCount} more</span>
                      )}
                    </div>

                    {c.description ? (
                      <p className={styles.summaryText}>{c.description}</p>
                    ) : null}

                    <div className={styles.cardMeta}>
                      {c.is_enriched && (
                        <span className={styles.enrichedBadge} title="Enriched by AI">
                          <CheckCircle2 size={13} strokeWidth={2} />
                          Enriched{enrichedAt ? ` · ${enrichedAt}` : ''}
                        </span>
                      )}
                      {host && (
                        <a
                          href={c.website || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.websiteLink}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink size={13} strokeWidth={1.6} />
                          {host}
                        </a>
                      )}
                    </div>
                  </div>

                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      className={`${styles.favoriteBtn} ${c.is_favorited ? styles.favoriteActive : ''}`}
                      onClick={() => handleFavoriteToggle(c.id, c.is_favorited)}
                      aria-label={c.is_favorited ? 'Unstar lead' : 'Star lead'}
                      aria-pressed={c.is_favorited}
                    >
                      <Star
                        size={18}
                        strokeWidth={1.6}
                        fill={c.is_favorited ? 'currentColor' : 'none'}
                      />
                    </button>

                    <div className={styles.actionRow}>
                      {c.is_enriched ? (
                        <Link href={`/dashboard/companies/${c.id}`} className="btn-secondary">
                          View dossier
                        </Link>
                      ) : (
                        <Button
                          variant="primary"
                          loading={enrichingId === c.id}
                          loadingText="Enriching…"
                          onClick={() => handleEnrich(c.id)}
                        >
                          <Sparkles size={14} strokeWidth={1.8} />
                          Enrich
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

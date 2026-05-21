'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/Toast';
import EmptyState from '@/components/EmptyState';
import Button from '@/components/Button';
import { exportToCsv } from '@/lib/exportCsv';
import styles from './page.module.css';

interface Company {
  id: string;
  name: string;
  hq_country: string;
  hq_city: string;
  type: 'Importer' | 'Exporter' | 'Broker';
  confidence_score: number;
  products_dealt: string[];
  description?: string;
  is_favorited: boolean;
  is_enriched: boolean;
}

const suggestions = [
  'Black pepper importers in UAE',
  'Coriander seed exporters in India',
  'Cashew buyers',
  'Robusta coffee suppliers',
];

const TOAST_ENRICH_FAIL = 'Enrichment failed — check Claude/Gemini keys';

type SearchMode = 'keyword' | 'semantic';

export default function SearchWorkspace() {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('keyword');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [filterCountry, setFilterCountry] = useState('All');
  const [filterType, setFilterType] = useState('All');
  const [loading, setLoading] = useState(false);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);

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

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(query);
  };

  const handleSuggestionClick = (sug: string) => {
    setQuery(sug);
    performSearch(sug);
  };

  const handleFavoriteToggle = async (id: string, currentVal: boolean) => {
    // Optimistic toggle
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, is_favorited: !currentVal } : c));
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
  const uniqueCountries = Array.from(new Set(companies.map(c => c.hq_country))).filter(Boolean);

  return (
    <div className={`${styles.searchContainer} fade-in`}>
      {/* Header */}
      <div className={styles.searchHeader}>
        <h1 className={styles.searchTitle}>AI search</h1>
        <span className={styles.searchSubtitle}>
          {mode === 'semantic'
            ? 'Vector similarity over embedded company profiles. Powered by OpenAI + pgvector.'
            : 'Query global buyer directories in plain English. Powered by Gemini.'}
        </span>
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
          <svg className={styles.searchIcon} width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8.5" cy="8.5" r="5.5" />
            <path d="M13 13l4 4" />
          </svg>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Describe who you want to find — e.g. pepper buyers in Jebel Ali"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search query"
          />
          <button type="submit" className={styles.searchBtn} disabled={loading}>
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>

        {/* Suggestions */}
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
      </form>

      {/* Results Workspace */}
      <div className={styles.resultsSection}>
        <div className={styles.resultsMeta}>
          <span className={styles.resultsCount}>
            {filteredCompanies.length} {filteredCompanies.length === 1 ? 'match' : 'matches'}
          </span>

          <button
            type="button"
            className="btn-secondary"
            style={{ fontSize: '0.75rem', padding: '6px 12px' }}
            onClick={() => {
              if (filteredCompanies.length === 0) return;
              exportToCsv('denver-trades-companies', filteredCompanies.map(c => ({
                Name: c.name,
                Type: c.type,
                Country: c.hq_country,
                City: c.hq_city,
                Products: (c.products_dealt || []).join('; '),
                'Match Score': `${Math.round(c.confidence_score * 100)}%`,
                Enriched: c.is_enriched ? 'Yes' : 'No',
                Description: c.description || '',
              })));
              toast(`Exported ${filteredCompanies.length} companies to CSV`, 'success');
            }}
          >
            ↓ Export CSV
          </button>

          {/* Filtering controls */}
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

            <select
              className={styles.filterSelect}
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              aria-label="Filter by company type"
            >
              <option value="All">All types</option>
              <option value="Importer">Importer</option>
              <option value="Exporter">Exporter</option>
            </select>
          </div>
        </div>

        {/* Loading Skeleton */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div className="skeleton" style={{ height: '140px', borderRadius: '12px' }}></div>
            <div className="skeleton" style={{ height: '140px', borderRadius: '12px' }}></div>
          </div>
        ) : filteredCompanies.length === 0 ? (
          <EmptyState
            title="No companies found"
            description="Try a different query like 'pepper exporters in Vietnam', or run the lead scraper to discover new companies."
            actionLabel="Run lead scraper"
            onAction={() => window.location.href = '/dashboard/agents'}
          />
        ) : (
          /* Company Card Grid */
          <div className={styles.resultsGrid}>
            {filteredCompanies.map((c) => (
              <div key={c.id} className={styles.resultCard}>
                <div className={styles.cardHeader}>
                  <div className={styles.companyTitleWrap}>
                    <h3 className={styles.companyName}>{c.name}</h3>
                    <div className={styles.companyGeo}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      <span>
                        {c.hq_city}, {c.hq_country}
                      </span>
                    </div>
                  </div>
                  <div className={styles.scoreBadge}>
                    {Math.round(c.confidence_score * 100)}% match
                  </div>
                </div>

                <div className={styles.cardBody}>
                  <div className={styles.productsWrap}>
                    <span className={`badge ${c.type === 'Importer' ? 'badge-lime' : 'badge-blue'}`}>
                      {c.type}
                    </span>
                    {(c.products_dealt || []).map((p) => (
                      <span key={p} className="badge badge-yellow">
                        {p}
                      </span>
                    ))}
                  </div>

                  <div className={styles.shipmentsSummary}>
                    <div className={styles.shipmentValue}>
                      {c.description || 'No dossier details yet — enrich to populate.'}
                    </div>
                  </div>
                </div>

                <div className={styles.cardActions}>
                  <button
                    type="button"
                    className={`${styles.favoriteBtn} ${c.is_favorited ? styles.favoriteActive : ''}`}
                    onClick={() => handleFavoriteToggle(c.id, c.is_favorited)}
                    aria-label={c.is_favorited ? 'Unstar lead' : 'Star lead'}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill={c.is_favorited ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
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
                        Enrich company
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

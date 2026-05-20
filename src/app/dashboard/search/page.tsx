'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/Toast';
import EmptyState from '@/components/EmptyState';
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

export default function SearchWorkspace() {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [filterCountry, setFilterCountry] = useState('All');
  const [filterType, setFilterType] = useState('All');
  const [loading, setLoading] = useState(false);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);

  // Fetch initial (unfiltered) list from search API
  const performSearch = async (searchQuery: string = '') => {
    setLoading(true);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await response.json();
      if (data.success) {
        setCompanies(data.results || []);
      }
    } catch (err) {
      console.error('Error querying search API:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    performSearch();
  }, []);

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
        toast(`${data.company.name} enriched with AI intelligence`, 'success');
      } else {
        toast(data.error || 'Enrichment failed', 'error');
      }
    } catch (err) {
      console.error('Enrichment error:', err);
      toast('Failed to enrich company. Check your API keys.', 'error');
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
        <h1 className={styles.searchTitle}>AI Search Workspace</h1>
        <span className={styles.searchSubtitle}>
          Query global buyer directories and import databases using natural language powered by Gemini.
        </span>
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
            placeholder="Describe who you want to find (e.g. 'Pepper buyers in Jebel Ali UAE')"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className={styles.searchBtn} disabled={loading}>
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>

        {/* Suggestions */}
        <div className={styles.suggestionsRow}>
          <span className={styles.suggestionLabel}>Try:</span>
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
            Found {filteredCompanies.length} matching entities
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
            >
              <option value="All">All Countries</option>
              {uniqueCountries.map(country => (
                <option key={country} value={country}>{country}</option>
              ))}
            </select>

            <select
              className={styles.filterSelect}
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="All">All Types</option>
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
            title="No Companies Found"
            description="Try a different search query like 'Pepper exporters in Vietnam' or run the Lead Scraper Agent to discover new companies."
            actionLabel="Run Lead Scraper"
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
                    {Math.round(c.confidence_score * 100)}% Match
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
                      {c.description || 'No detailed dossier information compiled.'}
                    </div>
                  </div>
                </div>

                <div className={styles.cardActions}>
                  <button
                    type="button"
                    className={`${styles.favoriteBtn} ${c.is_favorited ? styles.favoriteActive : ''}`}
                    onClick={() => handleFavoriteToggle(c.id, c.is_favorited)}
                    aria-label="Star lead"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill={c.is_favorited ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  </button>

                  <div className={styles.actionRow}>
                    {c.is_enriched ? (
                      <Link href={`/dashboard/companies/${c.id}`} className="btn-secondary">
                        View Dossier
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={enrichingId === c.id}
                        onClick={() => handleEnrich(c.id)}
                      >
                        {enrichingId === c.id ? 'Enriching...' : 'Enrich Company'}
                      </button>
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

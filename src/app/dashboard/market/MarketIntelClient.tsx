'use client';

import React, { useState, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import { BarChart3, Loader2, Search, TrendingUp, Globe, DollarSign, Package } from 'lucide-react';
import { useToast } from '@/components/Toast';
import styles from './MarketIntelClient.module.css';

const COLORS = ['#CCFF00', '#00D47E', '#3B82F6', '#F59E0B', '#8B5CF6', '#EF4444', '#00b0ff', '#ff9800'];

interface DestinationStat {
  country: string;
  shipments: number;
  totalValueUsd: number;
  avgPricePerUnitUsd: number | null;
}
interface HsStat {
  code: string;
  description: string;
  shipments: number;
  totalValueUsd: number;
}
interface SampleShipment {
  date?: string;
  product?: string;
  country?: string;
  hsCode?: string;
  quantity?: number;
  unit?: string;
  totalValueUsd?: number;
  pricePerUnitUsd?: number;
  port?: string;
}
interface MarketSummary {
  totalTradeValueUsd?: string;
  averagePriceUsd?: string;
  totalCountries?: number;
  topCountry?: string;
  topCountryShare?: string;
  peakMonth?: string;
  totalRecords?: number;
}
interface MarketResult {
  product: string;
  tradeType: 'import' | 'export';
  cached: boolean;
  totalRecords: number;
  summary: MarketSummary | null;
  topDestinations: DestinationStat[];
  hsBreakdown: HsStat[];
  sampleShipments: SampleShipment[];
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

export default function MarketIntelClient({ orgCommodities }: { orgCommodities: string[] }) {
  const { toast } = useToast();
  const [product, setProduct] = useState('');
  const [tradeType, setTradeType] = useState<'import' | 'export'>('export');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MarketResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (p: string, tt: 'import' | 'export') => {
      const term = p.trim();
      if (!term || loading) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/market-intel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product: term, tradeType: tt }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Market lookup failed');
        setResult(json as MarketResult);
        if ((json.totalRecords ?? 0) === 0) {
          toast(`No customs records found for "${term}".`, 'info');
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Market lookup failed';
        setError(msg);
        toast(msg, 'error');
      } finally {
        setLoading(false);
      }
    },
    [loading, toast],
  );

  const maxShip = result ? Math.max(1, ...result.topDestinations.map((d) => d.shipments)) : 1;

  return (
    <div className={styles.wrap}>
      <section className={styles.controls}>
        <div className={styles.tradeToggle}>
          <button
            type="button"
            className={`${styles.toggleBtn} ${tradeType === 'export' ? styles.toggleActive : ''}`}
            onClick={() => setTradeType('export')}
          >
            Export demand
          </button>
          <button
            type="button"
            className={`${styles.toggleBtn} ${tradeType === 'import' ? styles.toggleActive : ''}`}
            onClick={() => setTradeType('import')}
          >
            Import sourcing
          </button>
        </div>
        <form
          className={styles.searchRow}
          onSubmit={(e) => {
            e.preventDefault();
            run(product, tradeType);
          }}
        >
          <input
            type="text"
            className={`input ${styles.input}`}
            placeholder="Product, e.g. black pepper, basmati rice, sesame seeds"
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            disabled={loading}
            aria-label="Product"
          />
          <button type="submit" className={`btn-primary ${styles.runBtn}`} disabled={loading || !product.trim()}>
            {loading ? (
              <>
                <Loader2 size={14} className={styles.spin} /> Analyzing…
              </>
            ) : (
              <>
                <Search size={14} strokeWidth={2} /> Analyze market
              </>
            )}
          </button>
        </form>
        {orgCommodities.length > 0 && (
          <div className={styles.chipRow}>
            {orgCommodities.map((c) => (
              <button
                key={c}
                type="button"
                className={styles.chip}
                onClick={() => {
                  setProduct(c);
                  run(c, tradeType);
                }}
                disabled={loading}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </section>

      {loading && (
        <p className={styles.progress}>
          <Loader2 size={14} className={styles.spin} />
          Scanning customs records — this can take up to a minute.
        </p>
      )}

      {error && <div className={styles.errorBanner}>{error}</div>}

      {!loading && result && result.totalRecords > 0 && (
        <div className={styles.results}>
          <div className={styles.statGrid}>
            <div className={styles.statCard}>
              <DollarSign size={18} className={styles.statIcon} />
              <span className={styles.statVal}>{result.summary?.totalTradeValueUsd ?? '—'}</span>
              <span className={styles.statLabel}>Total market value</span>
            </div>
            <div className={styles.statCard}>
              <TrendingUp size={18} className={styles.statIcon} />
              <span className={styles.statVal}>{result.summary?.averagePriceUsd ?? '—'}</span>
              <span className={styles.statLabel}>Avg price / unit</span>
            </div>
            <div className={styles.statCard}>
              <Globe size={18} className={styles.statIcon} />
              <span className={styles.statVal}>{result.summary?.totalCountries ?? result.topDestinations.length}</span>
              <span className={styles.statLabel}>Trading countries</span>
            </div>
            <div className={styles.statCard}>
              <Package size={18} className={styles.statIcon} />
              <span className={styles.statVal}>{result.summary?.topCountry ?? result.topDestinations[0]?.country ?? '—'}</span>
              <span className={styles.statLabel}>
                Top {tradeType === 'export' ? 'destination' : 'source'}
                {result.summary?.topCountryShare ? ` · ${result.summary.topCountryShare}` : ''}
              </span>
            </div>
          </div>

          <section className={styles.panel}>
            <h2 className={styles.panelTitle}>
              <BarChart3 size={16} strokeWidth={1.8} />
              {tradeType === 'export' ? 'Demand by destination' : 'Sourcing by origin'} (shipments)
            </h2>
            <div className={styles.chartBox}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={result.topDestinations}
                  margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                  barCategoryGap="28%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="country"
                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={110}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-primary)',
                      borderRadius: 10,
                      fontSize: 12,
                      color: 'var(--text-primary)',
                    }}
                    formatter={(value, _n, entry) => {
                      const d = entry.payload as DestinationStat | undefined;
                      return [
                        `${value} shipments · ${fmtUsd(d?.totalValueUsd ?? 0)}${d?.avgPricePerUnitUsd ? ` · $${d.avgPricePerUnitUsd}/unit` : ''}`,
                        'Trade',
                      ];
                    }}
                    labelStyle={{ color: 'var(--text-secondary)', marginBottom: 4 }}
                  />
                  <Bar dataKey="shipments" radius={[0, 6, 6, 0]}>
                    {result.topDestinations.map((_e, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className={styles.chartNote}>
              Bar width ∝ shipment count (max {maxShip}). Hover for value & price.
            </p>
          </section>

          {result.hsBreakdown.length > 0 && (
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>HS-code breakdown</h2>
              <div className={styles.hsList}>
                {result.hsBreakdown.map((h) => (
                  <div key={h.code} className={styles.hsRow}>
                    <span className={styles.hsCode}>{h.code}</span>
                    <span className={styles.hsDesc}>{h.description || '—'}</span>
                    <span className={styles.hsShip}>{h.shipments} shp</span>
                    <span className={styles.hsVal}>{fmtUsd(h.totalValueUsd)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {result.sampleShipments.length > 0 && (
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Recent shipment lines</h2>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Product</th>
                      <th>{tradeType === 'export' ? 'Destination' : 'Origin'}</th>
                      <th>Qty</th>
                      <th>Value</th>
                      <th>$/unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.sampleShipments.map((s, i) => (
                      <tr key={i}>
                        <td>{s.date ?? '—'}</td>
                        <td className={styles.prodCell}>{s.product ?? '—'}</td>
                        <td>{s.country ?? '—'}</td>
                        <td>{s.quantity ? `${s.quantity} ${s.unit ?? ''}` : '—'}</td>
                        <td>{s.totalValueUsd ? fmtUsd(s.totalValueUsd) : '—'}</td>
                        <td>{s.pricePerUnitUsd ? `$${s.pricePerUnitUsd}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <p className={styles.sourceNote}>
            Source: anonymized customs trade records ({result.cached ? 'cached' : 'fresh'}). Party
            names are masked in this dataset — use Buyer Match to find named buyers.
          </p>
        </div>
      )}

      {!loading && !result && (
        <div className={styles.empty}>
          <BarChart3 size={40} strokeWidth={1} className={styles.emptyIcon} />
          <p className={styles.emptyTitle}>Analyze any product&apos;s market</p>
          <p className={styles.emptyBody}>
            Enter a product above to see its total market value, top destinations, price benchmarks,
            and HS breakdown from real customs records.
          </p>
        </div>
      )}
    </div>
  );
}

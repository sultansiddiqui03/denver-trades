'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  BarChart3,
  Globe2,
  Package,
  TrendingUp,
  DollarSign,
  Users,
  Anchor,
  Activity,
} from 'lucide-react';
import styles from './page.module.css';
import type { StagePoint } from '@/components/charts/DealsBarChart';
import type { CountryPoint } from '@/components/charts/CountriesPieChart';
import type { AnalyticsData } from '@/lib/dashboard/analyticsData';
import type { MarketData } from '@/app/api/analytics/market/route';

// Lazy-load recharts: ~140KB of bundle weight only ships when this page renders.
const DealsBarChart = dynamic(() => import('@/components/charts/DealsBarChart'), {
  ssr: false,
  loading: () => (
    <div className="skeleton" style={{ height: '100%', borderRadius: '12px' }} />
  ),
});

const CountriesPieChart = dynamic(() => import('@/components/charts/CountriesPieChart'), {
  ssr: false,
  loading: () => (
    <div className="skeleton" style={{ height: '100%', borderRadius: '12px' }} />
  ),
});

// Trade Intelligence recharts charts — lazy to match the existing pattern
const VolumeAreaChart = dynamic(() => import('./charts/VolumeAreaChart'), {
  ssr: false,
  loading: () => (
    <div className="skeleton" style={{ height: '100%', borderRadius: '12px' }} />
  ),
});

const OriginBarChart = dynamic(() => import('./charts/OriginBarChart'), {
  ssr: false,
  loading: () => (
    <div className="skeleton" style={{ height: '100%', borderRadius: '12px' }} />
  ),
});

const PriceLineChart = dynamic(() => import('./charts/PriceLineChart'), {
  ssr: false,
  loading: () => (
    <div className="skeleton" style={{ height: '100%', borderRadius: '12px' }} />
  ),
});

const STAGE_COLORS: Record<string, string> = {
  Discovery: '#CCFF00',
  Outreach: '#00D47E',
  Negotiation: '#3B82F6',
  Audit: '#F59E0B',
  Closed: '#8B5CF6',
};

const COUNTRY_COLORS = ['#CCFF00', '#00ff64', '#00b0ff', '#ff9800', '#8B5CF6', '#EF4444'];

interface Props {
  initial: AnalyticsData;
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function fmtVol(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n.toFixed(1)}`;
}

// ─── Headline stat card ───────────────────────────────────────────────────────
function HlCard({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ElementType;
}) {
  return (
    <div className={`card ${styles.hlCard}`}>
      <span className={styles.hlLabel}>
        <Icon size={11} strokeWidth={2} style={{ marginRight: 4, verticalAlign: 'middle' }} />
        {label}
      </span>
      <span className={`mono ${styles.hlValue}`}>{value}</span>
      <span className={styles.hlSub}>{sub}</span>
    </div>
  );
}

// ─── Growing importer row ─────────────────────────────────────────────────────
function ImporterRow({
  name,
  growthPct,
  recentVolumeMt,
  maxVol,
}: {
  name: string;
  growthPct: number;
  recentVolumeMt: number;
  maxVol: number;
}) {
  const barWidth = maxVol > 0 ? Math.min(100, (recentVolumeMt / maxVol) * 100) : 0;
  const positive = growthPct >= 0;
  return (
    <div className={styles.importerRow}>
      <div className={styles.importerMeta}>
        <span className={styles.importerName}>{name}</span>
        <div className={styles.importerStats}>
          <span className={styles.importerVol}>{fmtVol(recentVolumeMt)} MT</span>
          <span className={`${styles.growthBadge} ${positive ? styles.growthPos : styles.growthNeg}`}>
            {positive ? '+' : ''}{growthPct}%
          </span>
        </div>
      </div>
      <div className={styles.growthBar}>
        <div className={styles.growthBarFill} style={{ width: `${barWidth}%` }} />
      </div>
    </div>
  );
}

// ─── Trade Intelligence section ───────────────────────────────────────────────
function TradeIntelligence() {
  const [market, setMarket] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/analytics/market')
      .then((r) => r.json())
      .then((j) => {
        if (j.success) setMarket(j.data as MarketData);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className={styles.tradeSkeleton}>
        <div className={styles.headlineGrid}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton" style={{ height: 88, borderRadius: 16 }} />
          ))}
        </div>
        <div className={styles.tradeChartGrid}>
          <div className="skeleton" style={{ height: 280, borderRadius: 16 }} />
          <div className="skeleton" style={{ height: 280, borderRadius: 16 }} />
        </div>
        <div className={styles.bottomGrid}>
          <div className="skeleton" style={{ height: 260, borderRadius: 16 }} />
          <div className="skeleton" style={{ height: 260, borderRadius: 16 }} />
        </div>
      </div>
    );
  }

  if (!market) {
    return (
      <div className={`card ${styles.tradeChartEmpty}`} style={{ minHeight: 180 }}>
        <Activity size={28} strokeWidth={1.2} aria-hidden />
        <span>Could not load trade data</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          Check that shipments are imported and try refreshing
        </span>
      </div>
    );
  }

  const hl = market.headline;
  const maxVol =
    market.topGrowingImporters.length > 0
      ? Math.max(...market.topGrowingImporters.map((r) => r.recentVolumeMt))
      : 1;

  return (
    <div className={styles.tradeSection}>
      {/* Headline stats */}
      <div className={styles.headlineGrid}>
        <HlCard
          label="Total shipments"
          value={String(hl.totalShipments)}
          sub="across all records"
          icon={Package}
        />
        <HlCard
          label="Total trade value"
          value={fmtUsd(hl.totalValueUsd)}
          sub="sum of declared value"
          icon={DollarSign}
        />
        <HlCard
          label="Distinct buyers"
          value={String(hl.distinctBuyers)}
          sub="unique companies"
          icon={Users}
        />
        <HlCard
          label="Distinct suppliers"
          value={String(hl.distinctSuppliers)}
          sub="unique counterparties"
          icon={Anchor}
        />
      </div>

      {/* Monthly volume + Origin share */}
      <div className={styles.tradeChartGrid}>
        <div className={`card ${styles.chartCard}`}>
          <h3 className={styles.chartTitle}>Monthly shipment volume (MT)</h3>
          {market.monthlyVolume.length === 0 ? (
            <div className={styles.tradeChartEmpty}>
              <TrendingUp size={28} strokeWidth={1.2} aria-hidden />
              <span>No shipment history yet</span>
            </div>
          ) : (
            <div className={styles.tradeChartCanvas}>
              <VolumeAreaChart data={market.monthlyVolume} />
            </div>
          )}
        </div>

        <div className={`card ${styles.chartCard}`}>
          <h3 className={styles.chartTitle}>Top origin countries</h3>
          {market.originShare.length === 0 ? (
            <div className={styles.tradeChartEmpty}>
              <Globe2 size={28} strokeWidth={1.2} aria-hidden />
              <span>No origin data yet</span>
            </div>
          ) : (
            <div className={styles.tradeChartCanvas}>
              <OriginBarChart data={market.originShare} />
            </div>
          )}
        </div>
      </div>

      {/* Growing importers + Price trends */}
      <div className={styles.bottomGrid}>
        <div className={`card ${styles.chartCard}`}>
          <h3 className={styles.chartTitle}>Top growing importers</h3>
          {market.topGrowingImporters.length === 0 ? (
            <div className={styles.tradeChartEmpty}>
              <Users size={28} strokeWidth={1.2} aria-hidden />
              <span>Not enough history to compare</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Needs at least 2 periods of shipment data
              </span>
            </div>
          ) : (
            <div className={styles.importerList}>
              {market.topGrowingImporters.map((imp) => (
                <ImporterRow key={imp.id} {...imp} maxVol={maxVol} />
              ))}
            </div>
          )}
        </div>

        <div className={`card ${styles.chartCard}`}>
          <h3 className={styles.chartTitle}>Commodity price trends</h3>
          {market.priceTrends.length === 0 ||
          market.priceTrends.every((p) => p.series.length === 0) ? (
            <div className={styles.tradeChartEmpty}>
              <Activity size={28} strokeWidth={1.2} aria-hidden />
              <span>No price data yet</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Prices are ingested daily by the cron job
              </span>
            </div>
          ) : (
            <div className={styles.tradeChartCanvas}>
              <PriceLineChart data={market.priceTrends} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function AnalyticsClient({ initial }: Props) {
  const data = initial;

  const enrichRate =
    data.totalCompanies > 0
      ? Math.round((data.enrichedCompanies / data.totalCompanies) * 100)
      : 0;

  const pipelineFormatted =
    data.totalPipelineValue >= 1_000_000
      ? `$${(data.totalPipelineValue / 1_000_000).toFixed(2)}M`
      : data.totalPipelineValue >= 1_000
        ? `$${(data.totalPipelineValue / 1_000).toFixed(0)}K`
        : `$${data.totalPipelineValue}`;

  const stageChartData: StagePoint[] = data.dealsByStage.map((d) => ({
    name: d.stage,
    count: d.count,
    color: STAGE_COLORS[d.stage] || '#666',
  }));

  const countryChartData: CountryPoint[] = data.companiesByCountry.map((d, i) => ({
    name: d.country || 'Unknown',
    value: d.count,
    color: COUNTRY_COLORS[i % COUNTRY_COLORS.length],
  }));

  return (
    <>
      {/* ── Original CRM metrics ── */}
      <div className="grid-3">
        <div className={`card ${styles.statCard}`}>
          <span className={styles.statLabel}>Total pipeline value</span>
          <span className={`mono ${styles.statValue}`}>{pipelineFormatted}</span>
          <span className="badge badge-green">Live from database</span>
        </div>

        <div className={`card ${styles.statCard}`}>
          <span className={styles.statLabel}>Agent success rate</span>
          <span className={`mono ${styles.statValue}`}>
            {data.agentSuccessRate.rate}%
          </span>
          <span className="badge badge-blue">
            {data.agentSuccessRate.successful} / {data.agentSuccessRate.total} runs
          </span>
        </div>

        <div className={`card ${styles.statCard}`}>
          <span className={styles.statLabel}>Lead enrichment rate</span>
          <span className={`mono ${styles.statValue}`}>{enrichRate}%</span>
          <span className="badge badge-lime">
            {data.enrichedCompanies} / {data.totalCompanies} companies
          </span>
        </div>
      </div>

      <div className={styles.chartGrid}>
        <div className={`card ${styles.chartCard}`}>
          <h3 className={styles.chartTitle}>Deals by pipeline stage</h3>
          {stageChartData.length === 0 ? (
            <div className={styles.chartEmpty}>
              <BarChart3 size={28} strokeWidth={1.2} aria-hidden />
              <span>No deals in pipeline yet</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Move leads through the pipeline to populate this chart
              </span>
            </div>
          ) : (
            <div className={styles.chartCanvas}>
              <DealsBarChart data={stageChartData} />
            </div>
          )}
        </div>

        <div className={`card ${styles.chartCard}`}>
          <h3 className={styles.chartTitle}>Companies by country</h3>
          {countryChartData.length === 0 ? (
            <div className={styles.chartEmpty}>
              <Globe2 size={28} strokeWidth={1.2} aria-hidden />
              <span>No company data yet</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Run a Lead Scraper agent to start populating companies
              </span>
            </div>
          ) : (
            <div className={styles.chartCanvas}>
              <CountriesPieChart data={countryChartData} />
            </div>
          )}
        </div>
      </div>

      {/* ── Trade Intelligence section ── */}
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Trade Intelligence</h2>
        <p className={styles.sectionSubtitle}>
          Customs shipment volume, supplier origins, buyer growth, and live commodity prices.
        </p>
      </div>

      <TradeIntelligence />
    </>
  );
}

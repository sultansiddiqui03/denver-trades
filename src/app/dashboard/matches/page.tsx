import React from 'react';
import { redirect } from 'next/navigation';
import { Target } from 'lucide-react';
import { getUserContext } from '@/lib/auth/server';
import { scoreBuyerFit, buyerFitTier } from '@/lib/scoring/buyerFit';
import type { BuyerFitCompany } from '@/lib/scoring/buyerFit';
import MatchExplorer from './MatchExplorer';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

interface ExtractedDemand {
  product?: string;
  quantity?: string;
  raw_intent?: string;
}

export default async function MatchesPage() {
  const context = await getUserContext();
  if (!context) redirect('/');

  const { orgId, supabase } = context;

  const [orgResult, companiesResult, demandResult] = await Promise.all([
    supabase
      .from('organizations')
      .select('commodities, target_markets')
      .eq('id', orgId)
      .single(),
    supabase
      .from('companies')
      .select(
        'id, name, type, hq_country, hq_city, products_dealt, origin_countries, destination_countries, total_shipments, last_shipment_date, hs_codes'
      )
      .eq('org_id', orgId)
      .or('total_shipments.not.is.null,buyer_fit_score.not.is.null')
      .limit(500),
    supabase
      .from('outreach_threads')
      .select('id, extracted_demand')
      .eq('org_id', orgId)
      .not('extracted_demand', 'is', null)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const org = orgResult.data;
  const orgCommodities: string[] = (org?.commodities ?? []).filter(Boolean);
  const orgMarkets: string[] = (org?.target_markets ?? []).filter(Boolean);
  const defaultCommodity = orgCommodities[0] ?? null;

  const demandItems = (demandResult.data ?? [])
    .reduce<Array<{ id: string; product: string; quantity?: string; raw_intent?: string }>>(
      (acc, row) => {
        const d = row.extracted_demand as ExtractedDemand | null;
        if (!d?.product) return acc;
        acc.push({
          id: row.id,
          product: d.product,
          quantity: d.quantity,
          raw_intent: d.raw_intent,
        });
        return acc;
      },
      [],
    );

  const companies = companiesResult.data ?? [];

  const scoreOrg = {
    commodities: defaultCommodity ? [defaultCommodity] : orgCommodities,
    target_markets: orgMarkets,
  };

  const initialResults = companies
    .map((c) => {
      const company: BuyerFitCompany = {
        type: c.type,
        products_dealt: c.products_dealt,
        origin_countries: c.origin_countries,
        destination_countries: c.destination_countries,
        hq_country: c.hq_country,
        total_shipments: c.total_shipments,
        last_shipment_date: c.last_shipment_date,
        hs_codes: c.hs_codes,
      };
      const { score, reasons } = scoreBuyerFit(company, scoreOrg);
      return {
        id: c.id,
        name: c.name,
        type: c.type,
        hq_country: c.hq_country,
        hq_city: c.hq_city,
        total_shipments: c.total_shipments,
        last_shipment_date: c.last_shipment_date,
        hs_codes: c.hs_codes,
        products_dealt: c.products_dealt,
        score,
        tier: buyerFitTier(score),
        reasons,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  return (
    <div className={`${styles.container} fade-in`}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <div className={styles.iconWrap}>
            <Target size={22} strokeWidth={1.8} />
          </div>
          <div>
            <h1 className={styles.title}>Buyer Match</h1>
            <p className={styles.subtitle}>
              Ranked leaderboard of best-fit buyers, scored by commodity match, shipment volume,
              recency, and market alignment.
            </p>
          </div>
        </div>
      </div>

      <MatchExplorer
        orgCommodities={orgCommodities}
        demandItems={demandItems}
        initialCommodity={defaultCommodity}
        initialResults={initialResults}
      />
    </div>
  );
}

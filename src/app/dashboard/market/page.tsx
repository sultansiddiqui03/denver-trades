import React from 'react';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/auth/server';
import MarketIntelClient from './MarketIntelClient';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function MarketPage() {
  const context = await getUserContext();
  if (!context) redirect('/');

  const { orgId, supabase } = context;
  const { data: org } = await supabase
    .from('organizations')
    .select('commodities')
    .eq('id', orgId)
    .single();
  const orgCommodities: string[] = (org?.commodities ?? []).filter(Boolean);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>Market Intelligence</h1>
        <p className={styles.subtitle}>
          Price benchmarks and demand-by-destination from customs trade records. Pick a product to
          see what its market is worth, where the demand is, and the going price.
        </p>
      </header>
      <MarketIntelClient orgCommodities={orgCommodities} />
    </div>
  );
}

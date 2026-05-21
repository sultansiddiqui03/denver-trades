import React from 'react';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/auth/server';
import PipelineBoard, { type PipelineDeal } from '@/components/PipelineBoard';
import { normalizeStage } from '@/lib/pipeline/stages';
import { type CompanyType } from '@/lib/intent';

export const dynamic = 'force-dynamic';

interface DealRow {
  id: string;
  title: string;
  deal_code: string | null;
  stage: string | null;
  value_usd: number | string | null;
  product: string | null;
  tags: string[] | null;
  updated_at: string | null;
  created_at: string | null;
  companies:
    | { id: string; name: string; type: string | null }
    | { id: string; name: string; type: string | null }[]
    | null;
}

function coerceCompanyType(value: string | null): CompanyType | null {
  if (value === 'Importer' || value === 'Exporter' || value === 'Broker') {
    return value;
  }
  return null;
}

function dealValueToNumber(value: number | string | null): number | null {
  if (value === null) return null;
  const n = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(n) ? n : null;
}

/**
 * Build the products array for a card. We prefer the deal's own `tags`
 * (curated by whoever logged the deal) and fall back to the single `product`
 * column when tags are empty. Anything blank gets dropped so we don't render
 * empty chips.
 */
function buildProducts(row: DealRow): string[] {
  const fromTags = (row.tags ?? []).filter((t) => typeof t === 'string' && t.trim().length > 0);
  if (fromTags.length > 0) return fromTags;
  if (row.product && row.product.trim().length > 0) return [row.product.trim()];
  return [];
}

export default async function PipelinePage() {
  const context = await getUserContext();
  if (!context) redirect('/');

  const { orgId, supabase } = context;

  // Embedded company select gives us the BUYS / SELLS / BROKER chip without
  // a second round-trip. `companies(...)` is a single FK relation so the
  // result lands as an object (or array in some Postgrest versions).
  const { data, error } = await supabase
    .from('deals_pipeline')
    .select(
      `
        id,
        title,
        deal_code,
        stage,
        value_usd,
        product,
        tags,
        updated_at,
        created_at,
        companies (
          id,
          name,
          type
        )
      `
    )
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Pipeline fetch failed', error);
  }

  const rows = (data ?? []) as unknown as DealRow[];
  const initialDeals: PipelineDeal[] = rows.map((row) => {
    const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
    return {
      id: row.id,
      dealCode: row.deal_code,
      title: row.title,
      stage: normalizeStage(row.stage),
      valueUsd: dealValueToNumber(row.value_usd),
      products: buildProducts(row),
      updatedAt: row.updated_at ?? row.created_at,
      company: company
        ? {
            id: company.id,
            name: company.name,
            type: coerceCompanyType(company.type),
          }
        : null,
    };
  });

  return <PipelineBoard initialDeals={initialDeals} />;
}

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '@/lib/supabase/database.types';
import { generateEmbedding } from './openai';

type CompanyRow = Tables<'companies'>;

/**
 * Fields we feed into the embedding model. Keep this list intentionally small —
 * the goal is a stable, semantically rich blurb, not a kitchen-sink dump.
 */
export type CompanyEmbeddingInput = Pick<
  CompanyRow,
  'name' | 'description' | 'products_dealt' | 'hq_country' | 'type'
>;

const MAX_EMBEDDING_CHARS = 2000;

/**
 * Build a single, dedupe-whitespace, length-capped string suitable for
 * feeding into an embedding model. Order: type, name, country, products,
 * description — most discriminative fields first so they survive truncation.
 */
export function buildCompanyEmbeddingText(company: CompanyEmbeddingInput): string {
  const products = (company.products_dealt ?? []).filter(Boolean).join(', ');
  const parts: string[] = [];

  if (company.type) parts.push(`Type: ${company.type}`);
  if (company.name) parts.push(`Name: ${company.name}`);
  if (company.hq_country) parts.push(`HQ Country: ${company.hq_country}`);
  if (products) parts.push(`Products: ${products}`);
  if (company.description) parts.push(`Description: ${company.description}`);

  // Collapse all whitespace runs (including newlines) into single spaces.
  const collapsed = parts.join('. ').replace(/\s+/g, ' ').trim();

  return collapsed.length > MAX_EMBEDDING_CHARS
    ? collapsed.slice(0, MAX_EMBEDDING_CHARS)
    : collapsed;
}

/**
 * Stringify a numeric vector into pgvector's bracketed text form
 * (e.g. `[0.1,0.2,...]`). Supabase JS sends this as text and Postgres
 * coerces it to `vector` — we don't need the `pgvector` npm package.
 */
function toPgVectorLiteral(values: number[]): string {
  // No spaces — keeps the payload minimal (1536 dims).
  return `[${values.join(',')}]`;
}

/**
 * Fetch a company by id, compute its embedding via OpenAI, and persist the
 * result back to `companies.embedding`. Throws if anything fails — the
 * caller decides how to surface that (e.g. enrich route logs + returns
 * `embedding_failed: true` so a missing OPENAI key doesn't poison enrichment).
 */
export async function computeAndStoreCompanyEmbedding(
  supabase: SupabaseClient<Database>,
  companyId: string
): Promise<void> {
  const { data: company, error: fetchError } = await supabase
    .from('companies')
    .select('name, description, products_dealt, hq_country, type')
    .eq('id', companyId)
    .single();

  if (fetchError) {
    throw new Error(`Failed to fetch company ${companyId} for embedding: ${fetchError.message}`);
  }
  if (!company) {
    throw new Error(`Company ${companyId} not found for embedding`);
  }

  const text = buildCompanyEmbeddingText(company);
  if (!text) {
    // Nothing to embed (record has no useful fields yet); skip silently.
    return;
  }

  const vector = await generateEmbedding(text);
  const embeddingLiteral = toPgVectorLiteral(vector);

  const { error: updateError } = await supabase
    .from('companies')
    .update({ embedding: embeddingLiteral })
    .eq('id', companyId);

  if (updateError) {
    throw new Error(`Failed to store embedding for company ${companyId}: ${updateError.message}`);
  }
}

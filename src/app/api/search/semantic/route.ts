import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateEmbedding } from '@/lib/ai/openai';
import { requireUserContext } from '@/lib/auth/server';
import { getErrorMessage } from '@/lib/errors';
import { parseBody } from '@/lib/validation';
import { rateLimitOrThrow } from '@/lib/security/rateLimit';

const SemanticSearchSchema = z.object({
  query: z.string().min(2, 'query must be at least 2 characters'),
  limit: z.number().int().min(1).max(50).default(10),
});

export async function POST(request: Request) {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;

    const { orgId, supabase } = context;

    const limited = rateLimitOrThrow({
      key: `${orgId}:search.semantic`,
      max: 60,
      windowSec: 60,
    });
    if (limited) return limited;

    const parsed = await parseBody(request, SemanticSearchSchema);
    if (!parsed.ok) return parsed.response;
    const { query, limit } = parsed.data;

    // 1. Embed the user's natural-language query.
    const queryEmbedding = await generateEmbedding(query);

    // 2. pgvector RPC: cosine-sorted, scoped to this org, embedding NOT NULL.
    //    The vector arg is passed as the bracketed string literal Supabase
    //    accepts (we deliberately don't depend on the `pgvector` npm package).
    const embeddingLiteral = `[${queryEmbedding.join(',')}]`;

    const { data, error } = await supabase.rpc('match_companies_by_embedding', {
      query_embedding: embeddingLiteral,
      match_org_id: orgId,
      match_count: limit,
    });

    if (error) throw error;

    // The RPC returns a slim row (id, name, type, hq_country, description,
    // products_dealt, similarity). Re-hydrate hq_city + is_favorited +
    // is_enriched so the client can render the same Company card as keyword
    // search, with similarity surfaced as `confidence_score` for display.
    const matches = data ?? [];
    if (matches.length === 0) {
      return NextResponse.json({ success: true, query, results: [] });
    }

    const ids = matches.map((m) => m.id);
    const { data: extra } = await supabase
      .from('companies')
      .select('id, hq_city, is_favorited, is_enriched')
      .in('id', ids);

    const lookup = new Map((extra ?? []).map((c) => [c.id, c]));
    const results = matches.map((m) => {
      const extra = lookup.get(m.id);
      return {
        id: m.id,
        name: m.name,
        type: m.type,
        hq_country: m.hq_country,
        hq_city: extra?.hq_city ?? '',
        description: m.description ?? '',
        products_dealt: m.products_dealt ?? [],
        is_favorited: extra?.is_favorited ?? false,
        is_enriched: extra?.is_enriched ?? false,
        // Surface cosine similarity as the confidence score so the UI's
        // existing match-percentage badge "just works".
        confidence_score: m.similarity ?? 0,
      };
    });

    return NextResponse.json({ success: true, query, results });
  } catch (error: unknown) {
    console.error('Semantic Search API error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

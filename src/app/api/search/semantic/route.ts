import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateEmbedding } from '@/lib/ai/openai';
import { requireUserContext } from '@/lib/auth/server';
import { getErrorMessage } from '@/lib/errors';
import { parseBody } from '@/lib/validation';

const SemanticSearchSchema = z.object({
  query: z.string().min(2, 'query must be at least 2 characters'),
  limit: z.number().int().min(1).max(50).default(10),
});

export async function POST(request: Request) {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;

    const { orgId, supabase } = context;

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

    return NextResponse.json({
      success: true,
      query,
      results: data ?? [],
    });
  } catch (error: unknown) {
    console.error('Semantic Search API error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

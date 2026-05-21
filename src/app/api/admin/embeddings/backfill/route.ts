import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServiceClient } from '@/lib/supabase/admin';
import { getErrorMessage } from '@/lib/errors';
import { isAutomationAuthorized } from '@/lib/security/request';
import { parseBody } from '@/lib/validation';
import { computeAndStoreCompanyEmbedding } from '@/lib/ai/embedCompany';

/**
 * Admin escape hatch: compute pgvector embeddings for companies that are
 * missing them. Useful after a partial enrichment run (e.g. OPENAI_API_KEY was
 * absent at scrape time) or when seed data needs to be made searchable via
 * /api/search/semantic.
 *
 * Auth: Bearer ${CRON_SECRET}.
 *
 *   curl -X POST https://denver-trades.vercel.app/api/admin/embeddings/backfill \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"limit": 100}'    # body optional; default limit = 50
 */
const BackfillSchema = z.object({
  limit: z.number().int().positive().max(500).optional(),
});

const DEFAULT_LIMIT = 50;

interface BackfillError {
  id: string;
  message: string;
}

export async function POST(request: Request) {
  try {
    if (!isAutomationAuthorized(request)) {
      return NextResponse.json(
        { success: false, error: 'Admin authorization failed' },
        { status: 401 }
      );
    }

    // Body is optional — accept an empty/no-body request as "use defaults".
    let limit = DEFAULT_LIMIT;
    const contentLength = request.headers.get('content-length');
    if (contentLength && Number(contentLength) > 0) {
      const parsed = await parseBody(request, BackfillSchema);
      if (!parsed.ok) return parsed.response;
      limit = parsed.data.limit ?? DEFAULT_LIMIT;
    }

    const supabase = getSupabaseServiceClient();

    // Service-role bypasses RLS — backfill across all orgs. Embeddings are
    // org-scoped via the company row, no cross-tenant leakage.
    const { data: companies, error: fetchError } = await supabase
      .from('companies')
      .select('id, name')
      .is('embedding', null)
      .limit(limit);

    if (fetchError) {
      throw new Error(`Failed to query companies missing embeddings: ${fetchError.message}`);
    }

    const rows = companies ?? [];
    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        embedded: 0,
        failed: 0,
        errors: [],
      });
    }

    let embedded = 0;
    const errors: BackfillError[] = [];

    for (const company of rows) {
      try {
        await computeAndStoreCompanyEmbedding(supabase, company.id);
        embedded++;
      } catch (err) {
        const message = getErrorMessage(err);
        console.error(`Embedding backfill failed for company ${company.id} (${company.name}):`, err);
        errors.push({ id: company.id, message });
      }
    }

    return NextResponse.json({
      success: true,
      processed: rows.length,
      embedded,
      failed: errors.length,
      errors,
    });
  } catch (error: unknown) {
    console.error('Embeddings backfill error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

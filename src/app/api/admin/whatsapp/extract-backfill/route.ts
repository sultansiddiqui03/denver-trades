import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServiceClient } from '@/lib/supabase/admin';
import { getErrorMessage } from '@/lib/errors';
import { isAutomationAuthorized } from '@/lib/security/request';
import { parseBody } from '@/lib/validation';
import { extractDemand, emptyDemand } from '@/lib/agents/demandExtract';

/**
 * Admin escape hatch: run Gemini demand-extraction over inbound WhatsApp
 * threads that have no `extracted_demand` yet. Useful immediately after the
 * migration ships (so pre-existing inbound rows can light up the Active Demand
 * feed) and any time the live webhook extraction failed and we want a
 * second pass.
 *
 * Auth: Bearer ${CRON_SECRET}.
 *
 *   curl -X POST https://denver-trades.vercel.app/api/admin/whatsapp/extract-backfill \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"limit": 100}'    # body optional; default limit = 100, cap 500
 */
const BackfillSchema = z.object({
  limit: z.number().int().positive().max(500).optional(),
});

const DEFAULT_LIMIT = 100;

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

    let limit = DEFAULT_LIMIT;
    const contentLength = request.headers.get('content-length');
    if (contentLength && Number(contentLength) > 0) {
      const parsed = await parseBody(request, BackfillSchema);
      if (!parsed.ok) return parsed.response;
      limit = parsed.data.limit ?? DEFAULT_LIMIT;
    }

    const supabase = getSupabaseServiceClient();

    // Service role bypasses RLS — backfill is cross-org. Each row is updated
    // with the demand that belongs to it (no cross-tenant leakage because
    // `extracted_demand` is derived per-row from its own `message_content`).
    const { data: threads, error: fetchError } = await supabase
      .from('outreach_threads')
      .select('id, message_content, sender')
      .eq('direction', 'Inbound')
      .is('extracted_demand', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (fetchError) {
      throw new Error(`Failed to query unextracted threads: ${fetchError.message}`);
    }

    const rows = threads ?? [];
    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        with_demand: 0,
        no_demand: 0,
        failed: 0,
        errors: [],
      });
    }

    let withDemand = 0;
    let noDemand = 0;
    const errors: BackfillError[] = [];

    for (const thread of rows) {
      try {
        const demand = await extractDemand(thread.message_content, thread.sender ?? undefined);
        const { error: updateError } = await supabase
          .from('outreach_threads')
          .update({ extracted_demand: demand })
          .eq('id', thread.id);

        if (updateError) throw updateError;

        if (demand.has_demand) withDemand++;
        else noDemand++;
      } catch (err) {
        const message = getErrorMessage(err);
        console.error(`Demand backfill failed for thread ${thread.id}:`, err);
        errors.push({ id: thread.id, message });

        // Persist an empty sentinel so the row isn't re-queued on every backfill
        // pass. If the failure was a Gemini hiccup, you can manually clear the
        // column for a specific row and rerun.
        await supabase
          .from('outreach_threads')
          .update({ extracted_demand: emptyDemand() })
          .eq('id', thread.id);
      }
    }

    return NextResponse.json({
      success: true,
      processed: rows.length,
      with_demand: withDemand,
      no_demand: noDemand,
      failed: errors.length,
      errors,
    });
  } catch (error: unknown) {
    console.error('WhatsApp demand backfill error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

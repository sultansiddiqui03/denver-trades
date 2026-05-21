import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServiceClient } from '@/lib/supabase/admin';
import { getErrorMessage } from '@/lib/errors';
import { isAutomationAuthorized } from '@/lib/security/request';
import { parseBody } from '@/lib/validation';
import {
  enrichAndInsertScrapedItems,
  fetchApifyDatasetItems,
} from '@/lib/agents/apifyReplay';

/**
 * Admin escape hatch: re-process an Apify dataset against an existing
 * `agent_runs` row. Use when the original webhook never landed (e.g. callback
 * URL drift, secret misconfiguration) and a real scrape's dataset is sitting
 * orphaned in Apify.
 *
 * Auth: Bearer ${CRON_SECRET}, same shape as /api/prices?cron=true.
 *
 *   curl -X POST https://denver-trades.vercel.app/api/admin/apify/replay \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"agentRunId":"<uuid>","datasetId":"<dataset>"}'
 */
const ReplaySchema = z.object({
  agentRunId: z.string().uuid(),
  datasetId: z.string().min(1),
});

export async function POST(request: Request) {
  const supabase = getSupabaseServiceClient();
  let agentRunId: string | null = null;

  try {
    if (!isAutomationAuthorized(request)) {
      return NextResponse.json(
        { success: false, error: 'Admin authorization failed' },
        { status: 401 }
      );
    }

    const parsed = await parseBody(request, ReplaySchema);
    if (!parsed.ok) return parsed.response;
    agentRunId = parsed.data.agentRunId;
    const { datasetId } = parsed.data;

    console.info(`Apify replay: target run=${agentRunId}, dataset=${datasetId}`);

    const { data: runRecord, error: runFetchError } = await supabase
      .from('agent_runs')
      .select('id, org_id, status')
      .eq('id', agentRunId)
      .single();

    if (runFetchError || !runRecord) {
      return NextResponse.json(
        { success: false, error: 'Agent run not found' },
        { status: 404 }
      );
    }

    // Idempotency: refuse to clobber a run that already reached a terminal state.
    // The caller can flip its status manually if they really want to replay.
    if (runRecord.status === 'Success' || runRecord.status === 'Failed') {
      return NextResponse.json(
        { success: false, error: 'Run already terminal — refusing to replay' },
        { status: 409 }
      );
    }

    const orgId = runRecord.org_id;

    // Fetch dataset items via the shared helper (same auth/error surface as the webhook).
    const items = await fetchApifyDatasetItems(datasetId);
    console.info(`Apify replay: fetched ${items.length} items from dataset ${datasetId}`);

    if (items.length === 0) {
      await supabase
        .from('agent_runs')
        .update({
          status: 'Success',
          records_processed: 0,
          records_created: 0,
          completed_at: new Date().toISOString(),
        })
        .eq('id', agentRunId);

      return NextResponse.json({
        success: true,
        processed: 0,
        created: 0,
        datasetId,
        agentRunId,
      });
    }

    const { processed, created } = await enrichAndInsertScrapedItems(supabase, orgId, items);

    await supabase
      .from('agent_runs')
      .update({
        status: 'Success',
        records_processed: processed,
        records_created: created,
        completed_at: new Date().toISOString(),
      })
      .eq('id', agentRunId);

    return NextResponse.json({
      success: true,
      processed,
      created,
      datasetId,
      agentRunId,
    });
  } catch (error: unknown) {
    console.error('Apify replay error:', error);

    // Mirror the webhook receiver: surface the failure on the agent_runs row so
    // /dashboard/agents reflects the failed replay instead of staying stuck in Running.
    if (agentRunId) {
      await supabase
        .from('agent_runs')
        .update({
          status: 'Failed',
          error_log: getErrorMessage(error),
          completed_at: new Date().toISOString(),
        })
        .eq('id', agentRunId);
    }

    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

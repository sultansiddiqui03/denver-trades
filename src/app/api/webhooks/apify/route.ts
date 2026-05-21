import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServiceClient } from '@/lib/supabase/admin';
import { getErrorMessage } from '@/lib/errors';
import { isWebhookSecretAuthorized } from '@/lib/security/request';
import { parseBody } from '@/lib/validation';
import {
  enrichAndInsertScrapedItems,
  fetchApifyDatasetItems,
} from '@/lib/agents/apifyReplay';

const ApifyWebhookSchema = z.object({
  runId: z.string().optional(),
  event: z.string().min(1, 'event is required'),
  datasetId: z.string().min(1, 'datasetId is required'),
});

export async function POST(request: Request) {
  const supabase = getSupabaseServiceClient();

  try {
    if (!isWebhookSecretAuthorized(request, 'APIFY_WEBHOOK_SECRET')) {
      return NextResponse.json(
        { success: false, error: 'Webhook authorization failed' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const agentRunId = searchParams.get('agent_run_id');

    if (!agentRunId) {
      return NextResponse.json({ success: false, error: 'agent_run_id is required' }, { status: 400 });
    }

    const parsed = await parseBody(request, ApifyWebhookSchema);
    if (!parsed.ok) return parsed.response;
    const { event, datasetId } = parsed.data;

    console.info(`Apify Webhook triggered for Run ID: ${agentRunId}. Event: ${event}, Dataset ID: ${datasetId}`);

    const { data: runRecord, error: runFetchError } = await supabase
      .from('agent_runs')
      .select('id, org_id, status')
      .eq('id', agentRunId)
      .single();

    if (runFetchError || !runRecord) {
      return NextResponse.json({ success: false, error: 'Agent run not found' }, { status: 404 });
    }

    const orgId = runRecord.org_id;

    // P1-4: idempotent on replay. If the run already reached a terminal state, just
    // ACK so Apify stops retrying — re-processing would duplicate company rows.
    if (runRecord.status === 'Success' || runRecord.status === 'Failed') {
      console.info(`Apify webhook: run ${agentRunId} already ${runRecord.status}; ignoring replay.`);
      return NextResponse.json({ success: true, message: 'Run already terminal — replay ignored' });
    }

    // P1-14: never trust an org_id from the payload; use the value joined from the
    // verified agent_runs record only.

    // If the run failed, update agent run and exit
    if (event !== 'ACTOR.RUN.SUCCEEDED') {
      await supabase
        .from('agent_runs')
        .update({
          status: 'Failed',
          error_log: `Apify execution failed. Event trigger: ${event}`,
          completed_at: new Date().toISOString()
        })
        .eq('id', agentRunId);

      return NextResponse.json({ success: true, message: 'Updated run to failed state' });
    }

    // 1. Fetch dataset results from Apify
    const items = await fetchApifyDatasetItems(datasetId);
    console.info(`Fetched ${items.length} items from Apify dataset ${datasetId}`);

    if (items.length === 0) {
      await supabase
        .from('agent_runs')
        .update({
          status: 'Success',
          records_processed: 0,
          records_created: 0,
          completed_at: new Date().toISOString()
        })
        .eq('id', agentRunId);

      return NextResponse.json({ success: true, message: 'No items to process' });
    }

    // 2. Enrich + insert the top 5 scraped items (shared with /api/admin/apify/replay).
    const { processed, created } = await enrichAndInsertScrapedItems(supabase, orgId, items);

    // 3. Mark the agent run as Success in Supabase
    await supabase
      .from('agent_runs')
      .update({
        status: 'Success',
        records_processed: processed,
        records_created: created,
        completed_at: new Date().toISOString()
      })
      .eq('id', agentRunId);

    return NextResponse.json({
      success: true,
      processed,
      created
    });

  } catch (error: unknown) {
    console.error('Apify Webhook error:', error);

    // Attempt to log failure in database
    const { searchParams } = new URL(request.url);
    const agentRunId = searchParams.get('agent_run_id');
    if (agentRunId) {
      await supabase
        .from('agent_runs')
        .update({
          status: 'Failed',
          error_log: getErrorMessage(error),
          completed_at: new Date().toISOString()
        })
        .eq('id', agentRunId);
    }

    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

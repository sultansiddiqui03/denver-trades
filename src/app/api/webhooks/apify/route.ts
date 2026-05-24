import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServiceClient } from '@/lib/supabase/admin';
import { getErrorMessage } from '@/lib/errors';
import { isWebhookSecretAuthorized } from '@/lib/security/request';
import { parseBody } from '@/lib/validation';
import { fetchApifyDatasetItems } from '@/lib/agents/apifyReplay';
import { ingestApifyDataset } from '@/lib/agents/shipmentIngest';
import { DEFAULT_SCRAPER_ACTOR_ID } from '@/lib/agents/scraperActors';

// Apify's default webhook payload shape (when no custom payloadTemplate is
// set in the ad-hoc webhook config). The dispatch in /api/agents/run is
// deliberately payloadTemplate-less because a custom payloadTemplate via the
// `?webhooks=` query param came through with literal `{{eventTypeId}}` strings
// (un-interpolated) on 2026-05-21 and broke production. Apify natively
// interpolates the default payload — `eventType` + `resource.defaultDatasetId`
// + `resource.id` are all we need.
// Ref: https://docs.apify.com/platform/integrations/webhooks/actions
const ApifyWebhookSchema = z
  .object({
    eventType: z.string().min(1, 'eventType is required'),
    resource: z
      .object({
        id: z.string().min(1, 'resource.id is required'),
        defaultDatasetId: z.string().min(1, 'resource.defaultDatasetId is required'),
      })
      .passthrough(),
  })
  .passthrough();

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

    // Actor id is round-tripped through the callback URL by /api/agents/run.
    // We never trust an actor id from the webhook body — Apify's payload uses
    // an opaque internal id (`resource.actId`) rather than the username~name
    // form we register actors with.
    const callbackActorId = searchParams.get('actor_id') || DEFAULT_SCRAPER_ACTOR_ID;

    const parsed = await parseBody(request, ApifyWebhookSchema);
    if (!parsed.ok) return parsed.response;
    const { eventType, resource } = parsed.data;
    const datasetId = resource.defaultDatasetId;
    const apifyRunId = resource.id;

    console.info(
      `Apify Webhook triggered for Run ID: ${agentRunId}. ` +
      `EventType: ${eventType}, Apify run: ${apifyRunId}, Dataset: ${datasetId}`
    );

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

    // If the run failed, update agent run and exit. Stash the Apify run/dataset
    // id in error_log so the Replay button on the UI can recover the data.
    if (eventType !== 'ACTOR.RUN.SUCCEEDED') {
      await supabase
        .from('agent_runs')
        .update({
          status: 'Failed',
          error_log: `Apify execution failed (eventType=${eventType}). Apify run: ${apifyRunId}, dataset: ${datasetId}`,
          completed_at: new Date().toISOString()
        })
        .eq('id', agentRunId);

      return NextResponse.json({ success: true, message: 'Updated run to failed state' });
    }

    // 1. Fetch dataset results from Apify
    const items = await fetchApifyDatasetItems(datasetId);
    console.info(`Fetched ${items.length} items from Apify dataset ${datasetId}`);

    // Stash the dataset id in error_log even on Success rows so the agent
    // dashboard's Apify chip (regex `/dataset(?:\s+|:)([a-zA-Z0-9_-]{10,})/i`)
    // can find it. Not an actual error — the field is the convenient string.
    const datasetTrace = `Apify run: ${apifyRunId}, dataset: ${datasetId}`;

    if (items.length === 0) {
      await supabase
        .from('agent_runs')
        .update({
          status: 'Success',
          records_processed: 0,
          records_created: 0,
          completed_at: new Date().toISOString(),
          error_log: datasetTrace,
        })
        .eq('id', agentRunId);

      return NextResponse.json({ success: true, message: 'No items to process' });
    }

    // 2. Ingest the dataset (shared with /api/admin/apify/replay). The branch
    // point routes company-mode datasets to per-company enrichment and
    // shipments-mode datasets to the grouped-by-buyer path. Passing datasetId +
    // actorId tags each company with `enrichment_source = 'apify:<datasetId>:<actorId>'`
    // so the agents dashboard can look up the run AND the dossier can show the source.
    const { processed, created } = await ingestApifyDataset(
      supabase,
      orgId,
      items,
      {
        datasetId,
        actorId: callbackActorId,
      },
    );

    // 3. Mark the agent run as Success in Supabase
    await supabase
      .from('agent_runs')
      .update({
        status: 'Success',
        records_processed: processed,
        records_created: created,
        completed_at: new Date().toISOString(),
        error_log: datasetTrace,
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

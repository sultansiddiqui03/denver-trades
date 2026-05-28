import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServiceClient } from '@/lib/supabase/admin';
import { getErrorMessage } from '@/lib/errors';
import { isAutomationAuthorized } from '@/lib/security/request';
import { parseBody } from '@/lib/validation';
import { SCRAPER_ACTORS } from '@/lib/agents/scraperActors';
import { dispatchApifyScrape } from '@/lib/agents/dispatchScrape';

/**
 * Admin escape hatch: start a live Apify scrape headlessly, without a signed-in
 * user session. Lets an operator (or this agent, via CRON_SECRET) kick off a
 * real customs-data run using production's own APIFY_TOKEN — the token never
 * has to leave the server. Creates a real agent_runs row so /dashboard/agents
 * reflects the run, then dispatches with an ad-hoc webhook callback; the run
 * stays 'Running' until /api/webhooks/apify ingests the dataset.
 *
 * Auth: Bearer ${CRON_SECRET}, same shape as the other /api/admin endpoints.
 *
 *   curl -X POST https://denver-trades.vercel.app/api/admin/apify/scrape \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"orgId":"<uuid>","actorId":"zen-studio~importyeti-scraper","query":"black pepper"}'
 */
const ACTOR_ID_VALUES = Object.keys(SCRAPER_ACTORS);

const ScrapeSchema = z.object({
  orgId: z.string().uuid(),
  query: z.string().trim().min(1).max(200).optional(),
  actorId: z
    .string()
    .trim()
    .min(1)
    .transform((value) => value.replace(/\//g, '~'))
    .refine((value) => ACTOR_ID_VALUES.includes(value), {
      message: `actorId must be one of: ${ACTOR_ID_VALUES.join(', ')}`,
    })
    .optional(),
});

export async function POST(request: Request) {
  const supabase = getSupabaseServiceClient();
  let agentRunId: string | null = null;

  try {
    if (!isAutomationAuthorized(request)) {
      return NextResponse.json(
        { success: false, error: 'Admin authorization failed' },
        { status: 401 },
      );
    }

    const parsed = await parseBody(request, ScrapeSchema);
    if (!parsed.ok) return parsed.response;
    const { orgId, actorId } = parsed.data;
    const query = parsed.data.query || 'Spice importers United States';

    const { data: runRecord, error: insertError } = await supabase
      .from('agent_runs')
      .insert({
        org_id: orgId,
        agent_name: 'Lead Scraper Agent',
        status: 'Running',
        records_processed: 0,
        records_created: 0,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insertError || !runRecord) {
      return NextResponse.json(
        { success: false, error: `Failed to create run record: ${getErrorMessage(insertError)}` },
        { status: 500 },
      );
    }
    agentRunId = runRecord.id;

    const dispatch = await dispatchApifyScrape({ runRecordId: agentRunId, query, actorId });

    return NextResponse.json({
      success: true,
      mode: 'live',
      agentRunId,
      apifyRunId: dispatch.apifyRunId,
      actorId: dispatch.actorId,
      actorLabel: dispatch.actorLabel,
      query,
      message: `Apify scrape dispatched (${dispatch.actorLabel}). Run stays 'Running' until the webhook ingests the dataset.`,
    });
  } catch (error: unknown) {
    console.error('Admin Apify scrape error:', error);

    // Surface the failure on the agent_runs row so the dashboard doesn't stick on Running.
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
      { status: 500 },
    );
  }
}

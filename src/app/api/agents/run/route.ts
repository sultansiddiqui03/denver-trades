import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserContext } from '@/lib/auth/server';
import { getErrorMessage } from '@/lib/errors';
import { runPriceIngest } from '@/lib/agents/priceIngest';
import { parseBody } from '@/lib/validation';
import type { Database } from '@/lib/supabase/database.types';
import { SCRAPER_ACTORS } from '@/lib/agents/scraperActors';
import { dispatchApifyScrape } from '@/lib/agents/dispatchScrape';
import { normalizeProductQuery } from '@/lib/agents/productQuery';

// APIFY_ACTOR_ID format: <username>~<actor-name> (the Apify "technical name").
// The actor-specific input/output contracts live in scraperActors.ts so
// adding a new actor is a one-file change. Supported keys (paste into Vercel
// env `APIFY_ACTOR_ID`):
//   - `compass~crawler-google-places`     (DEFAULT — Google Maps directory)
//   - `zen-studio~importyeti-scraper`     (customs-grade shipment data, richer)
//   - `lulzasaur~importyeti-scraper`      (customs-grade, budget alternative)
// Anything else falls back to the default — see GO_LIVE.md "Switching to
// customs-data enrichment" for the trade-off matrix.
//
// Per-run override: callers may include `actorId` in the POST body to choose
// the actor for a single run (UI source-picker on the Lead Scraper card).
// Resolution order on Lead Scraper dispatch is: body.actorId → env
// APIFY_ACTOR_ID → code default. Unknown ids fall back permissively to the
// default per pickActor's contract — typos can't brick production.

// Accepted actor ids — keys of SCRAPER_ACTORS plus tolerated slash form
// (since operators commonly copy `username/actor` from the Apify store URL).
const ACTOR_ID_VALUES = Object.keys(SCRAPER_ACTORS);

const RunAgentSchema = z.object({
  agentName: z.string().min(1, 'agentName is required'),
  query: z.string().optional(),
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

const LEAD_SCRAPER = 'Lead Scraper Agent';
const PRICE_INGEST = 'Price Ingest Agent';
const DOC_AUDIT = 'Doc Audit Agent';
const WHATSAPP_PARSER = 'WhatsApp Parser Agent';

const KNOWN_AGENTS = new Set([LEAD_SCRAPER, PRICE_INGEST, DOC_AUDIT, WHATSAPP_PARSER]);

const STALE_RUN_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  const { context, response: authResponse } = await requireUserContext();
  if (!context) return authResponse;

  const { orgId, supabase } = context;

  // Lazy timeout sweep: auto-fail any Running rows older than STALE_RUN_MS for this org.
  // Avoids needing a minute-level cron on Vercel Hobby plans.
  const staleCutoff = new Date(Date.now() - STALE_RUN_MS).toISOString();
  await supabase
    .from('agent_runs')
    .update({
      status: 'Failed',
      completed_at: new Date().toISOString(),
      error_log: 'Auto-failed: agent run exceeded 15-minute timeout (no completion signal received).',
    })
    .eq('org_id', orgId)
    .eq('status', 'Running')
    .lt('started_at', staleCutoff);

  const parsed = await parseBody(request, RunAgentSchema);
  if (!parsed.ok) return parsed.response;

  const agentName = parsed.data.agentName.trim();
  const query = parsed.data.query?.trim();
  const actorId = parsed.data.actorId;

  if (!KNOWN_AGENTS.has(agentName)) {
    return NextResponse.json(
      { success: false, error: `Unknown agent: ${agentName}` },
      { status: 400 }
    );
  }

  const { data: runRecord, error: insertError } = await supabase
    .from('agent_runs')
    .insert({
      org_id: orgId,
      agent_name: agentName,
      status: 'Running',
      records_processed: 0,
      records_created: 0,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (insertError || !runRecord) {
    return NextResponse.json(
      { success: false, error: `Failed to create run record: ${getErrorMessage(insertError)}` },
      { status: 500 }
    );
  }

  try {
    if (agentName === LEAD_SCRAPER) {
      return await dispatchLeadScraper({ runRecordId: runRecord.id, orgId, query, actorId, supabase });
    }

    if (agentName === PRICE_INGEST) {
      const { processed, created } = await runPriceIngest();
      const { data: updatedRun } = await supabase
        .from('agent_runs')
        .update({
          status: 'Success',
          records_processed: processed,
          records_created: created,
          completed_at: new Date().toISOString(),
        })
        .eq('id', runRecord.id)
        .select()
        .single();

      return NextResponse.json({
        success: true,
        mode: 'live',
        message: `Ingested ${created} price ticks across ${processed} commodities.`,
        run: updatedRun ?? runRecord,
      });
    }

    if (agentName === DOC_AUDIT) {
      const { data: updatedRun } = await supabase
        .from('agent_runs')
        .update({
          status: 'Success',
          records_processed: 0,
          records_created: 0,
          completed_at: new Date().toISOString(),
        })
        .eq('id', runRecord.id)
        .select()
        .single();

      return NextResponse.json({
        success: true,
        mode: 'idle',
        message:
          'Doc Audit is on-demand. Open the Documents page and upload a Letter of Credit + Bill of Lading pair to audit.',
        navigateTo: '/dashboard/documents',
        run: updatedRun ?? runRecord,
      });
    }

    if (agentName === WHATSAPP_PARSER) {
      const { data: updatedRun } = await supabase
        .from('agent_runs')
        .update({
          status: 'Success',
          records_processed: 0,
          records_created: 0,
          completed_at: new Date().toISOString(),
        })
        .eq('id', runRecord.id)
        .select()
        .single();

      return NextResponse.json({
        success: true,
        mode: 'idle',
        message:
          'WhatsApp Parser runs in real time on inbound Twilio webhooks. Open the Outreach Inbox to view processed messages.',
        navigateTo: '/dashboard/outreach',
        run: updatedRun ?? runRecord,
      });
    }

    throw new Error(`Unhandled agent (should be unreachable): ${agentName}`);
  } catch (error: unknown) {
    console.error(`Run Agent API error (run ${runRecord.id}):`, error);

    await supabase
      .from('agent_runs')
      .update({
        status: 'Failed',
        completed_at: new Date().toISOString(),
        error_log: getErrorMessage(error),
      })
      .eq('id', runRecord.id);

    return NextResponse.json(
      {
        success: false,
        error: getErrorMessage(error),
        runId: runRecord.id,
      },
      { status: 500 }
    );
  }
}

async function dispatchLeadScraper(params: {
  runRecordId: string;
  orgId: string;
  query: string | undefined;
  /** Per-request actor override (zod-validated against SCRAPER_ACTORS). */
  actorId: string | undefined;
  supabase: SupabaseClient<Database>;
}) {
  const { runRecordId, orgId, query, actorId, supabase } = params;
  // Normalize natural-language queries ("rice exporters in usa" → "rice") so the
  // customs/product search actually hits instead of slugifying to a non-existent
  // company and returning nothing.
  const searchQuery = normalizeProductQuery(query || 'Spice exporters in Vietnam');
  const token = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN;

  // No Apify token → simulation mode (clearly labeled)
  if (!token) {
    const randId = Math.floor(Math.random() * 1000);
    const { error: companyError } = await supabase
      .from('companies')
      .insert({
        org_id: orgId,
        name: `[SIM] Global Spice Exporters Ltd #${randId}`,
        type: 'Exporter',
        hq_country: 'Vietnam',
        hq_city: 'Ho Chi Minh City',
        products_dealt: ['Black Pepper', 'Star Anise', 'Cinnamon wholes'],
        description: `[SIMULATION] Lead generated for query "${searchQuery}". Set APIFY_TOKEN to run live scraping.`,
        is_enriched: true,
        confidence_score: 0.95,
      });

    if (companyError) throw companyError;

    const { data: updatedRun } = await supabase
      .from('agent_runs')
      .update({
        status: 'Success',
        records_processed: 1,
        records_created: 1,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runRecordId)
      .select()
      .single();

    return NextResponse.json({
      success: true,
      mode: 'simulation',
      message: 'APIFY_TOKEN not set — ran in simulation mode. Add the token in Vercel env vars for live scraping.',
      run: updatedRun,
    });
  }

  // Live Apify dispatch — actor + input shape are data-driven via
  // scraperActors.ts. Resolution order (handled inside dispatchApifyScrape):
  //   1. Per-request `actorId` (the UI source picker on the Lead Scraper card)
  //   2. APIFY_ACTOR_ID env var (operator-level default)
  //   3. Code default (Google Maps)
  const dispatch = await dispatchApifyScrape({ runRecordId, query: searchQuery, actorId });

  // Run stays 'Running' until Apify calls back the webhook (or the timeout sweep claims it).
  return NextResponse.json({
    success: true,
    mode: 'live',
    apifyRunId: dispatch.apifyRunId,
    apifyActorId: dispatch.actorId,
    apifyActorLabel: dispatch.actorLabel,
    message: `Apify scrape dispatched (${dispatch.actorLabel}). Webhook will update the run when it completes.`,
    run: {
      id: runRecordId,
      org_id: orgId,
      agent_name: LEAD_SCRAPER,
      status: 'Running',
    },
  });
}

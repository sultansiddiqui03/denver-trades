import type { SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserContext } from '@/lib/auth/server';
import { getErrorMessage } from '@/lib/errors';
import { runPriceIngest } from '@/lib/agents/priceIngest';
import { parseBody } from '@/lib/validation';
import type { Database } from '@/lib/supabase/database.types';

// APIFY_ACTOR_ID format: <username>~<actor-name> (the Apify "technical name").
// Default is `compass~crawler-google-places` — the de-facto Google Maps scraper
// on Apify (200k+ users, free tier available). The legacy `apify~google-maps-scraper`
// alias was retired and now returns a 404 from the Apify dispatch API.
// Other valid examples for lead scraping:
//   - `compass~crawler-google-places`       (default — Google Maps, full fields)
//   - `compass~google-maps-scraper`          (alt Google Maps actor)
//   - `apify~linkedin-company-scraper`       (LinkedIn companies)
// If overriding, make sure the actor's input schema accepts `searchStringsArray`
// + `maxCrawledPlacesPerSearch` (see the dispatch body below) or update the
// payload to match the new actor's schema.

const RunAgentSchema = z.object({
  agentName: z.string().min(1, 'agentName is required'),
  query: z.string().optional(),
});

const LEAD_SCRAPER = 'Lead Scraper Agent';
const PRICE_INGEST = 'Price Ingest Agent';
const DOC_AUDIT = 'Doc Audit Agent';
const WHATSAPP_PARSER = 'WhatsApp Parser Agent';

const KNOWN_AGENTS = new Set([LEAD_SCRAPER, PRICE_INGEST, DOC_AUDIT, WHATSAPP_PARSER]);

const STALE_RUN_MS = 15 * 60 * 1000;

function publicBaseUrl() {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
}

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
      return await dispatchLeadScraper({ runRecordId: runRecord.id, orgId, query, supabase });
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
  supabase: SupabaseClient<Database>;
}) {
  const { runRecordId, orgId, query, supabase } = params;
  const searchQuery = query || 'Spice exporters in Vietnam';
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

  // Live Apify dispatch
  const actorId = process.env.APIFY_ACTOR_ID || 'compass~crawler-google-places';
  const webhookSecret = process.env.APIFY_WEBHOOK_SECRET;
  const webhookUrl = `${publicBaseUrl()}/api/webhooks/apify?agent_run_id=${runRecordId}`;

  // Apify ad-hoc webhooks must be passed as a URL-safe base64-encoded JSON
  // array in the `webhooks` QUERY PARAMETER, not in the request body.
  // (Anything in the body that doesn't match the actor's input schema is
  // silently ignored — which is what caused the original "Succeeded but no
  // callback" bug.)  Ref: https://docs.apify.com/platform/integrations/webhooks/ad-hoc-webhooks
  const webhooksConfig = [
    {
      eventTypes: ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED'],
      requestUrl: webhookUrl,
      // P1-1: pass secret via header, not query string
      headersTemplate: webhookSecret
        ? JSON.stringify({ 'x-denver-webhook-secret': webhookSecret })
        : undefined,
      payloadTemplate: JSON.stringify({
        runId: '{{resource.id}}',
        event: '{{eventTypeId}}',
        datasetId: '{{resource.defaultDatasetId}}',
      }),
    },
  ];
  const webhooksParam = Buffer.from(JSON.stringify(webhooksConfig))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const apifyUrl = `https://api.apify.com/v2/acts/${actorId}/runs?token=${token}&webhooks=${webhooksParam}`;

  const apifyResponse = await fetch(apifyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // `compass/crawler-google-places` expects `searchStringsArray` (not
      // `searchStrings`). Output fields (title, categoryName, website, phone,
      // street, city, countryCode, description) align with the ScrapedPlace
      // interface in /api/webhooks/apify, so no mapping is required.
      searchStringsArray: [searchQuery],
      maxCrawledPlacesPerSearch: 5,
    }),
  });

  if (!apifyResponse.ok) {
    const errText = await apifyResponse.text();
    if (apifyResponse.status === 404) {
      throw new Error(
        `Apify actor not found (404) — check APIFY_ACTOR_ID env var. Default is compass~crawler-google-places. Tried "${actorId}". Raw: ${errText}`
      );
    }
    throw new Error(`Apify dispatch failed (${apifyResponse.status}): ${errText}`);
  }

  const apifyRunData = (await apifyResponse.json()) as { data?: { id?: string } };

  // Run stays 'Running' until Apify calls back the webhook (or the timeout sweep claims it).
  return NextResponse.json({
    success: true,
    mode: 'live',
    apifyRunId: apifyRunData.data?.id,
    message: 'Apify scrape dispatched. Webhook will update the run when it completes.',
    run: {
      id: runRecordId,
      org_id: orgId,
      agent_name: LEAD_SCRAPER,
      status: 'Running',
    },
  });
}

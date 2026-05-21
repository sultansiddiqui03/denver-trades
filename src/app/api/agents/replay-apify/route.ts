import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserContext } from '@/lib/auth/server';
import { getErrorMessage } from '@/lib/errors';
import { parseBody } from '@/lib/validation';

/**
 * Thin authenticated proxy that lets the agents dashboard re-run the Apify
 * enrichment/ingestion pipeline against an existing dataset.
 *
 * The actual heavy-lifting endpoint lives at /api/admin/apify/replay (built by
 * the admin/replay agent) and is Bearer-authed with CRON_SECRET so the browser
 * cannot call it directly. This proxy:
 *   1. Authenticates the user (org-scoped).
 *   2. Loads the referenced agent_runs row and confirms it belongs to the org.
 *   3. Parses the Apify dataset id from the row's error_log (or accepts an
 *      explicit datasetId override).
 *   4. Forwards to the admin endpoint with the server-side secret.
 *   5. Returns the admin endpoint's response shape verbatim, plus tolerates a
 *      404 (admin endpoint not yet deployed) with a clear hint.
 */

const ReplayApifySchema = z.object({
  agentRunId: z.string().uuid('agentRunId must be a UUID'),
  datasetId: z.string().min(8).optional(),
});

// Matches "dataset ffeKO5Oq7meoNAXLf" or "dataset: ffeKO5Oq7meoNAXLf"
// (case-insensitive). Apify dataset ids are alphanumeric (with - and _),
// typically 16-17 chars. We accept anything 10+ chars to be lenient.
const DATASET_ID_RE = /dataset(?:\s+|:\s*)([a-zA-Z0-9_-]{10,})/i;

function extractDatasetId(errorLog: string | null | undefined): string | null {
  if (!errorLog) return null;
  const match = errorLog.match(DATASET_ID_RE);
  return match?.[1] ?? null;
}

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

  const parsed = await parseBody(request, ReplayApifySchema);
  if (!parsed.ok) return parsed.response;

  const { agentRunId, datasetId: datasetIdOverride } = parsed.data;

  // 1. Load the agent_runs row and confirm it belongs to the user's org.
  const { data: run, error: runError } = await supabase
    .from('agent_runs')
    .select('id, org_id, agent_name, status, error_log')
    .eq('id', agentRunId)
    .eq('org_id', orgId)
    .single();

  if (runError || !run) {
    return NextResponse.json(
      { success: false, error: 'Agent run not found' },
      { status: 404 }
    );
  }

  if (run.agent_name !== 'Lead Scraper Agent') {
    return NextResponse.json(
      { success: false, error: 'Replay is only supported for Lead Scraper Agent runs' },
      { status: 400 }
    );
  }

  // 2. Resolve a dataset id — explicit override wins, fall back to parsing the
  // error_log.
  const datasetId = datasetIdOverride || extractDatasetId(run.error_log);
  if (!datasetId) {
    return NextResponse.json(
      {
        success: false,
        error: 'Could not find an Apify dataset id on this run. Pass datasetId explicitly.',
      },
      { status: 400 }
    );
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      {
        success: false,
        error: 'CRON_SECRET is not configured on the server — cannot authenticate to admin endpoint.',
      },
      { status: 500 }
    );
  }

  // 3. The admin endpoint refuses to clobber rows that are already terminal
  // (Success/Failed) — so reset this row back to Running before forwarding.
  // If the admin call fails we'll re-mark it Failed inside the catch.
  if (run.status === 'Success' || run.status === 'Failed') {
    const { error: resetError } = await supabase
      .from('agent_runs')
      .update({
        status: 'Running',
        completed_at: null,
        error_log: null,
      })
      .eq('id', run.id)
      .eq('org_id', orgId);

    if (resetError) {
      return NextResponse.json(
        {
          success: false,
          error: `Failed to reset run for replay: ${getErrorMessage(resetError)}`,
        },
        { status: 500 }
      );
    }
  }

  // 4. Forward to the admin endpoint with the Bearer secret.
  const adminUrl = `${publicBaseUrl()}/api/admin/apify/replay`;

  try {
    const adminResponse = await fetch(adminUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({
        agentRunId: run.id,
        datasetId,
      }),
    });

    // Sibling endpoint not yet deployed — return a friendly 404.
    if (adminResponse.status === 404) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Replay endpoint is not deployed yet (POST /api/admin/apify/replay returned 404). Please try again once the sibling endpoint ships.',
          notDeployed: true,
        },
        { status: 503 }
      );
    }

    const payload = await adminResponse.json().catch(() => null);

    if (!adminResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          error:
            (payload && typeof payload === 'object' && 'error' in payload
              ? String((payload as { error: unknown }).error)
              : null) || `Admin replay failed (${adminResponse.status})`,
        },
        { status: adminResponse.status }
      );
    }

    return NextResponse.json(
      payload ?? { success: true, message: 'Replay enqueued.' }
    );
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

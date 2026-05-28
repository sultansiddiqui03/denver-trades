import { pickActor } from '@/lib/agents/scraperActors';

/**
 * Public base URL the Apify webhook should call back. Prefers the stable
 * production domain over the hashed per-deploy URL so callbacks survive
 * redeploys.
 */
export function publicBaseUrl(): string {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
}

export interface DispatchResult {
  apifyRunId?: string;
  actorId: string;
  actorLabel: string;
}

/**
 * Start a live Apify scrape run with an ad-hoc webhook callback to
 * /api/webhooks/apify. Shared by the user-facing Lead Scraper dispatch and the
 * CRON_SECRET-guarded admin trigger so the two paths can never drift. Throws if
 * APIFY_TOKEN is missing or Apify rejects the dispatch — callers decide how to
 * surface the failure on their agent_runs row.
 *
 * Apify ad-hoc webhooks MUST be passed as a URL-safe base64 JSON array in the
 * `webhooks` QUERY parameter, never in the request body (anything in the body
 * that doesn't match the actor's input schema is silently dropped). The actor
 * id is threaded back via the callback URL so the receiver runs the correct
 * mapItem adapter — Apify's `resource.actId` is an opaque internal id, not the
 * `username~name` form we register with.
 */
export async function dispatchApifyScrape(params: {
  runRecordId: string;
  query: string;
  actorId: string | undefined;
}): Promise<DispatchResult> {
  const { runRecordId, query, actorId } = params;
  const token = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN;
  if (!token) {
    throw new Error('APIFY_TOKEN not set — cannot dispatch a live scrape.');
  }

  const actor = pickActor(actorId ?? process.env.APIFY_ACTOR_ID);
  const webhookSecret = process.env.APIFY_WEBHOOK_SECRET;
  const callbackUrl =
    `${publicBaseUrl()}/api/webhooks/apify` +
    `?agent_run_id=${runRecordId}` +
    `&actor_id=${encodeURIComponent(actor.id)}`;

  const webhooksConfig = [
    {
      eventTypes: ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED'],
      requestUrl: callbackUrl,
      headersTemplate: webhookSecret
        ? JSON.stringify({ 'x-denver-webhook-secret': webhookSecret })
        : undefined,
    },
  ];
  const webhooksParam = Buffer.from(JSON.stringify(webhooksConfig))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  // The registry key (actor.id) may be synthetic when one Apify actor backs two
  // modes (e.g. ImportYeti company vs shipments). Dispatch against the REAL id.
  const dispatchActorId = actor.apifyActorId ?? actor.id;
  const apifyUrl = `https://api.apify.com/v2/acts/${dispatchActorId}/runs?token=${token}&webhooks=${webhooksParam}`;

  const apifyResponse = await fetch(apifyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(actor.buildInput(query, actor.defaultRunSize ?? 5)),
  });

  if (!apifyResponse.ok) {
    const errText = await apifyResponse.text();
    if (apifyResponse.status === 404) {
      throw new Error(
        `Apify actor not found (404) — check APIFY_ACTOR_ID env var. ` +
          `Supported: compass~crawler-google-places (default), ` +
          `zen-studio~importyeti-scraper, lulzasaur~importyeti-scraper. ` +
          `Tried "${actor.id}" (${actor.label}). Raw: ${errText}`,
      );
    }
    throw new Error(`Apify dispatch failed (${apifyResponse.status}): ${errText}`);
  }

  const apifyRunData = (await apifyResponse.json()) as { data?: { id?: string } };
  return {
    apifyRunId: apifyRunData.data?.id,
    actorId: actor.id,
    actorLabel: actor.label,
  };
}

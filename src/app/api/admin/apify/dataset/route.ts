import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getErrorMessage } from '@/lib/errors';
import { isAutomationAuthorized } from '@/lib/security/request';
import { parseBody } from '@/lib/validation';
import { fetchApifyDatasetItems } from '@/lib/agents/apifyReplay';
import { SCRAPER_ACTORS, mapItems } from '@/lib/agents/scraperActors';

/**
 * Admin diagnostic: peek at a finished Apify dataset WITHOUT ingesting it.
 * Fetches the raw items server-side (using production's own APIFY_TOKEN, which
 * never leaves the box), runs them through the chosen actor's mapItem, and
 * returns the raw count, the mapped count, and a small sample of each. Lets an
 * operator (or this agent, via CRON_SECRET) answer the only question that
 * matters when a scrape comes back with records_processed=0: did the ACTOR
 * return nothing (bad input contract), or did MAPPING drop everything (bad
 * adapter)?
 *
 * Auth: Bearer ${CRON_SECRET}, same shape as the other /api/admin endpoints.
 *
 *   curl -X POST https://denver-trades.vercel.app/api/admin/apify/dataset \
 *     -H "Authorization: Bearer $CRON_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{"datasetId":"<id>","actorId":"zen-studio~importyeti-scraper"}'
 */
const ACTOR_ID_VALUES = Object.keys(SCRAPER_ACTORS);

const DatasetSchema = z.object({
  datasetId: z.string().trim().min(1),
  actorId: z
    .string()
    .trim()
    .min(1)
    .transform((value) => value.replace(/\//g, '~'))
    .refine((value) => ACTOR_ID_VALUES.includes(value), {
      message: `actorId must be one of: ${ACTOR_ID_VALUES.join(', ')}`,
    })
    .optional(),
  sampleSize: z.number().int().min(1).max(5).optional(),
});

export async function POST(request: Request) {
  try {
    if (!isAutomationAuthorized(request)) {
      return NextResponse.json(
        { success: false, error: 'Admin authorization failed' },
        { status: 401 },
      );
    }

    const parsed = await parseBody(request, DatasetSchema);
    if (!parsed.ok) return parsed.response;
    const { datasetId, actorId } = parsed.data;
    const sampleSize = parsed.data.sampleSize ?? 2;

    const rawItems = await fetchApifyDatasetItems(datasetId);
    const mapped = mapItems(rawItems, actorId);

    return NextResponse.json({
      success: true,
      datasetId,
      actorId: actorId ?? null,
      rawCount: rawItems.length,
      mappedCount: mapped.length,
      // Raw sample exposes the ACTUAL field names the actor emits — the only
      // way to know whether the adapter's aliases line up with reality.
      rawSample: rawItems.slice(0, sampleSize),
      mappedSample: mapped.slice(0, sampleSize),
    });
  } catch (error: unknown) {
    console.error('Admin Apify dataset peek error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

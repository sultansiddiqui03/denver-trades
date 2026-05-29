import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getErrorMessage } from '@/lib/errors';
import { requireUserContext } from '@/lib/auth/server';
import { parseBody } from '@/lib/validation';
import { enrichOrgBuyerContacts } from '@/lib/agents/contactEnrich';

/**
 * Find outreach contacts (emails / phones) for the org's reachable buyers —
 * those with a website but no contacts yet — by crawling each site with the
 * Apify Contact Details Scraper. Org-scoped to the caller. Each company is one
 * synchronous Apify run, so `limit` is capped small.
 */
export const maxDuration = 300;

const Schema = z.object({
  limit: z.number().int().min(1).max(8).optional(),
});

export async function POST(request: Request) {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;

    let limit = 5;
    const contentLength = request.headers.get('content-length');
    if (contentLength && Number(contentLength) > 0) {
      const parsed = await parseBody(request, Schema);
      if (!parsed.ok) return parsed.response;
      limit = parsed.data.limit ?? 5;
    }

    if (!process.env.APIFY_TOKEN && !process.env.APIFY_API_TOKEN) {
      return NextResponse.json(
        { success: false, error: 'Contact discovery needs APIFY_TOKEN.' },
        { status: 503 },
      );
    }

    const result = await enrichOrgBuyerContacts(context.supabase, context.orgId, limit);
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    console.error('Discover-buyers contacts error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

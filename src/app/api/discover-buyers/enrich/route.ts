import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getErrorMessage } from '@/lib/errors';
import { requireUserContext } from '@/lib/auth/server';
import { parseBody } from '@/lib/validation';
import { enrichThinDiscoveryLeads } from '@/lib/agents/buyerDiscovery';

/**
 * Enrich the org's thin buyer-discovery leads into full customs profiles by
 * re-running an ImportYeti `type=company` lookup on each (fills shipment volume,
 * HS codes, suppliers → lifts their buyer-fit score). Each lead is one
 * synchronous Apify run, so `limit` is capped small. Org-scoped to the caller.
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

    const result = await enrichThinDiscoveryLeads(context.supabase, context.orgId, limit);
    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    console.error('Discover-buyers enrich error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

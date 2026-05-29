import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getErrorMessage } from '@/lib/errors';
import { requireUserContext } from '@/lib/auth/server';
import { parseBody } from '@/lib/validation';
import { discoverBuyersForProduct } from '@/lib/agents/buyerDiscovery';

/**
 * One-shot "discover & prep outreach" pipeline: finds buyers for a product AND
 * enriches the top N inline (so they carry shipment volume, HS codes, and a
 * website where available), then reports reachability — how many discovered
 * buyers can be reached by contact discovery vs. still need a website. Bounded
 * to stay under the 300s function ceiling.
 */
export const maxDuration = 300;

const Schema = z.object({
  product: z.string().trim().min(1).max(120),
  maxBuyers: z.number().int().min(1).max(20).optional(),
  enrichTop: z.number().int().min(0).max(6).optional(),
});

export async function POST(request: Request) {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;

    const parsed = await parseBody(request, Schema);
    if (!parsed.ok) return parsed.response;
    const { product, maxBuyers, enrichTop } = parsed.data;

    if (!process.env.APIFY_TOKEN && !process.env.APIFY_API_TOKEN) {
      return NextResponse.json(
        { success: false, error: 'Discovery needs APIFY_TOKEN.' },
        { status: 503 },
      );
    }

    const result = await discoverBuyersForProduct(context.supabase, context.orgId, product, {
      maxBuyers: maxBuyers ?? 12,
      enrichTop: enrichTop ?? 4,
    });

    const message =
      `Found ${result.candidateBuyers} buyers, kept ${result.inserted} new, enriched ${result.enriched}. ` +
      (result.unreachable > 0
        ? `${result.reachable} reachable now; ${result.unreachable} need a website before contacts can be found.`
        : `${result.reachable} reachable for contact discovery.`);

    return NextResponse.json({ success: true, message, ...result });
  } catch (error: unknown) {
    console.error('Discover-buyers pipeline error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

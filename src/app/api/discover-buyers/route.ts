import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getErrorMessage } from '@/lib/errors';
import { requireUserContext } from '@/lib/auth/server';
import { parseBody } from '@/lib/validation';
import { discoverBuyersForProduct } from '@/lib/agents/buyerDiscovery';
import { captureError } from '@/lib/observability/capture';

/**
 * User-facing buyer discovery: "find buyers who import <product>". Runs a live
 * ImportYeti product search, HS-chapter-filters the suppliers, harvests their
 * US importers as buyers, and persists them as scored Importer leads under the
 * signed-in user's org. Synchronous (one Apify product run, ~45-60s) — the
 * caller should show a loading state. Enrichment of the thin leads to full
 * profiles is a follow-up call to /api/discover-buyers/enrich so this stays fast.
 */
export const maxDuration = 300;

const Schema = z.object({
  product: z.string().trim().min(1).max(120),
  maxSuppliers: z.number().int().min(1).max(50).optional(),
  maxBuyers: z.number().int().min(1).max(30).optional(),
});

export async function POST(request: Request) {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;

    const parsed = await parseBody(request, Schema);
    if (!parsed.ok) return parsed.response;
    const { product, maxSuppliers, maxBuyers } = parsed.data;

    if (!process.env.APIFY_TOKEN && !process.env.APIFY_API_TOKEN) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Live discovery needs APIFY_TOKEN. Add it in the project env to scan customs records.',
        },
        { status: 503 },
      );
    }

    const result = await discoverBuyersForProduct(context.supabase, context.orgId, product, {
      maxSuppliers: maxSuppliers ?? 25,
      maxBuyers: maxBuyers ?? 15,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    await captureError(error, { route: 'api/discover-buyers' });
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

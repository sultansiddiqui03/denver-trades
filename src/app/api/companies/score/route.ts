import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getErrorMessage } from '@/lib/errors';
import { requireUserContext } from '@/lib/auth/server';
import { parseBody } from '@/lib/validation';
import { scoreOrgCompanies } from '@/lib/scoring/runScoring';

/**
 * Recompute buyer-fit scores for the signed-in org. Called by the "Rescore"
 * control and after onboarding changes the org's commodities/target markets.
 * Body is optional: `{ companyIds?: string[], limit?: number }`.
 */
const Schema = z.object({
  companyIds: z.array(z.string().uuid()).max(500).optional(),
  limit: z.number().int().positive().max(1000).optional(),
});

export async function POST(request: Request) {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;

    let companyIds: string[] | undefined;
    let limit: number | undefined;
    const contentLength = request.headers.get('content-length');
    if (contentLength && Number(contentLength) > 0) {
      const parsed = await parseBody(request, Schema);
      if (!parsed.ok) return parsed.response;
      companyIds = parsed.data.companyIds;
      limit = parsed.data.limit;
    }

    const result = await scoreOrgCompanies(context.supabase, context.orgId, {
      companyIds,
      limit,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: unknown) {
    console.error('Buyer-fit scoring error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

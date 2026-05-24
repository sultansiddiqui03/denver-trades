import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseServiceClient } from '@/lib/supabase/admin';
import { getErrorMessage } from '@/lib/errors';
import { isAutomationAuthorized } from '@/lib/security/request';
import { parseBody } from '@/lib/validation';
import { computeAndStoreSourcingSignal } from '@/lib/signals/runSignals';

/**
 * Admin escape hatch: recompute the supplier-shift `sourcing_signal` for every
 * company that has shipment rows. Run after tuning the thresholds in
 * supplierShift.ts or after a shipments-mode scrape. Only recomputes the
 * signal — it does NOT touch the aggregate columns.
 *
 * Auth: Bearer ${CRON_SECRET}.
 *
 *   curl -X POST https://denver-trades.vercel.app/api/admin/companies/signals-backfill \
 *     -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d '{}'
 */
const Schema = z.object({
  orgId: z.string().uuid().optional(),
  limit: z.number().int().positive().max(5000).optional(),
});

export async function POST(request: Request) {
  try {
    if (!isAutomationAuthorized(request)) {
      return NextResponse.json(
        { success: false, error: 'Admin authorization failed' },
        { status: 401 },
      );
    }

    let orgId: string | undefined;
    let rowLimit = 5000;
    const contentLength = request.headers.get('content-length');
    if (contentLength && Number(contentLength) > 0) {
      const parsed = await parseBody(request, Schema);
      if (!parsed.ok) return parsed.response;
      orgId = parsed.data.orgId;
      rowLimit = parsed.data.limit ?? 5000;
    }

    const supabase = getSupabaseServiceClient();

    // Companies that actually have shipment rows (the signal needs them).
    let query = supabase.from('shipments').select('company_id').not('company_id', 'is', null);
    if (orgId) query = query.eq('org_id', orgId);
    const { data: rows, error } = await query.limit(rowLimit);
    if (error) throw new Error(`Failed to list shipment companies: ${error.message}`);

    const companyIds = [...new Set((rows ?? []).map((r) => r.company_id).filter(Boolean))] as string[];

    let signalled = 0;
    const errors: { id: string; message: string }[] = [];
    for (const id of companyIds) {
      try {
        const ok = await computeAndStoreSourcingSignal(supabase, id);
        if (ok) signalled++;
      } catch (err) {
        errors.push({ id, message: getErrorMessage(err) });
      }
    }

    return NextResponse.json({
      success: true,
      companies: companyIds.length,
      signalled,
      failed: errors.length,
      errors,
    });
  } catch (error: unknown) {
    console.error('Sourcing-signal backfill error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

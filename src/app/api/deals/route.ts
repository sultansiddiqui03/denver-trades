import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserContext } from '@/lib/auth/server';
import { getErrorMessage } from '@/lib/errors';
import { parseBody } from '@/lib/validation';
import { DEAL_STAGES } from '@/lib/pipeline/stages';
import type { TablesInsert } from '@/lib/supabase/database.types';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

type DealInsert = TablesInsert<'deals_pipeline'>;

const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const CreateDealSchema = z.object({
  title: z.string().min(1, 'title is required').max(200),
  company_id: z.string().regex(UUID_PATTERN, 'company_id must be a UUID').nullable().optional(),
  stage: z.enum(DEAL_STAGES).optional(),
  product: z.string().max(200).nullable().optional(),
  value_usd: z.number().nonnegative().nullable().optional(),
  quantity_mt: z.number().nonnegative().nullable().optional(),
  incoterm: z.string().max(20).nullable().optional(),
  port_loading: z.string().max(120).nullable().optional(),
  port_discharge: z.string().max(120).nullable().optional(),
  payment_terms: z.string().max(120).nullable().optional(),
  expected_close_date: z.string().nullable().optional(), // ISO date YYYY-MM-DD
  notes: z.string().max(5000).nullable().optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

/**
 * Mint the next `deal_code` for a new row, following the
 * `LEAD-OPP-<year>-<5-digit-seq>` pattern set by the
 * `20260521120000_pipeline_trade_stages.sql` backfill.
 *
 * Sequence is global (not per-org) — matches the backfill which used
 * `row_number() OVER (ORDER BY created_at)`. The migration follow-up notes
 * call out per-org numbering as a future change; we'll do it then.
 *
 * Race window: between SELECT MAX and INSERT another row could mint the same
 * code. The unique partial index on `deal_code` will reject the duplicate;
 * caller retries once with the freshly-recomputed max.
 */
async function mintNextDealCode(
  supabase: SupabaseClient<Database>
): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = `LEAD-OPP-${year}-`;

  const { data, error } = await supabase
    .from('deals_pipeline')
    .select('deal_code')
    .like('deal_code', `${prefix}%`)
    .order('deal_code', { ascending: false })
    .limit(1);

  if (error) throw error;

  let nextSeq = 1;
  const latest = data?.[0]?.deal_code;
  if (latest) {
    const match = /(\d+)$/.exec(latest);
    if (match) {
      const parsed = parseInt(match[1], 10);
      if (!Number.isNaN(parsed)) nextSeq = parsed + 1;
    }
  }

  return `${prefix}${String(nextSeq).padStart(5, '0')}`;
}

/**
 * Create a new deal row. Returns the inserted row including the
 * server-minted `deal_code` so the UI can render it immediately.
 *
 * Stage defaults to 'New Lead' (the DB default) when omitted.
 */
export async function POST(request: Request) {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;

    const parsed = await parseBody(request, CreateDealSchema);
    if (!parsed.ok) return parsed.response;

    const { orgId, supabase } = context;
    const body = parsed.data;

    // If the caller passed a company_id, sanity-check it lives in the same
    // org. Service-role would bypass RLS — we use the user-context client
    // here, so a wrong-org company simply won't be visible and we return 422.
    if (body.company_id) {
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .select('id')
        .eq('id', body.company_id)
        .eq('org_id', orgId)
        .maybeSingle();
      if (companyError) throw companyError;
      if (!company) {
        return NextResponse.json(
          { success: false, error: 'company_id not found in this org' },
          { status: 422 }
        );
      }
    }

    const buildPayload = async (): Promise<DealInsert> => {
      const dealCode = await mintNextDealCode(supabase);
      const insert: DealInsert = {
        org_id: orgId,
        title: body.title,
        deal_code: dealCode,
      };
      if (body.company_id !== undefined) insert.company_id = body.company_id;
      if (body.stage !== undefined) insert.stage = body.stage;
      if (body.product !== undefined) insert.product = body.product;
      if (body.value_usd !== undefined) insert.value_usd = body.value_usd;
      if (body.quantity_mt !== undefined) insert.quantity_mt = body.quantity_mt;
      if (body.incoterm !== undefined) insert.incoterm = body.incoterm;
      if (body.port_loading !== undefined) insert.port_loading = body.port_loading;
      if (body.port_discharge !== undefined) insert.port_discharge = body.port_discharge;
      if (body.payment_terms !== undefined) insert.payment_terms = body.payment_terms;
      if (body.expected_close_date !== undefined) {
        insert.expected_close_date = body.expected_close_date;
      }
      if (body.notes !== undefined) insert.notes = body.notes;
      if (body.tags !== undefined) insert.tags = body.tags;
      return insert;
    };

    // First attempt — if the unique index on deal_code rejects due to a race
    // with a concurrent insert, recompute and retry once. Beyond that we
    // surface the error rather than spin.
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const payload = await buildPayload();
      const { data, error } = await supabase
        .from('deals_pipeline')
        .insert(payload)
        .select('id, deal_code, stage, title, value_usd, product, company_id, created_at')
        .single();

      if (!error && data) {
        return NextResponse.json({ success: true, deal: data });
      }

      lastError = error;
      // Postgres unique_violation code is '23505'. Only retry on that.
      if (error?.code !== '23505') break;
    }

    throw lastError ?? new Error('Failed to create deal');
  } catch (error: unknown) {
    console.error('POST /api/deals error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

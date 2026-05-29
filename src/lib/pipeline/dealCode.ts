import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

/**
 * Mint the next `deal_code` for a new row, following the
 * `<PREFIX>-<year>-<5-digit-seq>` pattern.
 *
 * Sequence is PER-ORG — the unique index `deals_pipeline_deal_code_org_uidx`
 * (`20260522120000_per_org_deal_code.sql`) is keyed on `(org_id, deal_code)`, so
 * each tenant has its own counter. Prefix comes from
 * `organizations.deal_code_prefix` (default `'LEAD-OPP'`).
 *
 * Race window: between SELECT MAX and INSERT a concurrent row could mint the
 * same code; the unique index rejects the duplicate (Postgres 23505) and the
 * caller should retry once with a freshly-recomputed max.
 */
export async function mintNextDealCode(
  supabase: SupabaseClient<Database>,
  orgId: string,
): Promise<string> {
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('deal_code_prefix')
    .eq('id', orgId)
    .maybeSingle();
  if (orgError) throw orgError;

  const dealCodePrefix = org?.deal_code_prefix ?? 'LEAD-OPP';
  const year = new Date().getUTCFullYear();
  const prefix = `${dealCodePrefix}-${year}-`;

  const { data, error } = await supabase
    .from('deals_pipeline')
    .select('deal_code')
    .eq('org_id', orgId)
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

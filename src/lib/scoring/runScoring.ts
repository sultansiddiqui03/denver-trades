import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import { scoreBuyerFit, type BuyerFitOrg } from './buyerFit';

export interface ScoreRunResult {
  processed: number;
  scored: number;
}

/**
 * Score (and persist) buyer-fit for an org's companies. Shared by the
 * user-facing rescore route and the admin backfill so the persisted shape
 * can never drift. Per-row update failures are logged and skipped rather than
 * aborting the batch.
 */
export async function scoreOrgCompanies(
  supabase: SupabaseClient<Database>,
  orgId: string,
  opts: { limit?: number; companyIds?: string[] } = {},
): Promise<ScoreRunResult> {
  const { limit = 500, companyIds } = opts;

  const { data: org } = await supabase
    .from('organizations')
    .select('commodities, target_markets')
    .eq('id', orgId)
    .maybeSingle();

  const orgProfile: BuyerFitOrg = {
    commodities: org?.commodities ?? [],
    target_markets: org?.target_markets ?? [],
  };

  let query = supabase
    .from('companies')
    .select(
      'id, type, products_dealt, origin_countries, destination_countries, hq_country, total_shipments, last_shipment_date, hs_codes',
    )
    .eq('org_id', orgId)
    .limit(limit);
  if (companyIds && companyIds.length > 0) {
    query = query.in('id', companyIds);
  }

  const { data: companies, error } = await query;
  if (error) {
    throw new Error(`Failed to load companies for scoring: ${error.message}`);
  }

  const rows = companies ?? [];
  const scoredAt = new Date().toISOString();
  let scored = 0;

  for (const company of rows) {
    const result = scoreBuyerFit(company, orgProfile);
    const breakdown = {
      ...result.breakdown,
      reasons: result.reasons,
    } as unknown as Json;

    const { error: updateError } = await supabase
      .from('companies')
      .update({
        buyer_fit_score: result.score,
        score_breakdown: breakdown,
        scored_at: scoredAt,
      })
      .eq('id', company.id)
      .eq('org_id', orgId);

    if (updateError) {
      console.error(`Buyer-fit update failed for company ${company.id}:`, updateError);
    } else {
      scored++;
    }
  }

  return { processed: rows.length, scored };
}

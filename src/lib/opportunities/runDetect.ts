import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import {
  detectDemandOpportunity,
  detectSwitchOpportunity,
  detectFitBuyerOpportunity,
  type OpportunityCandidate,
  type OppOrg,
  type CompanyLike,
  type DemandLike,
} from './detect';

/** Opportunities at/above this priority also raise a notification. */
const NOTIFY_THRESHOLD = 80;

const COMPANY_COLS =
  'id, name, type, products_dealt, hs_codes, buyer_fit_score, sourcing_signal';

async function loadOrgProfile(
  supabase: SupabaseClient<Database>,
  orgId: string,
): Promise<OppOrg> {
  const { data } = await supabase
    .from('organizations')
    .select('commodities, target_markets')
    .eq('id', orgId)
    .maybeSingle();
  return { commodities: data?.commodities ?? [], target_markets: data?.target_markets ?? [] };
}

function toCompanyLike(row: {
  id: string;
  name: string;
  type: string | null;
  products_dealt: string[] | null;
  hs_codes: Json | null;
  buyer_fit_score: number | null;
  sourcing_signal: Json | null;
}): CompanyLike {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    products_dealt: row.products_dealt,
    hs_codes: row.hs_codes,
    buyer_fit_score: row.buyer_fit_score,
    sourcing_signal: (row.sourcing_signal ?? null) as CompanyLike['sourcing_signal'],
  };
}

/**
 * Upsert candidates (deduped by dedupe_key) and raise notifications for newly
 * inserted high-priority ones. `ignoreDuplicates` => existing opportunities
 * (including dismissed ones) are left untouched, and only genuinely new rows
 * come back to notify on. Returns the count of new opportunities.
 */
async function persistCandidates(
  supabase: SupabaseClient<Database>,
  orgId: string,
  candidates: (OpportunityCandidate | null)[],
): Promise<number> {
  const valid = candidates.filter((c): c is OpportunityCandidate => c !== null);
  if (valid.length === 0) return 0;

  const rows = valid.map((c) => ({
    org_id: orgId,
    type: c.type,
    title: c.title,
    summary: c.summary,
    priority: c.priority,
    company_id: c.companyId ?? null,
    thread_id: c.threadId ?? null,
    product: c.product ?? null,
    evidence: (c.evidence ?? null) as Json,
    dedupe_key: c.dedupeKey,
    status: 'new',
  }));

  const { data, error } = await supabase
    .from('opportunities')
    .upsert(rows, { onConflict: 'org_id,dedupe_key', ignoreDuplicates: true })
    .select('id, title, summary, priority');

  if (error) {
    console.error('Opportunity upsert failed:', error);
    return 0;
  }

  const inserted = data ?? [];
  const notifs = inserted
    .filter((o) => (o.priority ?? 0) >= NOTIFY_THRESHOLD)
    .map((o) => ({
      org_id: orgId,
      type: 'opportunity',
      title: o.title,
      body: o.summary,
      link: '/dashboard/opportunities',
      is_read: false,
    }));
  if (notifs.length > 0) {
    const { error: notifErr } = await supabase.from('notifications').insert(notifs);
    if (notifErr) console.error('Opportunity notification insert failed:', notifErr);
  }

  return inserted.length;
}

/** Real-time: a single inbound demand just landed (WhatsApp webhook). */
export async function detectFromDemand(
  supabase: SupabaseClient<Database>,
  orgId: string,
  threadId: string,
  demand: DemandLike,
): Promise<number> {
  const org = await loadOrgProfile(supabase, orgId);
  return persistCandidates(supabase, orgId, [
    detectDemandOpportunity(demand, threadId, org),
  ]);
}

/** Real-time: a company was just scraped/scored/signalled. */
export async function detectFromCompany(
  supabase: SupabaseClient<Database>,
  orgId: string,
  companyId: string,
): Promise<number> {
  const org = await loadOrgProfile(supabase, orgId);
  const { data } = await supabase
    .from('companies')
    .select(COMPANY_COLS)
    .eq('id', companyId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (!data) return 0;
  const company = toCompanyLike(data);
  return persistCandidates(supabase, orgId, [
    detectSwitchOpportunity(company, org),
    detectFitBuyerOpportunity(company, org),
  ]);
}

/** Full sweep for an org — used by the rescan endpoint / backfill. */
export async function detectAndStoreForOrg(
  supabase: SupabaseClient<Database>,
  orgId: string,
): Promise<number> {
  const org = await loadOrgProfile(supabase, orgId);
  const candidates: (OpportunityCandidate | null)[] = [];

  const { data: threads } = await supabase
    .from('outreach_threads')
    .select('id, extracted_demand')
    .eq('org_id', orgId)
    .eq('direction', 'Inbound')
    .not('extracted_demand', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50);
  for (const t of threads ?? []) {
    const d = t.extracted_demand as DemandLike | null;
    if (d?.product) candidates.push(detectDemandOpportunity(d, t.id, org));
  }

  const { data: companies } = await supabase
    .from('companies')
    .select(COMPANY_COLS)
    .eq('org_id', orgId)
    .limit(500);
  for (const row of companies ?? []) {
    const company = toCompanyLike(row);
    candidates.push(detectSwitchOpportunity(company, org));
    candidates.push(detectFitBuyerOpportunity(company, org));
  }

  return persistCandidates(supabase, orgId, candidates);
}

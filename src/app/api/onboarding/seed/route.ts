import { NextResponse } from 'next/server';
import { requireOnboardingContext } from '@/lib/auth/server';
import { getSupabaseServiceClient } from '@/lib/supabase/admin';
import { getErrorMessage } from '@/lib/errors';
import type { TablesInsert } from '@/lib/supabase/database.types';

type CompanyInsert = TablesInsert<'companies'>;
type DealInsert = TablesInsert<'deals_pipeline'>;

/**
 * Sample spice-trade data so a brand-new dashboard isn't empty.
 *
 * Picked to demonstrate the three trade roles + the two ends of the deal
 * pipeline. Names are realistic placeholders, not real companies.
 */
const SAMPLE_COMPANIES: Omit<CompanyInsert, 'org_id'>[] = [
  {
    name: 'Al Khaleej Spice Imports LLC',
    type: 'Importer',
    hq_country: 'United Arab Emirates',
    hq_city: 'Dubai',
    origin_countries: ['India', 'Vietnam'],
    destination_countries: ['United Arab Emirates', 'Saudi Arabia'],
    products_dealt: ['Black Pepper', 'Cardamom', 'Turmeric'],
    description:
      'UAE-based wholesale buyer servicing GCC food processors. Container-load orders, LC at sight, prefers CIF Jebel Ali.',
    is_enriched: true,
    enriched_at: new Date().toISOString(),
    enrichment_source: 'seed:onboarding',
    // confidence_score is numeric(3,2) — a 0-1 decimal rendered as "N% match"
    // (Math.round(score * 100)). NOT a 0-100 integer (that overflows the column).
    confidence_score: 0.8,
    tags: ['sample'],
  },
  {
    name: 'Kerala Cardamom Exports Pvt Ltd',
    type: 'Exporter',
    hq_country: 'India',
    hq_city: 'Kochi',
    origin_countries: ['India'],
    destination_countries: ['United Arab Emirates', 'Saudi Arabia', 'Germany'],
    products_dealt: ['Cardamom', 'Black Pepper', 'Cinnamon', 'Cloves'],
    description:
      'Family-run exporter from Idukki, Kerala. AGMARK-certified cardamom; ships 8L large green and bold grades. FOB Cochin.',
    is_enriched: true,
    enriched_at: new Date().toISOString(),
    enrichment_source: 'seed:onboarding',
    confidence_score: 0.85,
    tags: ['sample'],
  },
  {
    name: 'Singapore Commodity Brokers Pte',
    type: 'Broker',
    hq_country: 'Singapore',
    hq_city: 'Singapore',
    origin_countries: ['India', 'Vietnam', 'Indonesia'],
    destination_countries: ['China', 'Japan', 'United Arab Emirates'],
    products_dealt: ['Black Pepper', 'White Pepper', 'Nutmeg', 'Cassia'],
    description:
      'Asia-Pacific spice intermediary connecting South Asian growers with East Asian buyers. Handles documentation, inspection, and forex.',
    is_enriched: true,
    enriched_at: new Date().toISOString(),
    enrichment_source: 'seed:onboarding',
    confidence_score: 0.75,
    tags: ['sample'],
  },
];

/**
 * Mint the next `deal_code` using the year + per-org sequence convention
 * established by `20260522120000_per_org_deal_code.sql`. Reads the org's
 * `deal_code_prefix` (default `LEAD-OPP`) so a tenant that already renamed
 * their prefix in step 1 still gets correctly-prefixed sample deals.
 */
async function mintNextDealCode(
  admin: ReturnType<typeof getSupabaseServiceClient>,
  orgId: string,
  prefixBase: string
): Promise<string> {
  const year = new Date().getUTCFullYear();
  const prefix = `${prefixBase}-${year}-`;
  const { data, error } = await admin
    .from('deals_pipeline')
    .select('deal_code')
    .eq('org_id', orgId)
    .like('deal_code', `${prefix}%`)
    .order('deal_code', { ascending: false })
    .limit(1);

  if (error) throw error;

  let next = 1;
  const latest = data?.[0]?.deal_code;
  if (latest) {
    const m = /(\d+)$/.exec(latest);
    if (m) next = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${String(next).padStart(5, '0')}`;
}

/**
 * Onboarding Step 3 — seed three demo companies + two demo deals. Idempotent
 * by tag: re-running the seed for an org that already has any
 * `tags @> {sample}` rows is a no-op. Marks `onboarding_complete = true`
 * and clears `onboarding_step` on success.
 */
export async function POST() {
  try {
    const { context, response } = await requireOnboardingContext();
    if (!context) return response;

    const { user, profile } = context;
    const orgId = profile.org_id;

    if (!orgId) {
      return NextResponse.json(
        { success: false, error: 'Create an organization first (step 1)' },
        { status: 409 }
      );
    }

    const admin = getSupabaseServiceClient();

    // Idempotency check — if the user clicked Yes twice we don't want to
    // double-insert. Look for any company tagged `sample` already.
    const { data: existingSample, error: checkErr } = await admin
      .from('companies')
      .select('id')
      .eq('org_id', orgId)
      .contains('tags', ['sample'])
      .limit(1);

    if (checkErr) throw checkErr;

    // Read the org's deal_code prefix (default `LEAD-OPP`) so demo deals
    // line up with the tenant's chosen naming.
    const { data: orgRow, error: orgFetchErr } = await admin
      .from('organizations')
      .select('deal_code_prefix')
      .eq('id', orgId)
      .maybeSingle();
    if (orgFetchErr) throw orgFetchErr;
    const dealPrefix = orgRow?.deal_code_prefix ?? 'LEAD-OPP';

    let createdCompanies = 0;
    let createdDeals = 0;
    let importerId: string | null = null;
    let exporterId: string | null = null;

    if (!existingSample?.length) {
      const inserts: CompanyInsert[] = SAMPLE_COMPANIES.map((c) => ({
        ...c,
        org_id: orgId,
      }));

      const { data: rows, error: insertErr } = await admin
        .from('companies')
        .insert(inserts)
        .select('id, type');

      if (insertErr) throw insertErr;

      createdCompanies = rows?.length ?? 0;
      importerId = rows?.find((r) => r.type === 'Importer')?.id ?? null;
      exporterId = rows?.find((r) => r.type === 'Exporter')?.id ?? null;

      const deals: DealInsert[] = [];
      if (importerId) {
        deals.push({
          org_id: orgId,
          company_id: importerId,
          deal_code: await mintNextDealCode(admin, orgId, dealPrefix),
          title: 'Black Pepper · 20MT · Q1 inquiry',
          stage: 'New Lead',
          product: 'Black Pepper',
          quantity_mt: 20,
          value_usd: 130000,
          incoterm: 'CIF',
          port_loading: 'Cochin',
          port_discharge: 'Jebel Ali',
          payment_terms: 'LC at sight',
          notes:
            'Inquiry received via WhatsApp. Buyer is sourcing for GCC retail. Asked for COA + origin certificate. Sample dispatch.',
          tags: ['sample'],
        });
      }
      if (exporterId) {
        deals.push({
          org_id: orgId,
          company_id: exporterId,
          deal_code: await mintNextDealCode(admin, orgId, dealPrefix),
          title: 'Cardamom 8L Bold · 5MT · negotiation',
          stage: 'Negotiation',
          product: 'Cardamom',
          quantity_mt: 5,
          value_usd: 215000,
          incoterm: 'FOB',
          port_loading: 'Cochin',
          port_discharge: 'Hamburg',
          payment_terms: '30% advance, 70% on B/L',
          notes:
            'Exporter offer at USD 43/kg FOB. German importer counter at USD 39. Awaiting our broker response.',
          tags: ['sample'],
        });
      }

      if (deals.length) {
        const { error: dealsErr } = await admin
          .from('deals_pipeline')
          .insert(deals);
        if (dealsErr) throw dealsErr;
        createdDeals = deals.length;
      }
    }

    // Mark onboarding complete on the org + clear the step counter on the
    // user. This is the canonical "finish" path; the explicit
    // `/api/onboarding/complete` endpoint exists only for the
    // skip-sample-data branch.
    const { error: orgErr } = await admin
      .from('organizations')
      .update({ onboarding_complete: true })
      .eq('id', orgId);
    if (orgErr) throw orgErr;

    const { error: userErr } = await admin
      .from('users')
      .update({ onboarding_step: null })
      .eq('id', user.id);
    if (userErr) throw userErr;

    return NextResponse.json({
      success: true,
      seeded: !existingSample?.length,
      companies_created: createdCompanies,
      deals_created: createdDeals,
    });
  } catch (error: unknown) {
    console.error('POST /api/onboarding/seed error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

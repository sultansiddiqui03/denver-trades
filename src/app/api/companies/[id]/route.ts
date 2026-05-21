import { NextResponse } from 'next/server';
import { requireUserContext } from '@/lib/auth/server';
import { getErrorMessage } from '@/lib/errors';

const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * GET /api/companies/[id]
 *
 * Returns the full company row scoped to the caller's org. Used by the
 * outreach page to hydrate prefilled fields beyond what the URL query
 * params carry (e.g. when the user lands from `?companyId=` and we want
 * the products_dealt, description, etc. without forcing the dossier page
 * to do the work).
 *
 * Auth: `requireUserContext()` — RLS scopes the select to the user's org.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;

    const { id } = await ctx.params;
    if (!UUID_PATTERN.test(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid company id' },
        { status: 400 }
      );
    }

    const { orgId, supabase } = context;
    const { data, error } = await supabase
      .from('companies')
      .select(
        'id, name, type, hq_city, hq_country, website, description, products_dealt, origin_countries, destination_countries, contacts, is_enriched, is_favorited, enriched_at, enrichment_source, confidence_score, tags, created_at, updated_at'
      )
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json(
        { success: false, error: 'Company not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, company: data });
  } catch (error: unknown) {
    console.error('GET /api/companies/[id] error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

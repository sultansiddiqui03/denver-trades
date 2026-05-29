import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getErrorMessage } from '@/lib/errors';
import { requireUserContext } from '@/lib/auth/server';
import { parseBody } from '@/lib/validation';
import { mintNextDealCode } from '@/lib/pipeline/dealCode';
import type { TablesInsert } from '@/lib/supabase/database.types';

const Schema = z.object({
  status: z.enum(['new', 'viewed', 'acted', 'dismissed']),
});

// Next 16: params is a Promise.
interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Update an opportunity's status. Crucially, when an opportunity is marked
 * `acted` (and wasn't already), it converts into a real pipeline deal — minting
 * a deal_code, seeding the deal from the opportunity's company/product/evidence,
 * and raising a notification. This is what turns the discover → score →
 * opportunity funnel into actual deal motion instead of a dead-ended status flip.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;
    const { orgId, supabase } = context;
    const { id } = await params;

    const parsed = await parseBody(request, Schema);
    if (!parsed.ok) return parsed.response;
    const nextStatus = parsed.data.status;

    // Load the opportunity first so we can (a) detect the transition into
    // `acted` and (b) seed a deal from its fields.
    const { data: opp, error: oppError } = await supabase
      .from('opportunities')
      .select('id, status, type, title, summary, product, company_id, evidence')
      .eq('id', id)
      .eq('org_id', orgId)
      .maybeSingle();
    if (oppError) throw new Error(oppError.message);
    if (!opp) {
      return NextResponse.json({ success: false, error: 'Opportunity not found' }, { status: 404 });
    }

    const { data: updated, error: updateError } = await supabase
      .from('opportunities')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('org_id', orgId)
      .select('id, status')
      .maybeSingle();
    if (updateError) throw new Error(updateError.message);

    let deal: { id: string; deal_code: string | null } | null = null;
    const becameActed = nextStatus === 'acted' && opp.status !== 'acted' && Boolean(opp.company_id);

    if (becameActed) {
      try {
        const product = opp.product ?? null;
        const title = product ? `${product} — ${opp.title}` : opp.title;
        const notes =
          [opp.summary, evidenceToNote(opp.evidence)].filter(Boolean).join('\n\n') || null;

        // Mint + insert with a single retry on the unique-code race.
        for (let attempt = 0; attempt < 2; attempt++) {
          const dealCode = await mintNextDealCode(supabase, orgId);
          const insert: TablesInsert<'deals_pipeline'> = {
            org_id: orgId,
            title: title.slice(0, 200),
            deal_code: dealCode,
            stage: 'New Lead',
            company_id: opp.company_id,
            product,
            notes,
            tags: ['from-opportunity', opp.type],
          };
          const { data: dealRow, error: dealError } = await supabase
            .from('deals_pipeline')
            .insert(insert)
            .select('id, deal_code')
            .single();
          if (!dealError && dealRow) {
            deal = dealRow;
            break;
          }
          if (dealError?.code !== '23505') throw dealError;
        }

        if (deal) {
          // Best-effort notification — never fail the action if this errors.
          await supabase.from('notifications').insert({
            org_id: orgId,
            user_id: context.user.id,
            type: 'deal',
            title: 'Opportunity converted to a deal',
            body: `${deal.deal_code ?? 'New deal'} created from "${opp.title}".`,
            link: '/dashboard/pipeline',
          });
        }
      } catch (dealErr) {
        // Status update already succeeded; surface the deal failure softly.
        console.error('Opportunity→deal conversion failed:', dealErr);
      }
    }

    return NextResponse.json({ success: true, opportunity: updated, deal });
  } catch (error: unknown) {
    console.error('Update opportunity error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 },
    );
  }
}

/** Render an opportunity's evidence jsonb into a short note for the deal. */
function evidenceToNote(evidence: unknown): string | null {
  if (!evidence || typeof evidence !== 'object') return null;
  const e = evidence as Record<string, unknown>;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(e)) {
    if (v == null) continue;
    const val = Array.isArray(v) ? v.slice(0, 5).join(', ') : String(v);
    if (val) parts.push(`${k}: ${val}`);
  }
  return parts.length ? `Evidence — ${parts.slice(0, 6).join(' · ')}` : null;
}

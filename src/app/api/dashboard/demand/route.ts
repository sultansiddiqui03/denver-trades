import { NextResponse } from 'next/server';
import { requireUserContext } from '@/lib/auth/server';
import { getErrorMessage } from '@/lib/errors';

/**
 * Active Demand feed for the dashboard overview — the wedge over Tradyon
 * (whose flow is pure outbound enrichment). Returns the 8 most recent inbound
 * WhatsApp threads where Gemini extracted a real buyer demand signal.
 *
 * The partial index
 *   idx_outreach_threads_active_demand
 *   ON (org_id, created_at DESC)
 *   WHERE direction='Inbound' AND extracted_demand->>'has_demand'='true'
 * makes this a single index scan.
 */

export interface DemandFeedItem {
  id: string;
  company_id: string | null;
  company_name: string;
  product: string | null;
  quantity_amount: number | null;
  quantity_unit: string | null;
  incoterm: string | null;
  destination_port: string | null;
  destination_country: string | null;
  deadline_iso: string | null;
  raw_intent: string | null;
  created_at: string;
}

interface ExtractedDemandShape {
  has_demand?: boolean;
  product?: string | null;
  quantity_amount?: number | null;
  quantity_unit?: string | null;
  incoterm?: string | null;
  destination_port?: string | null;
  destination_country?: string | null;
  deadline_iso?: string | null;
  raw_intent?: string | null;
}

export async function GET() {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;

    const { supabase, orgId } = context;

    const { data, error } = await supabase
      .from('outreach_threads')
      .select(
        `id,
         company_id,
         created_at,
         sender,
         extracted_demand,
         company:company_id ( id, name )`
      )
      .eq('org_id', orgId)
      .eq('direction', 'Inbound')
      .filter('extracted_demand->>has_demand', 'eq', 'true')
      .order('created_at', { ascending: false })
      .limit(8);

    if (error) {
      throw error;
    }

    const rows = data ?? [];
    const items: DemandFeedItem[] = rows.map((row) => {
      const demand = (row.extracted_demand ?? {}) as ExtractedDemandShape;
      const company = row.company as { id: string; name: string } | null;
      const companyName = company?.name ?? row.sender ?? 'Unknown buyer';

      return {
        id: row.id,
        company_id: row.company_id,
        company_name: companyName,
        product: demand.product ?? null,
        quantity_amount: demand.quantity_amount ?? null,
        quantity_unit: demand.quantity_unit ?? null,
        incoterm: demand.incoterm ?? null,
        destination_port: demand.destination_port ?? null,
        destination_country: demand.destination_country ?? null,
        deadline_iso: demand.deadline_iso ?? null,
        raw_intent: demand.raw_intent ?? null,
        created_at: row.created_at ?? new Date().toISOString(),
      };
    });

    return NextResponse.json({ success: true, items });
  } catch (error: unknown) {
    console.error('Active demand feed error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

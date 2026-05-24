import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import { computeSourcingSignal, type SignalShipment } from './supplierShift';

/**
 * Load a company's shipments, compute the supplier-shift signal, and persist it
 * on `companies.sourcing_signal`. Returns true if a signal was produced.
 * Called at scrape ingest (best-effort) and available for backfills.
 */
export async function computeAndStoreSourcingSignal(
  supabase: SupabaseClient<Database>,
  companyId: string,
): Promise<boolean> {
  const { data: shipments, error } = await supabase
    .from('shipments')
    .select(
      'supplier_name, origin_country, destination_country, product, shipment_date, quantity_mt, weight_kg',
    )
    .eq('company_id', companyId)
    .order('shipment_date', { ascending: false })
    .limit(500);

  if (error) {
    throw new Error(`Failed to load shipments for sourcing signal: ${error.message}`);
  }

  const signal = computeSourcingSignal((shipments ?? []) as SignalShipment[]);

  const { error: updateError } = await supabase
    .from('companies')
    .update({
      sourcing_signal: (signal as unknown as Json) ?? null,
      sourcing_signal_at: new Date().toISOString(),
    })
    .eq('id', companyId);

  if (updateError) {
    throw new Error(`Failed to persist sourcing signal: ${updateError.message}`);
  }

  return signal !== null;
}

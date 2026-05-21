import 'server-only';
import type { UserContext } from '@/lib/auth/server';

export interface PriceRecord {
  id: string;
  commodity: string;
  price_usd: number;
  origin_country: string;
  unit: string;
  source: string;
  recorded_at: string;
}

/**
 * Shared prices fetch used by both `/api/prices` (user-context branch)
 * and the Server-Component rendered `/dashboard/prices` page.
 *
 * Note: `commodity_prices` is intentionally global (no org_id filter) — see
 * P1-11 in ROADMAP.md. The user-context Supabase client respects the
 * `USING (true)` RLS policy on that table.
 */
export async function fetchPrices(
  context: Pick<UserContext, 'supabase'>
): Promise<PriceRecord[]> {
  const { supabase } = context;

  const { data, error } = await supabase
    .from('commodity_prices')
    .select('*')
    .order('commodity', { ascending: true })
    .order('recorded_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as PriceRecord[];
}

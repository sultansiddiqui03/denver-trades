import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { normalizeProductQuery } from '@/lib/agents/productQuery';

/**
 * Count the companies in an org that match a saved search's free-text query.
 * Keyword match across name / description / products (the same surfaces the
 * live search scores). Used by the saved-searches API (to seed
 * last_result_count) and the daily cron (to detect new matches for alerts).
 */
export async function countSavedSearchMatches(
  supabase: SupabaseClient<Database>,
  orgId: string,
  query: string,
): Promise<number> {
  const product = normalizeProductQuery(query);
  const keywords = product.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
  if (keywords.length === 0) return 0;

  const { data } = await supabase
    .from('companies')
    .select('name, description, products_dealt')
    .eq('org_id', orgId)
    .limit(2000);
  if (!data) return 0;

  let count = 0;
  for (const c of data) {
    const hay = [c.name, c.description, ...((c.products_dealt as string[] | null) ?? [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (keywords.some((k) => hay.includes(k))) count++;
  }
  return count;
}

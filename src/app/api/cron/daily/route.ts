import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/lib/supabase/admin';
import { getErrorMessage } from '@/lib/errors';
import { isAutomationAuthorized } from '@/lib/security/request';
import { detectAndStoreForOrg } from '@/lib/opportunities/runDetect';
import { computeAndStoreSourcingSignal } from '@/lib/signals/runSignals';
import { countSavedSearchMatches } from '@/lib/search/savedSearch';

/**
 * Daily maintenance sweep across ALL orgs (Vercel cron — auth via the native
 * `Authorization: Bearer ${CRON_SECRET}` header). Folds three jobs into ONE
 * cron entry so we stay within the Hobby plan's 2-cron limit (alongside
 * /api/prices):
 *   1. Opportunity sweep — detectAndStoreForOrg surfaces new demand/switch/
 *      fit-buyer opportunities that reactive triggers may have missed.
 *   2. Saved-search alerts — re-count alert-enabled saved searches and notify
 *      when new matches have appeared since the last run.
 *   3. Sourcing-signal refresh — recompute the supplier-shift signal for a
 *      bounded set of companies whose signal has gone stale.
 *
 * Every step is wrapped so one org's failure can't abort the rest.
 */
export const maxDuration = 300;

const STALE_SIGNAL_MS = 7 * 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  if (!isAutomationAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseServiceClient();
  const summary = { orgs: 0, opportunities: 0, alerts: 0, signals: 0, errors: 0 };

  const { data: orgs, error } = await supabase.from('organizations').select('id');
  if (error) {
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }

  for (const org of orgs ?? []) {
    const orgId = org.id;
    summary.orgs++;

    // 1. Opportunity sweep.
    try {
      summary.opportunities += await detectAndStoreForOrg(supabase, orgId);
    } catch (e) {
      summary.errors++;
      console.error(`cron/daily: opportunity sweep failed for ${orgId}:`, e);
    }

    // 2. Saved-search alerts.
    try {
      const { data: searches } = await supabase
        .from('saved_searches')
        .select('id, name, query, last_result_count')
        .eq('org_id', orgId)
        .eq('alert_enabled', true);
      for (const s of searches ?? []) {
        try {
          const current = await countSavedSearchMatches(supabase, orgId, s.query);
          const prev = s.last_result_count ?? 0;
          if (current > prev) {
            const delta = current - prev;
            await supabase.from('notifications').insert({
              org_id: orgId,
              type: 'saved_search',
              title: `${delta} new match${delta === 1 ? '' : 'es'} for "${s.name}"`,
              body: `Your saved search now matches ${current} compan${current === 1 ? 'y' : 'ies'}.`,
              link: `/dashboard/search?q=${encodeURIComponent(s.query)}`,
            });
            summary.alerts++;
          }
          if (current !== prev) {
            await supabase
              .from('saved_searches')
              .update({ last_result_count: current, updated_at: new Date().toISOString() })
              .eq('id', s.id);
          }
        } catch (e) {
          summary.errors++;
          console.error(`cron/daily: saved-search alert failed (${s.id}):`, e);
        }
      }
    } catch (e) {
      summary.errors++;
      console.error(`cron/daily: saved-search step failed for ${orgId}:`, e);
    }

    // 3. Sourcing-signal refresh — bounded to stale rows so the cron stays fast.
    try {
      const staleCutoff = new Date(Date.now() - STALE_SIGNAL_MS).toISOString();
      const { data: stale } = await supabase
        .from('companies')
        .select('id')
        .eq('org_id', orgId)
        .not('total_shipments', 'is', null)
        .or(`sourcing_signal_at.is.null,sourcing_signal_at.lt.${staleCutoff}`)
        .limit(25);
      for (const c of stale ?? []) {
        try {
          await computeAndStoreSourcingSignal(supabase, c.id);
          summary.signals++;
        } catch (e) {
          console.error(`cron/daily: signal recompute failed (${c.id}):`, e);
        }
      }
    } catch (e) {
      summary.errors++;
      console.error(`cron/daily: signal step failed for ${orgId}:`, e);
    }
  }

  return NextResponse.json({ success: true, ...summary });
}

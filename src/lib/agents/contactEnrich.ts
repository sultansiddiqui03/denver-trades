import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/supabase/database.types';
import { runApifyActorSync } from '@/lib/agents/dispatchScrape';

/**
 * Contact discovery — turn a reachable company into an outreach-ready lead.
 *
 * A buyer-fit score tells you WHO to chase; an email tells you HOW. This crawls
 * a company's website with Apify's Contact Details Scraper
 * (vdrmota/contact-info-scraper) and folds the found emails/phones into the
 * `companies.contacts` jsonb the dossier + outreach already read.
 *
 * HARD DEPENDENCY: a website. Customs profiles frequently lack one, so this
 * no-ops (with a reason) for companies we have no URL for — the honest limit of
 * deriving contacts from bill-of-lading data. Enrich the buyer first (the
 * ImportYeti company lookup sometimes carries a website) before calling this.
 */

const CONTACT_ACTOR = 'vdrmota~contact-info-scraper';

export interface CompanyContact {
  name: string;
  email: string | null;
  phone: string | null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
}

function isContactArray(value: unknown): value is CompanyContact[] {
  return Array.isArray(value);
}

/**
 * Crawl one company's website for contact details and merge them onto the row.
 * Returns the count found (0 with a `skipped` reason when there's nothing to do).
 */
export async function enrichCompanyContacts(
  supabase: SupabaseClient<Database>,
  companyId: string,
): Promise<{ found: number; skipped?: string }> {
  const { data: company } = await supabase
    .from('companies')
    .select('id, website, contacts')
    .eq('id', companyId)
    .maybeSingle();

  if (!company) return { found: 0, skipped: 'company not found' };
  if (!company.website) return { found: 0, skipped: 'no website to crawl' };

  const items = await runApifyActorSync(
    CONTACT_ACTOR,
    {
      // Depth 2 so the crawler reaches /contact and /about pages where emails
      // and phones actually live — a homepage-only crawl usually finds nothing.
      startUrls: [{ url: company.website }],
      mergeContacts: true,
      maxDepth: 2,
      maxRequestsPerStartUrl: 15,
      sameDomain: true,
      proxyConfig: { useApifyProxy: true },
    },
    { timeoutSecs: 110 },
  );

  const emails = new Set<string>();
  const phones = new Set<string>();
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    asStringArray(obj.emails).forEach((e) => emails.add(e.toLowerCase()));
    asStringArray(obj.phones).forEach((p) => phones.add(p));
    asStringArray(obj.phonesUncertain).forEach((p) => phones.add(p));
  }

  if (emails.size === 0 && phones.size === 0) {
    return { found: 0, skipped: 'no contacts found on site' };
  }

  // Preserve any existing named contacts, then append the discovered ones.
  const existing = isContactArray(company.contacts) ? (company.contacts as CompanyContact[]) : [];
  const emailList = [...emails].slice(0, 10);
  const phoneList = [...phones].slice(0, 10);
  const discovered: CompanyContact[] = [];
  const rows = Math.max(emailList.length, phoneList.length);
  for (let i = 0; i < rows; i++) {
    discovered.push({
      name: i === 0 ? 'Website contact' : `Website contact ${i + 1}`,
      email: emailList[i] ?? null,
      phone: phoneList[i] ?? null,
    });
  }

  // Dedupe against existing contacts by email.
  const seen = new Set(existing.map((c) => (c.email ?? '').toLowerCase()).filter(Boolean));
  const merged = [...existing];
  for (const c of discovered) {
    const key = (c.email ?? '').toLowerCase();
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    merged.push(c);
  }

  const { error } = await supabase
    .from('companies')
    .update({ contacts: merged as unknown as Json })
    .eq('id', companyId);
  if (error) {
    console.error(`enrichCompanyContacts: update failed for ${companyId}:`, error);
    return { found: 0, skipped: 'update failed' };
  }
  return { found: discovered.length };
}

/**
 * Batch contact discovery for an org's buyers that ARE reachable (have a website)
 * but don't yet have contacts. Bounded by `limit` — each is one Apify run.
 */
export async function enrichOrgBuyerContacts(
  supabase: SupabaseClient<Database>,
  orgId: string,
  limit = 5,
): Promise<{ attempted: number; withContacts: number; skipped: number }> {
  const { data: rows } = await supabase
    .from('companies')
    .select('id, website, contacts')
    .eq('org_id', orgId)
    .eq('type', 'Importer')
    .not('website', 'is', null)
    .limit(50);

  if (!rows || rows.length === 0) return { attempted: 0, withContacts: 0, skipped: 0 };

  // Prefer companies that don't already have contacts.
  const targets = rows
    .filter((r) => !isContactArray(r.contacts) || (r.contacts as CompanyContact[]).length === 0)
    .slice(0, limit);

  let withContacts = 0;
  let skipped = 0;
  for (const t of targets) {
    try {
      const result = await enrichCompanyContacts(supabase, t.id);
      if (result.found > 0) withContacts++;
      else skipped++;
    } catch (e) {
      console.error(`enrichOrgBuyerContacts: failed for ${t.id}:`, e);
      skipped++;
    }
  }

  return { attempted: targets.length, withContacts, skipped };
}

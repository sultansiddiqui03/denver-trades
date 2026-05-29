import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { discoverBuyersForProduct } from '@/lib/agents/buyerDiscovery';
import { getMarketIntel } from '@/lib/agents/marketIntel';
import { generateText } from '@/lib/ai/router';
import { mintNextDealCode } from '@/lib/pipeline/dealCode';
import { findExistingCompany } from '@/lib/entity/companyMatch';
import { normalizeProductQuery } from '@/lib/agents/productQuery';

/**
 * The assistant's agentic toolset. Every tool is org-scoped via the closed-over
 * `orgId` and runs the SAME production logic the rest of the app uses — so when
 * the assistant "finds buyers" or "creates a deal", it's doing the real thing,
 * not faking it. Returns are kept compact (the model narrates the result).
 *
 * Uses the service-role client: the caller (POST /api/assistant) has already
 * authenticated the user via requireUserContext and passes their orgId, so all
 * queries here are explicitly org-scoped.
 */
export function buildAssistantTools(supabase: SupabaseClient<Database>, orgId: string) {
  const hasApify = Boolean(process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN);

  return {
    get_context: tool({
      description:
        "Get a snapshot of the user's workspace: what they trade, target markets, and counts of companies, deals, and open opportunities, plus the highest-priority opportunities. Call this first when you need situational awareness.",
      inputSchema: z.object({}),
      execute: async () => {
        const [{ data: org }, companies, deals, opps] = await Promise.all([
          supabase.from('organizations').select('name, commodities, target_markets').eq('id', orgId).maybeSingle(),
          supabase.from('companies').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
          supabase.from('deals_pipeline').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
          supabase
            .from('opportunities')
            .select('title, type, priority, status')
            .eq('org_id', orgId)
            .in('status', ['new', 'viewed'])
            .order('priority', { ascending: false })
            .limit(5),
        ]);
        return {
          org: org?.name ?? null,
          sells: org?.commodities ?? [],
          targetMarkets: org?.target_markets ?? [],
          companies: companies.count ?? 0,
          deals: deals.count ?? 0,
          topOpportunities: (opps.data ?? []).map((o) => ({ title: o.title, type: o.type, priority: o.priority })),
        };
      },
    }),

    search_companies: tool({
      description:
        'Search the org\'s existing companies/buyers by keyword (product or name). Returns the top matches with their buyer-fit score and shipment volume.',
      inputSchema: z.object({ query: z.string().describe('Product or company keyword, e.g. "pepper" or "Kalustyan"') }),
      execute: async ({ query }) => {
        const product = normalizeProductQuery(query);
        const kw = product.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
        const { data } = await supabase
          .from('companies')
          .select('name, type, hq_country, buyer_fit_score, total_shipments, products_dealt')
          .eq('org_id', orgId)
          .order('buyer_fit_score', { ascending: false, nullsFirst: false })
          .limit(400);
        const matches = (data ?? [])
          .filter((c) => {
            if (kw.length === 0) return true;
            const hay = [c.name, ...((c.products_dealt as string[] | null) ?? [])].join(' ').toLowerCase();
            return kw.some((k) => hay.includes(k));
          })
          .slice(0, 8)
          .map((c) => ({
            name: c.name,
            type: c.type,
            country: c.hq_country,
            fit: c.buyer_fit_score,
            shipments: c.total_shipments,
          }));
        return { count: matches.length, companies: matches };
      },
    }),

    discover_buyers: tool({
      description:
        'Find NEW real US importers (buyers) of a product from live customs records, score them, and add them to the workspace. Use when the user wants buyers/leads for something they sell that they don\'t already have.',
      inputSchema: z.object({ product: z.string().describe('Commodity to find buyers for, e.g. "black pepper"') }),
      execute: async ({ product }) => {
        if (!hasApify) return { error: 'Live discovery is unavailable (APIFY_TOKEN not configured).' };
        const r = await discoverBuyersForProduct(supabase, orgId, product, { maxBuyers: 10 });
        return {
          product: r.product,
          suppliersScanned: r.suppliersScanned,
          relevantSuppliers: r.relevantSuppliers,
          buyersFound: r.candidateBuyers,
          newLeads: r.inserted,
          reachable: r.reachable,
          unreachable: r.unreachable,
          topBuyers: r.buyers.slice(0, 8).map((b) => ({ name: b.name, viaSuppliers: b.viaSuppliers.slice(0, 3) })),
        };
      },
    }),

    market_intel: tool({
      description:
        'Get market intelligence for a product: total trade value, demand by destination country, and average per-unit prices from customs records. Use for "what is X worth / where is demand / what price".',
      inputSchema: z.object({
        product: z.string().describe('Commodity, e.g. "turmeric"'),
        tradeType: z.enum(['import', 'export']).optional(),
      }),
      execute: async ({ product, tradeType }) => {
        if (!hasApify) return { error: 'Market intel is unavailable (APIFY_TOKEN not configured).' };
        const r = await getMarketIntel(supabase, product, tradeType ?? 'export');
        return {
          product: r.product,
          totalRecords: r.totalRecords,
          summary: r.summary,
          topDestinations: r.topDestinations.slice(0, 6),
        };
      },
    }),

    list_opportunities: tool({
      description: 'List the open opportunities (demand matches, supplier-switch signals, new fit buyers), highest priority first.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data } = await supabase
          .from('opportunities')
          .select('id, title, type, priority, summary, status')
          .eq('org_id', orgId)
          .in('status', ['new', 'viewed'])
          .order('priority', { ascending: false })
          .limit(10);
        return { opportunities: data ?? [] };
      },
    }),

    list_deals: tool({
      description: 'List the deals in the pipeline with their stage and value.',
      inputSchema: z.object({}),
      execute: async () => {
        const { data } = await supabase
          .from('deals_pipeline')
          .select('deal_code, title, stage, product, value_usd')
          .eq('org_id', orgId)
          .order('created_at', { ascending: false })
          .limit(15);
        return { deals: data ?? [] };
      },
    }),

    create_deal: tool({
      description:
        'Create a pipeline deal for a company the user wants to pursue. Match by company name. Returns the new deal code.',
      inputSchema: z.object({
        company_name: z.string().describe('The buyer/company name to create the deal for'),
        product: z.string().nullable().optional(),
        title: z.string().nullable().optional(),
        value_usd: z.number().nullable().optional(),
      }),
      execute: async ({ company_name, product, title, value_usd }) => {
        const company = await findExistingCompany(supabase, orgId, company_name);
        if (!company) return { error: `No company named "${company_name}" found. Discover or add it first.` };
        const dealCode = await mintNextDealCode(supabase, orgId);
        const { data, error } = await supabase
          .from('deals_pipeline')
          .insert({
            org_id: orgId,
            company_id: company.id,
            deal_code: dealCode,
            title: (title ?? `${product ?? 'Deal'} — ${company.name}`).slice(0, 200),
            stage: 'New Lead',
            product: product ?? null,
            value_usd: value_usd ?? null,
            tags: ['assistant'],
          })
          .select('deal_code, title, stage')
          .single();
        if (error) return { error: error.message };
        return { created: data, company: company.name };
      },
    }),

    draft_outreach: tool({
      description:
        'Draft a short, professional outreach message to a buyer about a product. Returns the draft text for the user to review/send.',
      inputSchema: z.object({
        company_name: z.string(),
        product: z.string(),
        channel: z.enum(['WhatsApp', 'Email']).optional(),
      }),
      execute: async ({ company_name, product, channel }) => {
        const company = await findExistingCompany(supabase, orgId, company_name);
        const { data: org } = await supabase
          .from('organizations')
          .select('name')
          .eq('id', orgId)
          .maybeSingle();
        const evidence = company?.total_shipments
          ? `They have ${company.total_shipments} customs shipments on record${company.last_shipment_date ? `, most recent ${company.last_shipment_date}` : ''}.`
          : '';
        const prompt = `Write a concise, warm ${channel ?? 'Email'} outreach message from ${org?.name ?? 'our company'} to ${company_name} offering ${product}. ${evidence} Keep it under 120 words, professional, specific, with a clear call to action. No placeholders.`;
        const text = await generateText(prompt, { systemPrompt: 'You are a B2B trade outreach writer. Be specific and credible; never invent facts.' });
        return { draft: text };
      },
    }),
  };
}

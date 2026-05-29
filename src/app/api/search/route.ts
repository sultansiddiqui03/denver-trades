import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateJSON } from '@/lib/ai/gemini';
import { requireUserContext } from '@/lib/auth/server';
import { getErrorMessage } from '@/lib/errors';
import { rateLimitOrThrow } from '@/lib/security/rateLimit';
import { normalizeProductQuery } from '@/lib/agents/productQuery';

const ParsedQuerySchema = z.object({
  keywords: z.array(z.string()).default([]),
  countries: z.array(z.string()).default([]),
  type: z.enum(['Importer', 'Exporter', 'Broker']).nullable().default(null),
});
type ParsedQuery = z.infer<typeof ParsedQuerySchema>;

/**
 * Cheap heuristic parse for short literal queries ("black pepper", "rice
 * importers") — avoids a Gemini call per search. Returns null when the query is
 * complex enough (4+ words, likely a location/intent phrase) to warrant the LLM.
 */
function parseSimpleQuery(raw: string): ParsedQuery | null {
  const words = raw.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 3) return null;
  const lower = raw.toLowerCase();
  const type: ParsedQuery['type'] =
    /\b(importer|importers|buyer|buyers|imports?)\b/.test(lower)
      ? 'Importer'
      : /\b(exporter|exporters|seller|sellers|supplier|suppliers|exports?)\b/.test(lower)
        ? 'Exporter'
        : /\bbroker\b/.test(lower)
          ? 'Broker'
          : null;
  const product = normalizeProductQuery(raw);
  const keywords = product ? product.split(/\s+/).filter(Boolean) : [];
  return { keywords, countries: [], type };
}

export async function GET(request: Request) {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;

    const { orgId, supabase } = context;
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';

    // Skip rate limit for the empty-query "list all" path. AI-burning paths get gated.
    if (query) {
      const limited = rateLimitOrThrow({
        key: `${orgId}:search.keyword`,
        max: 60,
        windowSec: 60,
      });
      if (limited) return limited;
    }

    if (!query) {
      // Return all companies for the org if query is empty
      const { data: companies, error } = await supabase
        .from('companies')
        .select('*')
        .eq('org_id', orgId);

      if (error) throw error;
      return NextResponse.json({ success: true, results: companies });
    }

    // 1. Parse search intent. Skip the LLM for short literal queries (the
    //    common case) — only complex multi-word/location queries hit Gemini.
    let parsed = parseSimpleQuery(query);
    if (!parsed) {
      const systemPrompt = `You are a trade intelligence search parser.
Parse the user's natural language search query into structured search terms.
Format as JSON:
{
  "keywords": ["array of raw product keyword matches like pepper, coriander"],
  "countries": ["array of countries mentioned"],
  "type": "Importer" or "Exporter" or "Broker" or null
}`;
      parsed = await generateJSON(
        `Parse the following search query: "${query}"`,
        ParsedQuerySchema,
        systemPrompt,
      );
    }

    // 2. Perform Postgres query. Push the `type` filter into Postgres and bound
    //    the fetch. We intentionally don't pre-filter by name/description ilike:
    //    that would drop companies matching only on their products_dealt array
    //    (which PostgREST can't substring-match), so ranking stays in JS over a
    //    bounded set. Prefer scored leads + highest-volume buyers first.
    let dbQuery = supabase
      .from('companies')
      .select('*')
      .eq('org_id', orgId)
      .order('buyer_fit_score', { ascending: false, nullsFirst: false })
      .order('total_shipments', { ascending: false, nullsFirst: false });

    if (parsed.type) {
      dbQuery = dbQuery.eq('type', parsed.type);
    }

    const { data: companies, error } = await dbQuery.limit(1000);
    if (error) throw error;

    // 3. Score results client-side (semantic matching overlay)
    const scoredResults = companies.map(company => {
      let score = 0.5; // base score

      // Check keywords
      if (parsed.keywords && parsed.keywords.length > 0) {
        parsed.keywords.forEach(kw => {
          const keyword = kw.toLowerCase();
          if (company.name.toLowerCase().includes(keyword)) score += 0.2;
          if (company.description?.toLowerCase().includes(keyword)) score += 0.15;
          if (company.products_dealt?.some((p: string) => p.toLowerCase().includes(keyword))) score += 0.25;
        });
      }

      // Check countries
      if (parsed.countries && parsed.countries.length > 0) {
        parsed.countries.forEach(c => {
          const country = c.toLowerCase();
          if (company.hq_country?.toLowerCase().includes(country)) score += 0.2;
          if (company.destination_countries?.some((dc: string) => dc.toLowerCase().includes(country))) score += 0.15;
          if (company.origin_countries?.some((oc: string) => oc.toLowerCase().includes(country))) score += 0.15;
        });
      }

      // Cap score at 1.0 (99%) and format as decimal percentage
      const confidence_score = Math.min(0.99, Math.max(0.1, score));

      return {
        ...company,
        confidence_score
      };
    });

    // Sort by confidence score descending
    scoredResults.sort((a, b) => (b.confidence_score || 0) - (a.confidence_score || 0));

    // If query is broad and no high matches were found, or for simulation purposes, we return scoredResults
    return NextResponse.json({
      success: true,
      query: parsed,
      results: scoredResults
    });

  } catch (error: unknown) {
    console.error('Search API error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

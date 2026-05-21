import { NextResponse } from 'next/server';
import { generateJSON } from '@/lib/ai/gemini';
import { requireUserContext } from '@/lib/auth/server';
import { getErrorMessage } from '@/lib/errors';
import { rateLimitOrThrow } from '@/lib/security/rateLimit';

interface ParsedQuery {
  keywords?: string[];
  countries?: string[];
  type?: 'Importer' | 'Exporter' | 'Broker' | null;
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

    // 1. Parse search intent using Gemini
    const systemPrompt = `You are a trade intelligence search parser. 
Parse the user's natural language search query into structured search terms.
Format as JSON: 
{
  "keywords": ["array of raw product keyword matches like pepper, coriander"],
  "countries": ["array of countries mentioned"],
  "type": "Importer" or "Exporter" or "Broker" or null
}`;

    const parsed: ParsedQuery = await generateJSON<ParsedQuery>(
      `Parse the following search query: "${query}"`,
      systemPrompt
    );

    // 2. Perform Postgres query
    let dbQuery = supabase
      .from('companies')
      .select('*')
      .eq('org_id', orgId);

    // Filter by type if parsed
    if (parsed.type) {
      dbQuery = dbQuery.eq('type', parsed.type);
    }

    const { data: companies, error } = await dbQuery;
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

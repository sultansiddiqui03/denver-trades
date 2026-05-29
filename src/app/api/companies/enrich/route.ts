import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateJSON } from '@/lib/ai/gemini';
import { computeAndStoreCompanyEmbedding } from '@/lib/ai/embedCompany';
import { requireUserContext } from '@/lib/auth/server';
import { getErrorMessage } from '@/lib/errors';
import { parseBody } from '@/lib/validation';
import { rateLimitOrThrowAsync } from '@/lib/security/rateLimit';

// NOTE: contacts are deliberately NOT part of AI enrichment. An LLM cannot know
// a real decision-maker's email/phone, so asking it to "infer" them just
// fabricates PII that outreach would then send to. Real contacts come only from
// the website-crawl path (lib/agents/contactEnrich.ts). This enrichment fills
// the INFERABLE profile fields (description/products/markets/tags) from public
// signals.
const EnrichmentResultSchema = z.object({
  description: z.string().default(''),
  products_dealt: z.array(z.string()).default([]),
  origin_countries: z.array(z.string()).default([]),
  destination_countries: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});

type EnrichmentResult = z.infer<typeof EnrichmentResultSchema>;

const EnrichSchema = z.object({
  companyId: z.string().uuid('companyId must be a UUID'),
});

export async function POST(request: Request) {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;

    const { orgId, supabase } = context;

    const limited = await rateLimitOrThrowAsync({
      key: `${orgId}:companies.enrich`,
      max: 20,
      windowSec: 300,
    });
    if (limited) return limited;

    const parsed = await parseBody(request, EnrichSchema);
    if (!parsed.ok) return parsed.response;
    const { companyId } = parsed.data;

    // 1. Fetch the company record
    const { data: company, error: fetchError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .eq('org_id', orgId)
      .single();

    if (fetchError || !company) {
      return NextResponse.json(
        { success: false, error: 'Company not found' },
        { status: 404 }
      );
    }

    // 2. Use Gemini to enrich the company data
    const systemPrompt = `You are a B2B trade intelligence analyst. Given the company details below, produce an enriched profile from PUBLIC signals (name, country, type, website).
Infer ONLY what's reasonably supportable:
- A factual 3-4 sentence business description of their trade operations
- Products they likely deal in (based on name, country, and type)
- Countries they source from and export to
- Tags (e.g., "organic", "bulk", "premium", "FMCG", "commodity")

Do NOT invent contact names, emails, or phone numbers. Do NOT fabricate specifics you cannot support.

Output as JSON:
{
  "description": "string",
  "products_dealt": ["array"],
  "origin_countries": ["array"],
  "destination_countries": ["array"],
  "tags": ["array"]
}`;

    const prompt = `Enrich this trade company:
Name: ${company.name}
Type: ${company.type || 'Unknown'}
HQ Country: ${company.hq_country || 'Unknown'}
HQ City: ${company.hq_city || 'Unknown'}
Current Products: ${(company.products_dealt || []).join(', ') || 'None listed'}
Website: ${company.website || 'None'}
Current Description: ${company.description || 'None'}`;

    const enriched: EnrichmentResult = await generateJSON(
      prompt,
      EnrichmentResultSchema,
      systemPrompt
    );

    // 3. Update company record in Supabase.
    //  - Never touch `contacts` here (real contacts come from the crawler).
    //  - Preserve customs provenance: don't overwrite an `apify:`/customs
    //    enrichment_source with the AI label, and don't downgrade a higher
    //    customs-derived confidence — AI-inferred profile data is low-confidence.
    const hadCustomsSource = (company.enrichment_source ?? '').startsWith('apify');
    const existingConfidence = Number(company.confidence_score ?? 0);
    const { data: updated, error: updateError } = await supabase
      .from('companies')
      .update({
        description: enriched.description,
        products_dealt: enriched.products_dealt,
        origin_countries: enriched.origin_countries,
        destination_countries: enriched.destination_countries,
        tags: enriched.tags,
        is_enriched: true,
        enriched_at: new Date().toISOString(),
        enrichment_source: hadCustomsSource ? company.enrichment_source : 'gemini-ai-inferred',
        confidence_score: Math.max(existingConfidence, 0.6),
      })
      .eq('id', companyId)
      .eq('org_id', orgId)
      .select()
      .single();

    if (updateError) throw updateError;

    // Recompute the company embedding using the freshly enriched fields so
    // it becomes searchable via /api/search/semantic. Failures here (missing
    // OPENAI_API_KEY, provider hiccup) must NOT roll back the enrichment —
    // log + surface a flag so the caller can decide what to show.
    let embeddingFailed = false;
    try {
      await computeAndStoreCompanyEmbedding(supabase, companyId);
    } catch (embedError) {
      embeddingFailed = true;
      console.error('Enrich: embedding compute/store failed:', embedError);
    }

    return NextResponse.json({
      success: true,
      company: updated,
      embedding_failed: embeddingFailed,
    });
  } catch (error: unknown) {
    console.error('Enrich API error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

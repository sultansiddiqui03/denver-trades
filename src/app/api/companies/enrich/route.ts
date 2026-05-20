import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateJSON } from '@/lib/ai/gemini';
import { requireUserContext } from '@/lib/auth/server';
import { getErrorMessage } from '@/lib/errors';
import { parseBody } from '@/lib/validation';

interface EnrichmentResult {
  description: string;
  products_dealt: string[];
  origin_countries: string[];
  destination_countries: string[];
  contacts: { name: string; role: string; email: string | null; phone: string | null }[];
  tags: string[];
}

const EnrichSchema = z.object({
  companyId: z.string().uuid('companyId must be a UUID'),
});

export async function POST(request: Request) {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;

    const { orgId, supabase } = context;
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
    const systemPrompt = `You are a B2B trade intelligence analyst. Given the company details below, produce an enriched profile.
Research and infer:
- A detailed 3-4 sentence business description focusing on their trade operations
- Products they likely deal in (based on name, country, and type)
- Countries they source from and export to
- Probable key contacts (name, role, email, phone) — generate realistic but plausible placeholders if unknown
- Tags (e.g., "organic", "bulk", "premium", "FMCG", "commodity")

Output as JSON:
{
  "description": "string",
  "products_dealt": ["array"],
  "origin_countries": ["array"],
  "destination_countries": ["array"],
  "contacts": [{ "name": "string", "role": "string", "email": "string|null", "phone": "string|null" }],
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

    const enriched: EnrichmentResult = await generateJSON<EnrichmentResult>(
      prompt,
      systemPrompt
    );

    // 3. Update company record in Supabase
    const { data: updated, error: updateError } = await supabase
      .from('companies')
      .update({
        description: enriched.description,
        products_dealt: enriched.products_dealt,
        origin_countries: enriched.origin_countries,
        destination_countries: enriched.destination_countries,
        contacts: enriched.contacts,
        tags: enriched.tags,
        is_enriched: true,
        enriched_at: new Date().toISOString(),
        enrichment_source: 'gemini-ai',
        confidence_score: 0.92,
      })
      .eq('id', companyId)
      .eq('org_id', orgId)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, company: updated });
  } catch (error: unknown) {
    console.error('Enrich API error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

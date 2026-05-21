import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateText } from '@/lib/ai/router';
import { requireUserContext } from '@/lib/auth/server';
import { getErrorMessage } from '@/lib/errors';
import { parseBody } from '@/lib/validation';
import { rateLimitOrThrow } from '@/lib/security/rateLimit';

const OutreachGenerateSchema = z.object({
  product: z.string().min(1, 'product is required'),
  company_name: z.string().optional(),
  channel: z.enum(['Email', 'WhatsApp']).default('Email'),
  language: z.enum(['en', 'es', 'ar']).default('en'),
  tone: z.string().default('professional'),
  deal_value: z.number().nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;

    const { orgId, supabase } = context;

    // 30 generations / 5 min per org — covers a normal manual usage burst
    // without letting a runaway loop blow up the Claude bill.
    const limited = rateLimitOrThrow({
      key: `${orgId}:outreach.generate`,
      max: 30,
      windowSec: 300,
    });
    if (limited) return limited;

    const parsed = await parseBody(request, OutreachGenerateSchema);
    if (!parsed.ok) return parsed.response;
    const { company_name, product, channel, language, tone, deal_value } = parsed.data;

    const languageNames: Record<string, string> = {
      en: 'English',
      es: 'Spanish',
      ar: 'Arabic',
    };

    const targetLanguage = languageNames[language] || 'English';

    const systemPrompt = `You are a professional B2B trade broker and outreach specialist.
Generate a high-converting, personalized B2B outreach pitch.
Keep it highly contextualized for international trade, referring to Incoterms (CIF, FOB), shipping logistics, container quantities, and quality standards (e.g. ASTA grade, organic).
Write the pitch in ${targetLanguage}.`;

    const userPrompt = `
Generate a ${tone} ${channel} pitch to:
- Company Name: ${company_name || 'Prospect Company'}
- Product: ${product}
- Channel: ${channel}
${deal_value ? `- Estimated Value: $${Number(deal_value).toLocaleString()} USD` : ''}

Strict Formatting rules:
1. If channel is WhatsApp, do NOT include email subject lines or signatures. Keep it under 150 words. Use emoji bullet points and clear line breaks.
2. If channel is Email, include a clear Subject Line and standard greeting/signoff.
`;

    const pitch = await generateText(userPrompt, {
      provider: 'claude', // Use Claude for high quality B2B sales pitches
      systemPrompt,
    });

    const { data: draft, error: draftError } = await supabase
      .from('outreach_threads')
      .insert({
        org_id: orgId,
        channel,
        direction: 'Outbound',
        recipient: company_name || 'Prospect Company',
        subject: channel === 'Email' ? `AI outreach draft for ${product}` : null,
        message_content: pitch,
        status: 'Draft',
        language,
        ai_generated: true,
        needs_review: true,
        extracted_terms: {
          product,
          tone,
          deal_value: deal_value || null,
        },
      })
      .select()
      .single();

    if (draftError) {
      throw draftError;
    }

    return NextResponse.json({
      success: true,
      pitch,
      draft,
    });

  } catch (error: unknown) {
    console.error('Outreach Generate API error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

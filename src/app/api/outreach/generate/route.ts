import { NextResponse } from 'next/server';
import { generateText } from '@/lib/ai/router';
import { requireUserContext } from '@/lib/auth/server';
import { getErrorMessage } from '@/lib/errors';

export async function POST(request: Request) {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;

    const { orgId, supabase } = context;

    const body = await request.json();
    const { 
      company_name, 
      product, 
      channel = 'Email', 
      language = 'en', 
      tone = 'professional',
      deal_value
    } = body;

    if (!product) {
      return NextResponse.json(
        { success: false, error: 'Product is required.' },
        { status: 400 }
      );
    }

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

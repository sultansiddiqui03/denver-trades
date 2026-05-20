import { NextResponse } from 'next/server';
import { generateText } from '@/lib/ai/router';

export async function POST(request: Request) {
  try {
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

    return NextResponse.json({
      success: true,
      pitch,
    });

  } catch (error: any) {
    console.error('Outreach Generate API error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

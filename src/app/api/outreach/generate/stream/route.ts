import { NextResponse } from 'next/server';
import { z } from 'zod';
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { requireUserContext } from '@/lib/auth/server';
import { parseBody } from '@/lib/validation';
import { rateLimitOrThrow } from '@/lib/security/rateLimit';

// Mirror the existing /api/outreach/generate env shim so Anthropic's SDK
// finds its key under our canonical CLAUDE_API_KEY name.
if (process.env.CLAUDE_API_KEY && !process.env.ANTHROPIC_API_KEY) {
  process.env.ANTHROPIC_API_KEY = process.env.CLAUDE_API_KEY;
}

const OutreachStreamSchema = z.object({
  product: z.string().min(1, 'product is required'),
  company_name: z.string().optional(),
  channel: z.enum(['Email', 'WhatsApp']).default('Email'),
  language: z.enum(['en', 'es', 'ar']).default('en'),
  tone: z.string().default('professional'),
  deal_value: z.number().nullable().optional(),
});

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  ar: 'Arabic',
};

export async function POST(request: Request) {
  const { context, response } = await requireUserContext();
  if (!context) return response;

  const { orgId, supabase } = context;

  const limited = rateLimitOrThrow({
    key: `${orgId}:outreach.generate`,
    max: 30,
    windowSec: 300,
  });
  if (limited) return limited;

  const parsed = await parseBody(request, OutreachStreamSchema);
  if (!parsed.ok) return parsed.response;
  const { company_name, product, channel, language, tone, deal_value } = parsed.data;

  if (!process.env.CLAUDE_API_KEY) {
    return NextResponse.json(
      { success: false, error: 'CLAUDE_API_KEY is not configured.' },
      { status: 500 }
    );
  }

  const targetLanguage = LANGUAGE_NAMES[language] || 'English';
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

  const result = streamText({
    model: anthropic('claude-3-5-sonnet-latest'),
    system: systemPrompt,
    prompt: userPrompt,
    maxOutputTokens: 4000,
    // Save the draft to the DB only after the stream completes so we never
    // half-persist partial copy. onFinish runs server-side before the
    // response closes.
    onFinish: async ({ text }) => {
      try {
        await supabase.from('outreach_threads').insert({
          org_id: orgId,
          channel,
          direction: 'Outbound',
          recipient: company_name || 'Prospect Company',
          subject: channel === 'Email' ? `AI outreach draft for ${product}` : null,
          message_content: text,
          status: 'Draft',
          language,
          ai_generated: true,
          needs_review: true,
          extracted_terms: {
            product,
            tone,
            deal_value: deal_value || null,
          },
        });
      } catch (err) {
        // Log but don't fail the response — the user already saw the text.
        console.error('Outreach stream onFinish persistence error:', err);
      }
    },
  });

  // Plain text-stream response: client reads response.body as a stream of
  // text chunks. Simpler than the SDK's data-stream protocol for our use case.
  return result.toTextStreamResponse();
}

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
  company_id: z.string().uuid().optional(),
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
    const { company_name, company_id, product, channel, language, tone, deal_value } = parsed.data;

    const languageNames: Record<string, string> = {
      en: 'English',
      es: 'Spanish',
      ar: 'Arabic',
    };

    const targetLanguage = languageNames[language] || 'English';

    // Fetch buyer intelligence when company_id is provided
    let buyerIntelBlock = '';
    if (company_id) {
      const [{ data: company }, { data: shipments }] = await Promise.all([
        supabase
          .from('companies')
          .select('name, total_shipments, last_shipment_date, top_suppliers, hs_codes, top_trading_partners, sourcing_signal')
          .eq('id', company_id)
          .eq('org_id', orgId)
          .maybeSingle(),
        supabase
          .from('shipments')
          .select('product, supplier_name, origin_country, quantity_mt, incoterm, shipment_date')
          .eq('company_id', company_id)
          .order('shipment_date', { ascending: false })
          .limit(6),
      ]);

      if (company) {
        const lines: string[] = [];

        if (company.total_shipments) {
          const lastDate = company.last_shipment_date
            ? new Date(company.last_shipment_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
            : 'unknown';
          lines.push(`Verified importer: ~${company.total_shipments} customs shipments on record, most recent ${lastDate}.`);
        }

        const suppliers = (company.top_suppliers as { name: string; country: string }[] | null) ?? [];
        const partners = (company.top_trading_partners as { name: string; country: string; role: string }[] | null) ?? [];
        const sourceCountries = [
          ...new Set([
            ...suppliers.slice(0, 3).map((s) => s.country),
            ...partners.filter((p) => p.role === 'supplier').slice(0, 2).map((p) => p.country),
          ]),
        ].filter(Boolean);
        if (sourceCountries.length) {
          lines.push(`Primary sourcing origins: ${sourceCountries.join(', ')}.`);
        }

        const hsCodes = (company.hs_codes as { code: string; description: string; shipments: number }[] | null) ?? [];
        const topHs = hsCodes
          .sort((a, b) => (b.shipments ?? 0) - (a.shipments ?? 0))
          .slice(0, 3)
          .map((h) => h.description)
          .filter(Boolean);
        if (topHs.length) {
          lines.push(`Top HS-coded products: ${topHs.join('; ')}.`);
        }

        type SourcingSignal = {
          status?: string;
          headline?: string;
          evidence?: string;
          decliningSupplier?: string;
          topSupplierNow?: string;
        };
        const signal = company.sourcing_signal as SourcingSignal | null;
        if (signal?.status === 'switching' || signal?.status === 'declining') {
          lines.push(
            `OPPORTUNITY: this buyer is actively shifting suppliers — ${signal.headline ?? ''}. ${signal.evidence ?? ''}`.trim()
          );
        }

        if (shipments && shipments.length > 0) {
          const recentLines = shipments.slice(0, 3).map((s) => {
            const d = s.shipment_date
              ? new Date(s.shipment_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
              : '?';
            const qty = s.quantity_mt ? `${s.quantity_mt} MT` : '';
            return `${d}: ${[qty, s.product, s.supplier_name ? `from ${s.supplier_name}` : '', s.origin_country ? `(${s.origin_country})` : '', s.incoterm ? `via ${s.incoterm}` : ''].filter(Boolean).join(' ')}.`;
          });
          lines.push('Recent shipments:', ...recentLines);
        }

        if (lines.length) {
          buyerIntelBlock = `\nBUYER INTELLIGENCE (customs-verified):\n${lines.map((l) => `- ${l}`).join('\n')}\n`;
        }
      }
    }

    const systemPrompt = `You are a professional B2B trade broker and outreach specialist.
Generate a high-converting, personalized B2B outreach pitch.
Keep it highly contextualized for international trade, referring to Incoterms (CIF, FOB), shipping logistics, container quantities, and quality standards (e.g. ASTA grade, organic).
Write the pitch in ${targetLanguage}.${buyerIntelBlock ? '\nWhen buyer intelligence is provided, ground the pitch in that evidence — reference it naturally to show you know their supply chain. If the buyer is switching suppliers, lead with that opportunity and position us as the timely alternative.' : ''}`;

    const userPrompt = `
Generate a ${tone} ${channel} pitch to:
- Company Name: ${company_name || 'Prospect Company'}
- Product: ${product}
- Channel: ${channel}
${deal_value ? `- Estimated Value: $${Number(deal_value).toLocaleString()} USD` : ''}
${buyerIntelBlock}
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
        ...(company_id ? { company_id } : {}),
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

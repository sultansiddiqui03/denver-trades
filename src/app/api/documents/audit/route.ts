import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateJSON, generateMultimodalJSON } from '@/lib/ai/gemini';
import { requireUserContext } from '@/lib/auth/server';
import { getErrorMessage } from '@/lib/errors';
import { parseBody } from '@/lib/validation';
import { rateLimitOrThrowAsync } from '@/lib/security/rateLimit';
import type { Json } from '@/lib/supabase/database.types';

const DiscrepancySchema = z.object({
  severity: z.enum(['HIGH', 'WARNING', 'INFO']),
  category: z.string(),
  description: z.string(),
});

const AuditResponseSchema = z.object({
  discrepancies: z.array(DiscrepancySchema).default([]),
  summary: z.string().default(''),
});

type AuditResponse = z.infer<typeof AuditResponseSchema>;

const FileSchema = z.object({
  base64: z.string().min(1),
  mimeType: z.string().min(1),
  name: z.string().min(1),
});

const DocAuditSchema = z
  .object({
    deal_id: z.string().uuid().nullable().optional(),
    doc_type_a: z.string().default('Letter of Credit'),
    doc_type_b: z.string().default('Bill of Lading'),
    text_a: z.string().optional(),
    text_b: z.string().optional(),
    file_a: FileSchema.optional(),
    file_b: FileSchema.optional(),
  })
  .refine(
    (data) =>
      Boolean(data.file_a?.base64) ||
      Boolean(data.file_b?.base64) ||
      (data.text_a && data.text_b),
    { message: 'Provide at least one file attachment or both document texts.' }
  );

export async function POST(request: Request) {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;

    const { orgId, supabase } = context;

    // Audits are expensive (Gemini multimodal). 10 per 5 min per org.
    const limited = await rateLimitOrThrowAsync({
      key: `${orgId}:documents.audit`,
      max: 10,
      windowSec: 300,
    });
    if (limited) return limited;

    const parsed = await parseBody(request, DocAuditSchema);
    if (!parsed.ok) return parsed.response;
    const { deal_id, doc_type_a, doc_type_b, text_a, text_b, file_a, file_b } = parsed.data;

    const hasAttachment = Boolean(file_a?.base64) || Boolean(file_b?.base64);

    const systemPrompt = `You are an expert international trade document auditor specializing in UCP 600 rules for Letters of Credit (L/C) and Bill of Lading (B/L) audits.
Analyze the provided contents of Document A (${doc_type_a}) and Document B (${doc_type_b}).
Find any discrepancies such as:
1. Port name mismatches (e.g. Jebel Ali vs Sharjah).
2. Weight, container count or quantity variances.
3. Expiry date violations (loading date on B/L is after L/C latest shipment date).
4. Shipper, consignee, or notify party mismatches.

Format your response strictly as a JSON object:
{
  "discrepancies": [
    {
      "severity": "HIGH" | "WARNING" | "INFO",
      "category": "e.g. Port Mismatch",
      "description": "Clear explanation of the mismatch."
    }
  ],
  "summary": "A brief overview summary paragraph of the compliance status."
}`;

    let auditResult: AuditResponse;

    if (hasAttachment) {
      const prompt = `Please audit compliance discrepancies between these two uploaded shipping documents.
Document A is a ${doc_type_a} (represented by File A or text below).
Document B is a ${doc_type_b} (represented by File B or text below).

Text A: ${text_a || ''}
Text B: ${text_b || ''}
`;

      const files = [];
      if (file_a?.base64) {
        files.push({ base64: file_a.base64, mimeType: file_a.mimeType });
      }
      if (file_b?.base64) {
        files.push({ base64: file_b.base64, mimeType: file_b.mimeType });
      }

      auditResult = await generateMultimodalJSON(prompt, files, AuditResponseSchema, systemPrompt);
    } else {
      const prompt = `
=== DOCUMENT A (${doc_type_a}) ===
${text_a}

=== DOCUMENT B (${doc_type_b}) ===
${text_b}
`;
      auditResult = await generateJSON(prompt, AuditResponseSchema, systemPrompt);
    }

    // Save to document_audits table
    const { data, error } = await supabase
      .from('document_audits')
      .insert({
        org_id: orgId,
        deal_id: deal_id || null,
        doc_type_a,
        doc_path_a: file_a ? file_a.name : 'Text payload input',
        doc_type_b,
        doc_path_b: file_b ? file_b.name : 'Text payload input',
        status: 'Complete',
        discrepancies: (auditResult.discrepancies ?? []) as unknown as Json,
        summary: auditResult.summary || 'Completed compliance scan.',
        completed_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Database write error during audit:', error);
      throw error;
    }

    return NextResponse.json({
      success: true,
      audit: data
    });

  } catch (error: unknown) {
    console.error('Document Audit API error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

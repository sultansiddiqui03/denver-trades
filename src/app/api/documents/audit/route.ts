import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateJSON, generateMultimodalJSON } from '@/lib/ai/gemini';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Discrepancy {
  severity: 'HIGH' | 'WARNING' | 'INFO';
  category: string;
  description: string;
}

interface AuditResponse {
  discrepancies: Discrepancy[];
  summary: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      deal_id,
      doc_type_a = 'Letter of Credit',
      text_a,
      file_a, // { base64: string, mimeType: string, name: string }
      doc_type_b = 'Bill of Lading',
      text_b,
      file_b, // { base64: string, mimeType: string, name: string }
      org_id = 'd3b07384-d113-4e4e-9c8e-5b123d456789'
    } = body;

    const hasAttachment = (file_a && file_a.base64) || (file_b && file_b.base64);

    if (!hasAttachment && (!text_a || !text_b)) {
      return NextResponse.json(
        { success: false, error: 'Document texts or file attachments are required to audit.' },
        { status: 400 }
      );
    }

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

      auditResult = await generateMultimodalJSON<AuditResponse>(prompt, files, systemPrompt);
    } else {
      const prompt = `
=== DOCUMENT A (${doc_type_a}) ===
${text_a}

=== DOCUMENT B (${doc_type_b}) ===
${text_b}
`;
      auditResult = await generateJSON<AuditResponse>(prompt, systemPrompt);
    }

    // Save to document_audits table
    const { data, error } = await supabase
      .from('document_audits')
      .insert({
        org_id,
        deal_id: deal_id || null,
        doc_type_a,
        doc_path_a: file_a ? file_a.name : 'Text payload input',
        doc_type_b,
        doc_path_b: file_b ? file_b.name : 'Text payload input',
        status: 'Complete',
        discrepancies: auditResult.discrepancies || [],
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

  } catch (error: any) {
    console.error('Document Audit API error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

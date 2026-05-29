import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserContext } from '@/lib/auth/server';
import { getErrorMessage } from '@/lib/errors';
import { parseBody } from '@/lib/validation';
import { sendWhatsAppMessage } from '@/lib/outreach/sendWhatsApp';

const WhatsAppSendSchema = z.object({
  recipient: z.string().min(1, 'recipient phone is required'),
  message_content: z.string().min(1, 'message_content is required'),
  company_id: z.string().uuid().nullable().optional(),
  deal_id: z.string().uuid().nullable().optional(),
  sender: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const { context, response } = await requireUserContext();
    if (!context) return response;

    const { orgId, supabase } = context;
    const parsed = await parseBody(request, WhatsAppSendSchema);
    if (!parsed.ok) return parsed.response;
    const { company_id, deal_id, recipient, message_content, sender } = parsed.data;

    const result = await sendWhatsAppMessage(supabase, orgId, {
      recipient,
      message: message_content,
      companyId: company_id,
      dealId: deal_id,
      sender,
    });

    return NextResponse.json({
      success: result.success,
      messageSid: result.messageSid,
      status: result.status,
      simulated: result.simulated,
    });
  } catch (error: unknown) {
    console.error('Outbound WhatsApp endpoint error:', error);
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: 500 });
  }
}

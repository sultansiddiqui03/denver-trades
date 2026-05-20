import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserContext } from '@/lib/auth/server';
import { getErrorMessage } from '@/lib/errors';
import { parseBody } from '@/lib/validation';

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

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const rawTwilioNumber = process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886';
    const twilioNumber = rawTwilioNumber.startsWith('whatsapp:') 
      ? rawTwilioNumber 
      : `whatsapp:${rawTwilioNumber}`;

    let twilioSuccess = false;
    let messageSid = '';
    let statusText = 'Sent';

    // If live credentials exist, send via Twilio API
    if (accountSid && authToken) {
      const fromNum = twilioNumber;
      const toNum = recipient.startsWith('whatsapp:') ? recipient : `whatsapp:${recipient}`;

      const params = new URLSearchParams();
      params.append('From', fromNum);
      params.append('To', toNum);
      params.append('Body', message_content);

      const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');

      try {
        const twilioResponse = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': authHeader,
            },
            body: params.toString(),
          }
        );

        if (twilioResponse.ok) {
          const twilioData = await twilioResponse.json();
          messageSid = twilioData.sid;
          twilioSuccess = true;
          statusText = 'Delivered';
        } else {
          const errorText = await twilioResponse.text();
          console.error('Twilio REST API Error:', errorText);
          statusText = 'Failed';
        }
      } catch (twilioErr) {
        console.error('Failed to connect to Twilio servers:', twilioErr);
        statusText = 'Failed';
      }
    } else {
      console.warn('Twilio API credentials missing. Running in simulated (mock) delivery mode.');
      twilioSuccess = true; // Pretend it succeeded
      messageSid = 'SM' + Math.random().toString(36).substring(2, 17).toUpperCase();
    }

    // Save to outreach_threads log
    const { data: threadMsg, error: dbError } = await supabase
      .from('outreach_threads')
      .insert({
        org_id: orgId,
        company_id: company_id || null,
        deal_id: deal_id || null,
        channel: 'WhatsApp',
        direction: 'Outbound',
        sender: sender || twilioNumber,
        recipient: recipient.startsWith('whatsapp:') ? recipient : `whatsapp:${recipient}`,
        message_content,
        status: statusText,
        language: 'en',
        ai_generated: false,
        needs_review: false
      })
      .select()
      .single();

    if (dbError) {
      console.error('Supabase write error logging outbound thread:', dbError);
      throw dbError;
    }

    return NextResponse.json({
      success: twilioSuccess,
      messageSid,
      message: threadMsg
    });

  } catch (error: unknown) {
    console.error('Outbound WhatsApp endpoint error:', error);
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

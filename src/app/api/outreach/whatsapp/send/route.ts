import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      org_id = 'd3b07384-d113-4e4e-9c8e-5b123d456789',
      company_id,
      deal_id,
      recipient,
      message_content,
      sender // Optional: if provided, otherwise derived from TWILIO_WHATSAPP_NUMBER
    } = body;

    if (!recipient || !message_content) {
      return NextResponse.json(
        { success: false, error: 'Recipient phone number and message content are required.' },
        { status: 400 }
      );
    }

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
        org_id,
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

  } catch (error: any) {
    console.error('Outbound WhatsApp endpoint error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { publicBaseUrl } from '@/lib/agents/dispatchScrape';

export interface SendWhatsAppParams {
  recipient: string;
  message: string;
  companyId?: string | null;
  dealId?: string | null;
  sender?: string;
  aiGenerated?: boolean;
}

export interface SendWhatsAppResult {
  success: boolean;
  messageSid: string;
  status: string;
  simulated: boolean;
  threadId?: string;
}

/**
 * Send an outbound WhatsApp via the Twilio REST API and log it to
 * outreach_threads. Falls back to a clearly-flagged simulation when Twilio
 * creds are absent. Shared by the user-facing send route AND the assistant's
 * send_whatsapp tool so behaviour can't drift. Persists the Twilio SID +
 * registers a StatusCallback so delivery updates reconcile.
 */
export async function sendWhatsAppMessage(
  supabase: SupabaseClient<Database>,
  orgId: string,
  { recipient, message, companyId, dealId, sender, aiGenerated }: SendWhatsAppParams,
): Promise<SendWhatsAppResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const rawTwilioNumber = process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886';
  const twilioNumber = rawTwilioNumber.startsWith('whatsapp:') ? rawTwilioNumber : `whatsapp:${rawTwilioNumber}`;
  const to = recipient.startsWith('whatsapp:') ? recipient : `whatsapp:${recipient}`;

  let messageSid = '';
  let status = 'Sent';
  let simulated = false;

  if (accountSid && authToken) {
    const params = new URLSearchParams();
    params.append('From', twilioNumber);
    params.append('To', to);
    params.append('Body', message);
    params.append('StatusCallback', `${publicBaseUrl()}/api/webhooks/whatsapp/status`);
    const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: authHeader },
        body: params.toString(),
      });
      if (res.ok) {
        const data = await res.json();
        messageSid = data.sid;
        status = 'Delivered';
      } else {
        console.error('Twilio send error:', await res.text());
        status = 'Failed';
      }
    } catch (e) {
      console.error('Twilio connect error:', e);
      status = 'Failed';
    }
  } else {
    simulated = true;
    messageSid = 'SM' + Math.random().toString(36).substring(2, 17).toUpperCase();
  }

  const { data: thread } = await supabase
    .from('outreach_threads')
    .insert({
      org_id: orgId,
      company_id: companyId ?? null,
      deal_id: dealId ?? null,
      channel: 'WhatsApp',
      direction: 'Outbound',
      sender: sender || twilioNumber,
      recipient: to,
      message_content: message,
      status,
      twilio_message_sid: messageSid || null,
      language: 'en',
      ai_generated: aiGenerated ?? false,
      needs_review: false,
    })
    .select('id')
    .single();

  return { success: status !== 'Failed', messageSid, status, simulated, threadId: thread?.id };
}

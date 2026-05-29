import { getSupabaseServiceClient } from '@/lib/supabase/admin';
import { verifyTwilioRequest } from '@/lib/security/request';
import { getErrorMessage } from '@/lib/errors';

/**
 * Twilio message status callback. Twilio POSTs delivery updates (queued → sent →
 * delivered / read / failed / undelivered) for outbound messages we registered a
 * StatusCallback on. We reconcile the matching outbound `outreach_threads` row by
 * its `twilio_message_sid`. Signature-verified like the inbound webhook.
 */

// Twilio MessageStatus → our outreach_threads.status label.
const STATUS_MAP: Record<string, string> = {
  queued: 'Sent',
  sending: 'Sent',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  undelivered: 'Failed',
  failed: 'Failed',
};

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('application/x-www-form-urlencoded')) {
      return new Response('Unsupported', { status: 415 });
    }

    const formData = await request.formData();
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      if (typeof value === 'string') params[key] = value;
    });

    const isValid = await verifyTwilioRequest(request, params);
    if (!isValid) return new Response('Unauthorized', { status: 401 });

    const sid = params.MessageSid || params.SmsSid || '';
    const rawStatus = (params.MessageStatus || params.SmsStatus || '').toLowerCase();
    if (!sid || !rawStatus) return new Response('', { status: 204 });

    const mapped = STATUS_MAP[rawStatus];
    if (!mapped) return new Response('', { status: 204 }); // intermediate state we don't track

    const supabase = getSupabaseServiceClient();
    await supabase
      .from('outreach_threads')
      .update({ status: mapped, updated_at: new Date().toISOString() })
      .eq('twilio_message_sid', sid);

    return new Response('', { status: 204 });
  } catch (error: unknown) {
    console.error('WhatsApp status callback error:', getErrorMessage(error));
    // Always 2xx so Twilio doesn't retry-storm on our internal errors.
    return new Response('', { status: 204 });
  }
}

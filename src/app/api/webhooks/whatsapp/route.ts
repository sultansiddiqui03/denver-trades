import { z } from 'zod';
import { getSupabaseServiceClient } from '@/lib/supabase/admin';
import { verifyTwilioRequest, isWebhookSecretAuthorized } from '@/lib/security/request';

const WhatsAppJsonSchema = z
  .object({
    From: z.string().optional(),
    from: z.string().optional(),
    To: z.string().optional(),
    to: z.string().optional(),
    Body: z.string().optional(),
    body: z.string().optional(),
    MessageSid: z.string().optional(),
  })
  .refine((data) => (data.From || data.from) && (data.Body || data.body), {
    message: 'From and Body are required',
  });

function twiml(body: string, status = 200) {
  return new Response(body, {
    headers: { 'Content-Type': 'text/xml' },
    status,
  });
}

/**
 * Resolve which org owns the given Twilio `To` number.
 * Strategy:
 *   1. Match `organizations.twilio_whatsapp_number = to` (multi-tenant).
 *   2. Single-tenant fallback: if there is exactly one org in the table
 *      (i.e. self-hosted / pre-multi-tenant), use that org so existing
 *      installs keep working. Once a second org is added, every org must
 *      set their own number explicitly.
 *   3. Otherwise: reject (would have been a tenant data leak).
 */
async function resolveOrgIdForTwilioNumber(
  supabase: ReturnType<typeof getSupabaseServiceClient>,
  to: string
): Promise<string | null> {
  if (to) {
    const { data: matched } = await supabase
      .from('organizations')
      .select('id')
      .eq('twilio_whatsapp_number', to)
      .maybeSingle();
    if (matched?.id) return matched.id;
  }

  const { data: allOrgs } = await supabase.from('organizations').select('id').limit(2);
  if (allOrgs && allOrgs.length === 1) {
    return allOrgs[0].id;
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseServiceClient();
    const contentType = request.headers.get('content-type') || '';
    let from = '';
    let to = '';
    let body = '';
    let messageSid = '';

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      const signatureParams: Record<string, string> = {};
      formData.forEach((value, key) => {
        if (typeof value === 'string') signatureParams[key] = value;
      });

      const isValidTwilio = await verifyTwilioRequest(request, signatureParams);
      if (!isValidTwilio) {
        return twiml('<Response><Message>Unauthorized webhook</Message></Response>', 401);
      }

      from = (formData.get('From') as string) || '';
      to = (formData.get('To') as string) || '';
      body = (formData.get('Body') as string) || '';
      messageSid = (formData.get('MessageSid') as string) || '';
    } else {
      if (!isWebhookSecretAuthorized(request, 'WHATSAPP_WEBHOOK_SECRET')) {
        return twiml('<Response><Message>Unauthorized webhook</Message></Response>', 401);
      }

      let json: unknown;
      try {
        json = await request.json();
      } catch {
        return twiml('<Response><Message>Invalid JSON</Message></Response>', 400);
      }
      const validated = WhatsAppJsonSchema.safeParse(json);
      if (!validated.success) {
        return twiml('<Response><Message>Invalid JSON payload</Message></Response>', 400);
      }
      from = validated.data.From || validated.data.from || '';
      to = validated.data.To || validated.data.to || '';
      body = validated.data.Body || validated.data.body || '';
      messageSid = validated.data.MessageSid || '';
    }

    if (!from || !body) {
      return twiml('<Response><Message>Missing From or Body</Message></Response>', 400);
    }

    // P1-3: derive org from the receiving Twilio number, not from a global default.
    const orgId = await resolveOrgIdForTwilioNumber(supabase, to);
    if (!orgId) {
      console.warn(`WhatsApp webhook: no org owns To=${to}; dropping inbound message.`);
      return twiml('<Response><Message>No org claims this number</Message></Response>', 403);
    }

    const cleanPhone = from.replace('whatsapp:', '').trim();

    const { data: companies } = await supabase
      .from('companies')
      .select('id, name, contacts')
      .eq('org_id', orgId);

    let matchedCompanyId: string | null = null;
    let matchedCompanyName = 'Unknown Prospect';

    if (companies) {
      for (const comp of companies) {
        const contactsRaw = comp.contacts;
        const contacts = Array.isArray(contactsRaw)
          ? (contactsRaw as Array<{ phone?: string }>)
          : [];
        const matches = contacts.some((c) => {
          if (!c.phone) return false;
          const a = c.phone.replace(/[\s\-\+]/g, '');
          const b = cleanPhone.replace(/[\s\-\+]/g, '');
          return a.includes(b) || b.includes(a);
        });
        if (matches) {
          matchedCompanyId = comp.id;
          matchedCompanyName = comp.name;
          break;
        }
      }
    }

    let matchedDealId: string | null = null;
    if (matchedCompanyId) {
      const { data: deals } = await supabase
        .from('deals_pipeline')
        .select('id')
        .eq('company_id', matchedCompanyId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (deals && deals.length > 0) matchedDealId = deals[0].id;
    }

    // P1-4: replay protection. Unique partial index on twilio_message_sid means a
    // duplicate MessageSid raises a constraint violation; we treat that as a benign
    // replay and return 200 so Twilio stops retrying.
    const insertPayload = {
      org_id: orgId,
      deal_id: matchedDealId,
      company_id: matchedCompanyId,
      channel: 'WhatsApp',
      direction: 'Inbound',
      sender: from,
      recipient: to,
      message_content: body,
      needs_review: false,
      status: 'Read',
      language: 'en',
      twilio_message_sid: messageSid || null,
    };

    const { error: threadError } = await supabase
      .from('outreach_threads')
      .insert(insertPayload);

    if (threadError) {
      // Postgres unique_violation
      if (threadError.code === '23505') {
        console.info(`WhatsApp webhook: replay detected for MessageSid=${messageSid}, ignoring.`);
        return twiml('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', 200);
      }
      throw threadError;
    }

    await supabase.from('notifications').insert({
      org_id: orgId,
      type: 'whatsapp_message',
      title: `WhatsApp from ${matchedCompanyName}`,
      body: body.length > 80 ? `${body.slice(0, 80)}...` : body,
      link: `/dashboard/outreach`,
      is_read: false,
    });

    return twiml('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', 200);
  } catch (error: unknown) {
    console.error('WhatsApp webhook error:', error);
    return twiml('<Response><Message>Error processing webhook</Message></Response>', 500);
  }
}

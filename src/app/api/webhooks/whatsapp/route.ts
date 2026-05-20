import { DEFAULT_ORG_ID } from '@/lib/auth/server';
import { getSupabaseServiceClient } from '@/lib/supabase/admin';
import { verifyTwilioRequest, isWebhookSecretAuthorized } from '@/lib/security/request';

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseServiceClient();
    const contentType = request.headers.get('content-type') || '';
    let from = '';
    let to = '';
    let body = '';
    const signatureParams: Record<string, string> = {};

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      from = formData.get('From') as string || '';
      to = formData.get('To') as string || '';
      body = formData.get('Body') as string || '';
      formData.forEach((value, key) => {
        if (typeof value === 'string') {
          signatureParams[key] = value;
        }
      });

      const isValidTwilio = await verifyTwilioRequest(request, signatureParams);
      if (!isValidTwilio) {
        return new Response('<Response><Message>Unauthorized webhook</Message></Response>', {
          headers: { 'Content-Type': 'text/xml' },
          status: 401,
        });
      }
    } else {
      // Allow JSON payloads for testing
      if (!isWebhookSecretAuthorized(request, 'WHATSAPP_WEBHOOK_SECRET')) {
        return new Response('<Response><Message>Unauthorized webhook</Message></Response>', {
          headers: { 'Content-Type': 'text/xml' },
          status: 401,
        });
      }

      const json = await request.json();
      from = json.From || json.from || '';
      to = json.To || json.to || '';
      body = json.Body || json.body || '';
    }

    if (!from || !body) {
      return new Response('<Response><Message>Missing From or Body</Message></Response>', {
        headers: { 'Content-Type': 'text/xml' },
        status: 400
      });
    }

    // Default Org ID (multi-tenancy)
    const orgId = DEFAULT_ORG_ID;

    // 1. Resolve company by phone number match in contacts JSONB
    // We clean 'whatsapp:' prefix to match phone format
    const cleanPhone = from.replace('whatsapp:', '').trim();
    
    // Look up company matching contacts
    const { data: companies, error: companyError } = await supabase
      .from('companies')
      .select('*')
      .eq('org_id', orgId);

    let matchedCompanyId = null;
    let matchedCompanyName = 'Unknown Prospect';
    
    if (companies && !companyError) {
      for (const comp of companies) {
        const contacts = comp.contacts || [];
        const matches = contacts.some((c: { phone?: string }) => {
          if (!c.phone) return false;
          const cleanedContactPhone = c.phone.replace(/[\s\-\+]/g, '');
          const cleanedInboundPhone = cleanPhone.replace(/[\s\-\+]/g, '');
          return cleanedInboundPhone.includes(cleanedContactPhone) || cleanedContactPhone.includes(cleanedInboundPhone);
        });

        if (matches) {
          matchedCompanyId = comp.id;
          matchedCompanyName = comp.name;
          break;
        }
      }
    }

    // 2. Resolve active deal for this company
    let matchedDealId = null;
    if (matchedCompanyId) {
      const { data: deals } = await supabase
        .from('deals_pipeline')
        .select('id')
        .eq('company_id', matchedCompanyId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (deals && deals.length > 0) {
        matchedDealId = deals[0].id;
      }
    }

    // 3. Write incoming outreach thread
    const { error: threadError } = await supabase
      .from('outreach_threads')
      .insert({
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
        language: 'en'
      });

    if (threadError) throw threadError;

    // 4. Create in-app notification so user gets alert immediately
    await supabase
      .from('notifications')
      .insert({
        org_id: orgId,
        type: 'whatsapp_message',
        title: `WhatsApp from ${matchedCompanyName}`,
        body: body.length > 80 ? `${body.slice(0, 80)}...` : body,
        link: `/dashboard/outreach`,
        is_read: false
      });

    // Return clean Twilio TwiML response
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>`;

    return new Response(xml, {
      headers: { 'Content-Type': 'text/xml' },
      status: 200
    });

  } catch (error: unknown) {
    console.error('WhatsApp webhook error:', error);
    return new Response('<Response><Message>Error processing webhook</Message></Response>', {
      headers: { 'Content-Type': 'text/xml' },
      status: 500
    });
  }
}

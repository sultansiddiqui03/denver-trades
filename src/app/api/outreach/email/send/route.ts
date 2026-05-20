import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Resend } from 'resend';
import { requireUserContext } from '@/lib/auth/server';
import { getErrorMessage } from '@/lib/errors';
import { parseBody } from '@/lib/validation';

const EmailSendSchema = z.object({
  recipient: z.string().email('recipient must be a valid email address'),
  subject: z.string().min(1, 'subject is required'),
  body: z.string().min(1, 'body is required'),
  company_id: z.string().uuid().nullable().optional(),
  deal_id: z.string().uuid().nullable().optional(),
  // If sending an existing Draft row, pass its id and we'll update it in place;
  // otherwise a new outreach_threads row is inserted.
  draft_id: z.string().uuid().nullable().optional(),
});

export async function POST(request: Request) {
  const { context, response } = await requireUserContext();
  if (!context) return response;

  const { orgId, supabase } = context;
  const parsed = await parseBody(request, EmailSendSchema);
  if (!parsed.ok) return parsed.response;
  const { recipient, subject, body, company_id, deal_id, draft_id } = parsed.data;

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const senderForLog = fromEmail || 'denver-trades@local';

  let messageId: string | null = null;
  let statusText: 'Sent' | 'Failed' = 'Sent';
  let mode: 'live' | 'simulation' = 'live';

  try {
    if (apiKey && fromEmail) {
      const resend = new Resend(apiKey);
      const { data, error } = await resend.emails.send({
        from: fromEmail,
        to: recipient,
        subject,
        text: body,
      });

      if (error) {
        statusText = 'Failed';
        throw new Error(`Resend error: ${error.message ?? 'unknown'}`);
      }

      messageId = data?.id ?? null;
    } else {
      // No Resend config → simulation. We still log the thread row so the user
      // sees their outbound copy; the UI surfaces the simulation mode banner.
      mode = 'simulation';
      messageId = `sim-${Date.now()}`;
    }

    if (draft_id) {
      const { error: updateError } = await supabase
        .from('outreach_threads')
        .update({
          status: statusText,
          recipient,
          subject,
          message_content: body,
          sender: senderForLog,
        })
        .eq('id', draft_id)
        .eq('org_id', orgId);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase.from('outreach_threads').insert({
        org_id: orgId,
        company_id: company_id ?? null,
        deal_id: deal_id ?? null,
        channel: 'Email',
        direction: 'Outbound',
        sender: senderForLog,
        recipient,
        subject,
        message_content: body,
        status: statusText,
        ai_generated: false,
        needs_review: false,
        language: 'en',
      });
      if (insertError) throw insertError;
    }

    return NextResponse.json({
      success: true,
      mode,
      messageId,
      message:
        mode === 'simulation'
          ? 'RESEND_API_KEY / RESEND_FROM_EMAIL not configured — recorded as Sent without dispatching. Set both env vars (with a verified Resend domain) to send live.'
          : 'Email dispatched via Resend.',
    });
  } catch (error: unknown) {
    console.error('Outbound Email endpoint error:', error);

    // If we have a draft to mark, flip it to Failed so the user sees what happened.
    if (draft_id) {
      await supabase
        .from('outreach_threads')
        .update({ status: 'Failed' })
        .eq('id', draft_id)
        .eq('org_id', orgId);
    }

    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}

-- P1-3: per-org Twilio WhatsApp number for inbound webhook routing.
-- Match against the To field of incoming Twilio messages.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS twilio_whatsapp_number TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_twilio_whatsapp_number
  ON public.organizations(twilio_whatsapp_number)
  WHERE twilio_whatsapp_number IS NOT NULL;

COMMENT ON COLUMN public.organizations.twilio_whatsapp_number IS
  'Twilio WhatsApp sender (whatsapp:+...) used to route inbound webhooks to this org. Set this once per org; partial unique index prevents the same number being assigned twice.';

-- P1-4: replay protection on Twilio inbound messages.
-- Unique partial index lets ON CONFLICT DO NOTHING reject duplicates atomically.
ALTER TABLE public.outreach_threads
  ADD COLUMN IF NOT EXISTS twilio_message_sid TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_outreach_threads_twilio_message_sid
  ON public.outreach_threads(twilio_message_sid)
  WHERE twilio_message_sid IS NOT NULL;

COMMENT ON COLUMN public.outreach_threads.twilio_message_sid IS
  'Twilio MessageSid. Unique partial index lets us reject replays without race conditions.';

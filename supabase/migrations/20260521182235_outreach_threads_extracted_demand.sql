-- Active Demand wedge: structured-buyer-signal extraction layered on inbound
-- WhatsApp threads. We choose a JSONB column on the existing `outreach_threads`
-- table (rather than a new `demand_signals` table) so:
--   * the source message and its parsed demand live together; lifecycle is one row
--   * replay protection (unique partial index on twilio_message_sid) already
--     guarantees we never extract the same message twice
--   * the dashboard query is a single-table scan with a partial index -- no join
--   * the extraction is best-effort metadata, not a first-class entity that
--     needs its own RLS policies, FKs, or migrations on the buyer side
--
-- Schema persisted:
--   {
--     "has_demand": boolean,
--     "product": string | null,
--     "quantity_amount": number | null,
--     "quantity_unit": string | null,
--     "incoterm": "CIF" | "FOB" | "DAP" | "EXW" | "Other" | null,
--     "destination_port": string | null,
--     "destination_country": string | null,
--     "deadline_iso": string | null,   -- ISO-8601 if a date is mentioned
--     "raw_intent": string | null      -- 1-sentence summary in the buyer's tone
--   }
-- If `has_demand` is false (greetings, "thanks", spam) the parser still writes
-- the JSON so we don't re-call Gemini on every backfill pass; the dashboard
-- query filters on `extracted_demand->>'has_demand' = 'true'`.

ALTER TABLE public.outreach_threads
  ADD COLUMN IF NOT EXISTS extracted_demand JSONB;

COMMENT ON COLUMN public.outreach_threads.extracted_demand IS
  'Gemini-parsed structured buyer demand from an inbound WhatsApp message. See ActiveDemandFeed and POST /api/webhooks/whatsapp.';

-- Dashboard feed query: org-scoped, time-ordered, only rows where the parser
-- found a real demand signal. Partial index keeps the index tiny (only inbound
-- messages with has_demand=true) which is exactly the dashboard hot path.
CREATE INDEX IF NOT EXISTS idx_outreach_threads_active_demand
  ON public.outreach_threads (org_id, created_at DESC)
  WHERE direction = 'Inbound'
    AND (extracted_demand->>'has_demand') = 'true';

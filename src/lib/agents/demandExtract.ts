import 'server-only';
import { z } from 'zod';
import { generateJSON } from '@/lib/ai/gemini';

/**
 * Active Demand wedge — the differentiator against Tradyon. Their product is
 * pure outbound (enrich verified shipment data on importers, then outreach by
 * email/WhatsApp). They do NOT have a live RFQ / demand feed.
 *
 * We do: every inbound WhatsApp message lands in `outreach_threads` already.
 * This module parses each one through Gemini into a structured buyer-intent
 * record so the dashboard can surface "this buyer wants 2 containers of black
 * pepper CIF Jebel Ali by July" alongside a one-tap "Generate quote" CTA.
 *
 * Storage: a JSONB column `extracted_demand` on outreach_threads. See
 * `supabase/migrations/20260521182235_outreach_threads_extracted_demand.sql`
 * for the schema + the partial index that backs the dashboard query.
 */

/**
 * Persisted shape. `has_demand: false` rows are still written (so backfill +
 * webhook are idempotent and don't re-call Gemini), but the dashboard partial
 * index only includes `true` rows.
 */
export const ExtractedDemandSchema = z.object({
  has_demand: z.boolean(),
  product: z.string().nullable(),
  quantity_amount: z.number().nullable(),
  quantity_unit: z.string().nullable(),
  incoterm: z.enum(['CIF', 'FOB', 'DAP', 'EXW', 'Other']).nullable(),
  destination_port: z.string().nullable(),
  destination_country: z.string().nullable(),
  deadline_iso: z.string().nullable(),
  raw_intent: z.string().nullable(),
});

export type ExtractedDemand = z.infer<typeof ExtractedDemandSchema>;

const SYSTEM_PROMPT = `You are a B2B trade-demand parser for a commodity trading CRM (spices, grains, oilseeds, coffee, agri exports).

Your job: read one inbound WhatsApp message from a prospective buyer and decide whether it contains an actionable RFQ / purchase intent. If so, extract the structured demand. If not (e.g. greeting, thank-you, scheduling chat, unrelated content, spam), return has_demand=false and leave the structured fields null.

Rules:
- Set has_demand=true ONLY when the buyer is signaling they want to buy a specific commodity/product. "Looking for…", "Need…", "Can you quote…", "What's your price for…", "Send me your best rate for…" are all signals. Generic small talk is NOT.
- product: the commodity in normalized lowercase (e.g. "black pepper", "cardamom green grade 8mm", "basmati rice", "wheat"). Strip filler words.
- quantity_amount + quantity_unit: parse "2 containers" → 2 / "20ft container"; "5 MT" → 5 / "MT"; "1000 kg" → 1000 / "kg". If the buyer says "container" without size, default unit to "20ft container".
- incoterm: only one of CIF | FOB | DAP | EXW | Other. If not mentioned, null.
- destination_port: named seaport / dryport if mentioned (e.g. "Jebel Ali", "Mombasa", "Mundra"). Otherwise null.
- destination_country: the country where goods will be delivered, inferred from the port or explicit mention.
- deadline_iso: if the buyer mentions a date or month, return ISO-8601 (e.g. "2026-07-15" for "July 15th", "2026-07-31" for "by July"). Use the year 2026 unless the message implies otherwise. If no date, null.
- raw_intent: one short sentence summarizing what the buyer wants, in the buyer's own tone. Max 140 characters. Null if has_demand=false.

Be conservative — false positives clutter the dashboard. When in doubt, has_demand=false.`;

function buildPrompt(messageBody: string, senderHint?: string): string {
  const fromLine = senderHint ? `From: ${senderHint}\n` : '';
  return `${fromLine}Inbound WhatsApp message:
"""
${messageBody.trim()}
"""

Parse this into the structured demand schema.`;
}

/**
 * Run Gemini extraction on a single inbound WhatsApp message body.
 * Throws on provider error — callers should catch and decide whether to
 * persist a fallback or skip.
 */
export async function extractDemand(
  messageBody: string,
  senderHint?: string,
): Promise<ExtractedDemand> {
  return generateJSON(
    buildPrompt(messageBody, senderHint),
    ExtractedDemandSchema,
    SYSTEM_PROMPT,
  );
}

/**
 * The "no signal" sentinel we persist when Gemini fails or is unavailable.
 * Keeps the column non-null so the backfill loop won't reprocess the row, but
 * the dashboard's partial index ignores has_demand=false rows.
 */
export function emptyDemand(): ExtractedDemand {
  return {
    has_demand: false,
    product: null,
    quantity_amount: null,
    quantity_unit: null,
    incoterm: null,
    destination_port: null,
    destination_country: null,
    deadline_iso: null,
    raw_intent: null,
  };
}

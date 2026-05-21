# Denver Trades — Go-live runbook

Pre-flight steps to take **before** sharing the production URL with real customers. Estimated total time: **30 minutes** (most of it Resend domain verification).

---

## 0. Feature inventory (what's live as of 2026-05-22)

Quick map of what your product does today, organized the way a trader would think about it:

| Surface | What it does | Tradyon parity |
|---|---|---|
| `/dashboard` overview | Stats, **Active Demand feed** (parsed RFQs), Recent activity, Quick Tools | They lack the demand feed entirely — this is our wedge |
| `/dashboard/search` | Sidebar splits into **Find Buyers** + **Find Sellers**. Buyer/Seller/Broker filter pills, AI typeahead suggestions, semantic (pgvector) and keyword modes | ✅ feature parity + semantic |
| `/dashboard/companies` | Directory with BUYS/SELLS/BROKER chips, SOURCES FROM / SHIPS TO trade lanes, enriched checkmark + date | ✅ feature parity |
| `/dashboard/companies/[id]` | 4-tab dossier: Overview · Shipment History · Commodities · Contacts. Generate-outreach deep-links | ✅ feature parity |
| `/dashboard/pipeline` | 9-stage kanban (New Lead → … → Closed Won/Lost), `<PREFIX>-2026-NNNNN` deal IDs (per-org sequence, default prefix `LEAD-OPP`, configurable via `PATCH /api/org`), dnd-kit drag-drop | Their 5-stage; we go further |
| `/dashboard/outreach` | Streaming AI generation, EN/ES/AR multi-lingual, WhatsApp + Email channels, prefilled from dossier or Active Demand | They have templates; we stream |
| `/dashboard/documents` | L/C vs B/L compliance audit via Gemini multimodal | They don't have this |
| `/dashboard/prices` | 10 commodities, daily Vercel cron `0 2 * * *` | They don't have this |
| `/dashboard/agents` | Lead Scraper, Price Ingest, Doc Audit, WhatsApp Parser. **Inline leads drill-down** on Success rows | They don't surface agents |
| `/dashboard/analytics` | Recharts dashboards (deals, countries, value) | ✅ feature parity |
| Cmd+K palette | Fuzzy nav + recent items | They don't have this |

**Architecture facts** worth knowing when something breaks:
- Webhook secret on Apify dispatch is in the `x-denver-webhook-secret` HEADER (not query string). Default payload (no custom `payloadTemplate`) — Apify's `?webhooks=` ad-hoc form doesn't interpolate custom templates.
- Every domain table carries `org_id` and is RLS-scoped except `commodity_prices` (intentionally global).
- `deal_code` is per-org-scoped (`deals_pipeline_deal_code_org_uidx` on `(org_id, deal_code)`). Two orgs can both hold `LEAD-OPP-2026-00001` independently. Prefix is configurable per-org via `PATCH /api/org` with body `{"deal_code_prefix": "ACME"}` (owner-only, 2-12 uppercase letters/digits/dashes).
- Inbound WhatsApp messages are Gemini-extracted on the webhook path (sync, ~2s, inside Twilio's 15s budget). Extraction writes `outreach_threads.extracted_demand` (JSONB).
- Backfill endpoints (Bearer `CRON_SECRET`): `/api/admin/apify/replay`, `/api/admin/embeddings/backfill`, `/api/admin/whatsapp/extract-backfill`.

---

## 1. Verify the two production bug fixes landed (5 min)

Both fixes shipped in the same commit that points to this file. Confirm by checking:

### a. Apify Lead Scraper
- Open https://denver-trades.vercel.app/dashboard/agents → click **Run now** on Lead Scraper Agent.
- Expected: a new "Running" row appears with a lime pulse.
- Within ~2 min: status flips to **Success** with N records processed.
- Bonus check: open `/dashboard/search` — you should see N new companies with real names + cities + websites scraped from Google Maps.

**If still 404 / "Actor not found":** your `APIFY_ACTOR_ID` env var is overriding the new code default. Either:

```bash
vercel env rm APIFY_ACTOR_ID production
vercel redeploy --prod
```
(removes the env so the code default `compass~crawler-google-places` takes over)

or

```bash
vercel env add APIFY_ACTOR_ID production
# Paste: compass~crawler-google-places
vercel redeploy --prod
```

### b. AI search / enrich / audit
- Open https://denver-trades.vercel.app/dashboard/search → type a query → submit.
- Expected: no 500, results render (may be empty if no companies match).
- Open `/dashboard/documents` → click "Pre-fill mismatched docs" → "Run compliance audit" → expect a discrepancy report within ~10s.
- Open `/dashboard/outreach` → fill form → "Generate pitch" → text streams in live.

**If anything still 500s:** check `vercel logs` for the full error trace (we added rich logging) and share the output.

---

## 1b. Recovering an orphaned Apify run (only when needed)

If an Apify scrape finishes but its webhook never lands (callback-URL drift, secret rotation, transient Apify outage), the dataset sits in Apify with real leads and the matching `agent_runs` row stays stuck on **Running**. Instead of hand-writing SQL to import the rows, hit the admin replay endpoint — it reuses the same enrichment + insert + embedding path the webhook uses.

### When to use it
- An agent run has been **Running** for more than ~5 minutes (the lazy timeout sweep usually flips long-running rows to Failed on the next dispatch — replay still works on the Failed→retry flow only if you first reset its status; see "Idempotency" below).
- You can see the dataset in https://console.apify.com → **Storage** → **Datasets** with items in it.

### Find the dataset ID
Apify console → **Storage** → **Datasets** → click the row tied to the broken run. The ID looks like `ffeKO5Oq7meoNAXLf` and shows in the URL and the right-hand panel.

### Call the endpoint

```bash
curl -X POST https://denver-trades.vercel.app/api/admin/apify/replay \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"agentRunId":"<uuid-of-agent_runs-row>","datasetId":"<apify-dataset-id>"}'
```

Expected response on success:
```json
{ "success": true, "processed": 5, "created": 5, "datasetId": "...", "agentRunId": "..." }
```

### Idempotency
The endpoint refuses to replay any run whose status is already `Success` or `Failed` — it returns **409** `{ "success": false, "error": "Run already terminal — refusing to replay" }`. To intentionally re-run a previously terminal row, flip it back to `Running` first:

```sql
UPDATE agent_runs
SET status = 'Running', completed_at = NULL, error_log = NULL
WHERE id = '<uuid>';
```
…then re-issue the curl above.

### Backfill missing embeddings

If a batch of companies was created while `OPENAI_API_KEY` was missing (or any provider hiccup happened), their `embedding` column is null and they won't appear in `/api/search/semantic` results. Two ways to backfill:

**Option A — from your browser (signed-in, no terminal):** open https://denver-trades.vercel.app/dashboard on any page where you're logged in, hit `F12` to open dev tools, paste this into the Console:

```js
fetch('/api/agents/backfill-embeddings', { method: 'POST' }).then(r => r.json()).then(console.log)
```

Within ~5s the console logs `{ success: true, processed: N, embedded: N, failed: 0, errors: [] }`. The user-context proxy calls the admin endpoint server-side with `CRON_SECRET` from Vercel env, so the secret never reaches the browser.

**Option B — from any terminal:**

```bash
curl -X POST https://denver-trades.vercel.app/api/admin/embeddings/backfill \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"limit": 100}'    # body optional; default limit = 50, max 500
```

Either way: the endpoint picks up any company row with `embedding IS NULL`, recomputes the vector via OpenAI, and writes it back. Individual failures are logged and returned in the `errors` array — they don't abort the batch.

---

## 2. Wire your Twilio WhatsApp number to the org (2 min)

So inbound messages route correctly. Get your `TWILIO_WHATSAPP_NUMBER` value from Vercel (format `whatsapp:+14155238886`) and run via the Supabase SQL editor:

```sql
UPDATE organizations
SET twilio_whatsapp_number = 'whatsapp:+14155238886'  -- your actual Twilio number
WHERE id = '<your-org-id>';
```

To find your org id:
```sql
SELECT id, name FROM organizations;
```

Without this, the WhatsApp webhook falls back to single-tenant mode (works for now, won't scale to multiple orgs).

---

## 3. Optional: enable live email outreach (10 min, if you want email)

1. Sign up at https://resend.com (free 3,000 emails/mo).
2. Add a sending domain or use their test domain.
3. Get the API key.
4. ```bash
   vercel env add RESEND_API_KEY production       # paste the key
   vercel env add RESEND_FROM_EMAIL production    # paste outreach@yourdomain.com
   vercel redeploy --prod
   ```

Until you do this, `/api/outreach/email/send` runs in simulation mode (records the row, doesn't dispatch).

---

## 4. Optional: enable Vercel AI Gateway (2 min, recommended)

Free observability + automatic provider fallback. Open the Vercel project → **AI** tab → **Enable AI Gateway**. That's it — the AI SDK auto-detects and routes through. Code stays the same. You get a cost/latency dashboard.

---

## 5. Optional: custom domain (15 min)

Vercel project → **Domains** → add `app.denver-trades.com` (or whatever). Update DNS at your registrar. Then:

```bash
vercel env rm NEXT_PUBLIC_SITE_URL production
vercel env add NEXT_PUBLIC_SITE_URL production
# Paste: https://app.denver-trades.com
vercel redeploy --prod
```

Apify webhook callback URLs become stable (no more hash-in-the-host). Looks more professional to customers.

---

## 6. Seed real data — three options

Currently you have **3 companies + 3 deals** (demo). To get to "go live with real data":

### Option A — fastest: run the Lead Scraper multiple times
Open `/dashboard/agents`, change the query, click Run, repeat. Each run yields ~5 enriched companies.

```
"Black pepper importers Dubai"
"Cardamom exporters Sri Lanka"
"Coffee buyers Saudi Arabia"
"Cashew suppliers Vietnam"
"Rice exporters India to UAE"
"Tea brokers Mombasa Kenya"
```

5–7 runs × 5 companies = 25–35 real businesses. Then `/dashboard/search` shows live data.

### Option B — import a CSV you already have
Share the columns and we can write a one-shot SQL importer.

### Option C — best long-term: add a second Apify actor for ImportYeti / Panjiva / customs data
Update `APIFY_ACTOR_ID` to point at a real trade-data actor. See section 9 below for the matrix and the exact env values.

---

## 7. Lock down the workflow (1 min)

GitHub repo → Settings → Branches → require PR + CI green before merge to `main` (P2-17). Stops accidental direct-to-prod pushes.

---

## 8. Smoke-test the whole flow with a fresh user (Wave 2 edition)

Open the production URL in an **incognito window**. Sign in with a different Google account. Walk through:

### Core
1. **Dashboard** renders (real name in topbar, Active Demand feed visible above Recent activity)
2. **Sidebar** is grouped into MARKET RESEARCH / CRM / TOOLS sections
3. **Cmd+K** fuzzy search → navigates correctly, recent items shown

### Find Buyers / Find Sellers
4. Click **Find Buyers** in sidebar → page title "Find buyers", coral BUYS chips on every card, intent pill row shows "Buyers" active
5. Click **Find Sellers** → page title flips to "Find sellers", lime SELLS chips, Exporter rows surface
6. Start typing in the search input (e.g. "pep") → AI suggestion dropdown appears with 5 ranked matches
7. Click a company name → lands on **dossier** with 4 tabs (Overview / Shipment History / Commodities / Contacts) and BUYS/SELLS/BROKER chip in the hero
8. Click a commodity chip in the dossier → cross-links back to search with that product as query

### Pipeline
9. **Pipeline** → 9 columns from New Lead to Closed Lost, color-coded top accents
10. Each card carries a `LEAD-OPP-2026-NNNNN` monospace ID
11. Drag a card between columns → "Saving…" lime pill flashes → flips to "Saved" → refresh confirms persistence
12. Empty columns show a dashed-border tile with the stage description

### Agents
13. **Agents** → click **Run now** on Lead Scraper Agent
14. Within ~15-20s a new Success row appears with "+N leads" in Created
15. Click **"View leads"** chevron on that Success row → 5 mini-cards expand inline (BUYS/SELLS chips, locations, products) — **no tab-switch needed**
16. Each mini-card name links to the dossier

### Outreach
17. From the dossier, click **Generate outreach** → outreach page opens with company name prefilled
18. From an Active Demand card on `/dashboard`, click **Generate quote →** → outreach opens with both company name AND product prefilled
19. Click Generate pitch → tokens stream in live

### Documents + WhatsApp
20. **Documents** → upload an L/C + B/L pair → run audit → discrepancy report renders
21. Send a WhatsApp message to your Twilio sandbox number from a registered tester ("Hi, looking for 2 containers of black pepper CIF Jebel Ali")
22. Within ~5s the message lands in the WhatsApp inbox AND appears as a card in the **Active Demand** feed with structured fields

### Notifications + realtime
23. **Notifications bell** → realtime updates when new agent runs land
24. Bell badge tracks unread vs your `denver:notif-last-seen` localStorage timestamp

If every step lands, **you're live**.

---

## 9. Switching to customs-data enrichment

The Lead Scraper agent dispatches an Apify actor. Out of the box it uses `compass~crawler-google-places` — Google Maps. That's **business-directory data**: name, website, phone, city, country. Good for bootstrapping a directory; not provably-true buyer intent.

For provably-true intent ("This US importer brought in 47 containers of black pepper from Vietnam in the last 12 months") you want a **customs-data actor**. Two are pre-wired into the dispatch — flip a single env var, no code change.

### How to flip

```bash
# Pick one of the supported actor ids and paste into the prompt:
vercel env add APIFY_ACTOR_ID production

#   compass~crawler-google-places       (DEFAULT — Google Maps directory)
#   zen-studio~importyeti-scraper       (Customs data — primary upgrade)
#   lulzasaur~importyeti-scraper        (Customs data — budget alternative)

vercel redeploy --prod
```

Anything outside that list falls back to the default. The actor id is round-tripped through the webhook callback URL, so dataset items get mapped by the correct adapter on the way back in and stored with `enrichment_source = apify:<dataset>:<actor>`. The dossier page reads that string and shows the source as a chip ("Source: Customs data — ImportYeti").

### Trade-off matrix

#### `compass~crawler-google-places` — Google Maps (directory)
**Default.** Free tier on Apify, ~200k+ users on the actor page, very stable. Returns business listings: company name, website, phone, city, country, address, category. **No shipment data.** Best for: bootstrapping a fresh directory in a region, finding businesses by city ("Spice exporters in Vietnam"), warm-up before you know what HS codes to chase. Cost: ~$0.005 per result on Apify's pay-per-result tier. Geographic coverage: anywhere Google Maps has a presence (i.e. everywhere).

Example queries:
- `"Black pepper importers Dubai"`
- `"Cardamom exporters Sri Lanka"`
- `"Tea brokers Mombasa Kenya"`

#### `zen-studio~importyeti-scraper` — ImportYeti customs data (recommended upgrade)
**The strategic upgrade.** Scrapes ImportYeti's customs index. Pulls 60+ fields per record: total shipments, most recent shipment date, top trading partners (with country breakdown), HS-coded products, shipping lanes, carriers, bills of lading. Data is sourced from US Customs declarations + public business databases, so coverage is strongest for **US imports** and the foreign suppliers shipping into the US. Cost: $6.99 per 1,000 results on free tier, down to $4.99 on Business. Last updated within the past month. ~51 monthly active users on the actor.

Use this when you want a buyer-intent signal you can actually quote at a sales call: *"I see you imported 12 containers of black pepper from Vietnam last quarter — here's a quote that beats your last landed cost by 4%."*

Example queries:
- `"black pepper"` (product keyword — surfaces top US importers buying it)
- `"organic cardamom"`
- `"PEPPER FACTORY"` (specific supplier name — pulls their shipment history)
- `"Atlanta"` (location — pulls importers in that metro)

#### `lulzasaur~importyeti-scraper` — ImportYeti customs data (budget alternative)
Same data source as the zen-studio actor, cheaper at $5/1k results, fewer fields per record (no shipping-lane breakdown, no notify-party table). Supports `mode: company | shipments | search` so you can do focused per-company shipment pulls later — useful when you already have a company name from another source and want their customs history without re-searching. Lower usage (~8 monthly active) so the maintenance signal is weaker; consider zen-studio first unless cost is the bottleneck.

Example queries: same shape as zen-studio (the query field is named `searchQuery` here but you send the same strings).

### What to expect after the flip

1. Next time you click **Run now** on Lead Scraper, the Apify dispatch goes to the new actor.
2. The Apify console run page shows the actor name — confirm before paying.
3. Within ~2 min the webhook fires and the agent run flips to Success.
4. New company cards on `/dashboard/search` show richer products (real HS-coded items, not generic categories) and the dossier hero shows a "Source: Customs data — ImportYeti …" chip.
5. Existing companies created under the old actor keep working — the `enrichment_source` lookup is `like 'apify:<dataset>%'` so the agents-dashboard drill-down matches both formats.

### Rollback

```bash
vercel env rm APIFY_ACTOR_ID production
vercel redeploy --prod
```

…and you're back to Google Maps. No data migration needed — old rows stay, new rows go to the new default.

### Why no Panjiva / Tridge actor in the matrix?

I evaluated the Apify store on 2026-05-22:
- **Panjiva** — no first-party or community actor exists. Panjiva's data is gated behind an S&P Global subscription and the site enforces aggressive anti-bot measures; community actors that tried have been abandoned (last activity > 12 months). Recommendation: if you need Panjiva specifically, get a paid Panjiva API key directly from S&P Global Market Intelligence and write a custom enrichment actor.
- **Tridge** — no Apify actor. Tridge has their own developer portal; integration would be a custom REST adapter, not an Apify actor swap.
- **Other "customs scraper" actors** (`saswave/capitol-trades-scraper` etc.) — focused on political trading (US congressional disclosures), not commercial trade.
- **`parseforge/importyeti-scraper`** — viable third option but at $30/1k it's 4–6× the cost of the picked actors for the same data source. Not added to the registry to keep the matrix decisive.
- **`jungle_synthesizer/importyeti-bill-of-lading-scraper`** — a deeper drill-down ($0.001/record) requiring company **slugs** as input rather than a free-text search. Better suited for a future "load shipment history for company X" feature than the current Lead Scraper. Not in the registry yet — when we add per-company shipment pulls we'll wire this in.

---

## What to do when something breaks

- `vercel logs` — runtime errors with full stack
- Supabase dashboard → Logs → API / Database logs
- Each agent run writes a row in `agent_runs` with `error_log` on failure — query `SELECT * FROM agent_runs WHERE status = 'Failed' ORDER BY started_at DESC LIMIT 20`
- Rate limit hits return 429 with `X-RateLimit-Remaining` header
- 401 from any API = auth cookie expired, sign in again

---

## Known limitations (acceptable for v1)

- **Notification "mark all read" is local-only.** Page refresh resets the unread count. Real persistence needs unifying the activity-feed and notifications data sources (P3-9 follow-up).
- **Rate limits are per-Vercel-instance.** With ~100 concurrent users this is fine. Beyond that, install Vercel KV / Upstash and swap the in-memory store (see `src/lib/security/rateLimit.ts` header).
- **5 dashboard pages are client-rendered.** They have interactive state (drag-drop, file upload, realtime, forms). Convert to RSC later if first-paint metrics demand it.
- **`commodity_prices` is global** (no per-org scoping). By design — market prices are universal. Switch later if you want per-org price feeds.

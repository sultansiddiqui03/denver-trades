# Denver Trades — Go-live runbook

Pre-flight steps to take **before** sharing the production URL with real customers. Estimated total time: **30 minutes** (most of it Resend domain verification).

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
Update `APIFY_ACTOR_ID` to point at a real trade-data actor. Many available on Apify.

---

## 7. Lock down the workflow (1 min)

GitHub repo → Settings → Branches → require PR + CI green before merge to `main` (P2-17). Stops accidental direct-to-prod pushes.

---

## 8. Smoke-test the whole flow with a fresh user

Open the production URL in an **incognito window**. Sign in with a different Google account. Walk through:

1. Dashboard renders (real name in topbar)
2. Search returns results
3. Agents → trigger Lead Scraper → wait → see new companies
4. Pipeline → drag a deal between columns → refresh → persists
5. Outreach → generate pitch → see streaming
6. Documents → pre-fill → audit → see discrepancies
7. Notifications bell → realtime updates when new agent runs
8. Cmd+K → fuzzy search → navigates correctly

If everything in this list works, **you're live**.

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

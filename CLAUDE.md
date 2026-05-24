@AGENTS.md

# Denver Trades — Project Doc

## What this is
B2B lead-gen / CRM for commodity-trade companies (spice/agri exports & imports). Tracks companies, shipments, deals, commodity prices; runs AI agents for lead scraping (Apify), enrichment, outreach generation, document audit. WhatsApp inbox via Twilio. Realtime activity feed and notifications via Supabase.

## Stack
- **Framework:** Next.js 16.2.6 (App Router, Turbopack) + React 19.2.4 + TS 5
- **DB / Auth:** Supabase (Postgres 17.6, RLS, region `ap-south-1`, project `edahefbttohwmdokptoc`)
- **AI:** Vercel AI SDK v6 (`ai` + `@ai-sdk/anthropic` + `@ai-sdk/google`); router at [src/lib/ai/router.ts](src/lib/ai/router.ts). Default Claude model: `claude-sonnet-4-6` (3.5 retired). Default Gemini model: `gemini-2.5-flash`. JSON / multimodal-JSON paths use AI SDK v6's `Output.object({ schema })` with a zod schema per call. `openai` package retained for embeddings only. Env: `CLAUDE_API_KEY` and `GEMINI_API_KEY` are mirrored into `ANTHROPIC_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` on module load.
- **Scraping:** Apify (`apify~google-maps-scraper`) with webhook callback
- **Messaging:** Twilio WhatsApp
- **Charts:** Recharts 3
- **Hosting:** Vercel — team `mohd-sultan-siddiquis-projects`, project `denver-trades` (`prj_j7M3RpZiAnLgyFIgHpRF604ByVr1`)
- **Repo:** github.com/sultansiddiqui03/denver-trades (private, single branch `main`)

## Where things live
```
src/
  app/
    page.tsx                 Landing
    layout.tsx               Root layout (fonts, providers)
    auth/                    Sign-in / callback routes
    dashboard/               Authenticated app shell
      layout.tsx             Sidebar + topbar + cmd-k
      page.tsx               Overview
      agents/                AI agent runs
      analytics/             Recharts dashboards
      companies/             Company directory
      documents/             Doc auditor
      outreach/              Email/WhatsApp campaigns
      pipeline/              Deals kanban
      prices/                Commodity prices
      search/                Saved searches
      settings/
    api/
      agents/run/            Agent dispatch
      companies/             CRUD + enrich
      dashboard/             Stats endpoints
      documents/             Audit endpoints
      outreach/              Generate copy
      prices/                Ingest + cron
      search/                Search endpoint
      webhooks/apify/        Apify result receiver
      webhooks/whatsapp/     Twilio inbound
  components/                One *.tsx + *.module.css per component
  lib/
    ai/                      router.ts, claude.ts, gemini.ts, openai.ts (unused)
    auth/server.ts           requireUserContext()
    security/request.ts      HMAC / Bearer / Twilio sig helpers
    supabase/                admin (service role), client, server, proxy clients
    errors.ts                getErrorMessage()
    exportCsv.ts
  proxy.ts                   Routing middleware (Next 16 renamed it from middleware.ts)
supabase/
  schema.sql                 Snapshot (out of sync — see ROADMAP)
  seed.sql
  migrations/
    20260520193000_auth_rls_hardening.sql
    20260520194500_optimize_rls_auth_calls.sql
public/                      Stock Next.js SVGs (clean)
vercel.json                  Cron only (1 entry)
next.config.ts               Empty (needs security headers — see ROADMAP)
```

## Common commands
- `npm run dev` — Next dev server
- `npm run build` — production build (Turbopack)
- `npm run lint` — ESLint (no custom rules yet)
- No `typecheck`, `format`, or test scripts yet — see ROADMAP

## Conventions
- **Auth boundary:** every mutating API route calls `requireUserContext()` from [src/lib/auth/server.ts](src/lib/auth/server.ts) and scopes writes by `orgId`.
- **Service role:** `getSupabaseServiceClient()` from [src/lib/supabase/admin.ts](src/lib/supabase/admin.ts) is **only** for webhook ingestion and cron. Anywhere else, use the user-context server client.
- **Webhook security:** validate via [src/lib/security/request.ts](src/lib/security/request.ts). Prefer the `x-denver-webhook-secret` header over query-string secrets (the current Apify dispatch uses query strings — see ROADMAP critical item).
- **Multi-tenancy:** every domain table carries `org_id` **except** `commodity_prices` (intentionally global, TBC in roadmap).
- **Styling:** CSS Modules — one `Foo.module.css` next to each `Foo.tsx`. **Dark-only by design** — no light theme planned. All tokens (colors, spacing, radii, shadows, typography) live in [globals.css](src/app/globals.css) `:root`; component modules should reference those vars rather than raw hex.
- **Charts:** Recharts; chart components are client-only — wrap in Suspense / memo when added (current code doesn't).
- **AI calls:** route through [src/lib/ai/router.ts](src/lib/ai/router.ts). Today it silently returns mock data on error — being replaced (see ROADMAP).

## Environment variables
A `.env.example` is **missing** — to be added. Required envs grouped:
- **Supabase:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **AI:** `CLAUDE_API_KEY`, `GEMINI_API_KEY` (`OPENAI_API_KEY` is unused dep)
- **Apify:** `APIFY_TOKEN` (or `APIFY_API_TOKEN`), `APIFY_ACTOR_ID` (opt), `APIFY_WEBHOOK_SECRET`
- **Twilio:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`
- **Resend (email):** `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (verified Resend domain sender) — without these, `/api/outreach/email/send` runs in simulation mode
- **Security:** `CRON_SECRET`
- **App:** `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL`, `DENVER_TRADES_DEFAULT_ORG_ID` (legacy fallback — should be removed)

## Deploy flow
Push to `main` → Vercel auto-deploys to production (no preview/PR workflow currently — see ROADMAP). Vercel cron triggers `GET /api/prices?cron=true` at `0 2 * * *`. Bundler: Turbopack. Runtime: Node.js.

## Important files
- [ROADMAP.md](ROADMAP.md) — prioritized backlog + current focus
- [deployment_guide.md](deployment_guide.md) — manual deploy steps (may be partly outdated)
- [supabase/schema.sql](supabase/schema.sql) — DB snapshot
- [supabase/migrations/](supabase/migrations/) — applied DDL

## How to use this doc
This file is orientation. When starting significant work:
1. Update **Current focus** below with what you're doing and the related ROADMAP items.
2. As items complete, move them out of ROADMAP.md (or strike through with a note).
3. Add notable architectural decisions to **Recent decisions** so future-you has the why.

## Current focus
**Trade-intelligence moat (2026-05-25).** Shipping the customs-data wedge: capture every field ImportYeti returns, score every company for buyer-fit, and rank buyers in a Buyer-Match engine — see the top Recent decisions entry. Follow-ups: (1) confirm dossier/matches visuals on the prod deploy (couldn't auth locally); (2) to make the live Lead Scraper pull customs data instead of directory data, set `APIFY_ACTOR_ID` to an ImportYeti actor (`zen-studio~importyeti-scraper`, `lulzasaur~importyeti-scraper`, or `7sDq1LHYZAlHQS9yW`) in Vercel — verify that actor's input contract first; (3) the buyer-fit weights/taxonomy in [buyerFit.ts](src/lib/scoring/buyerFit.ts) are a sensible v1, tune on real feedback.

**Roadmap closed.** Phase 0: 12/12 ✅ · Phase 1: 13/14 ✅ · Phase 2: 13/17 ✅ · Phase 3: 15/18 ✅ · Phase 2.5: Resend + Embeddings + semantic-search UI + streaming + rate limiting all ✅.

Items not shipped — each with an explicit reason in [ROADMAP.md](ROADMAP.md):
- **P1-13** Supabase leaked-password protection — your dashboard toggle.
- **P2-4** Vercel Workflow — deferred indefinitely (current Apify path already durable enough; revisit on reliability complaint).
- **P2-5** 5 of 8 dashboard pages stay client — interactive state pays the JS cost.
- **P2-15** unused indexes — wait for real traffic patterns.
- **P2-17** branch protection — your GH repo settings.
- **P3-10** card consistency — intentionally not converged (component-internal cards have layout-specific affordances).
- **P3-14** page transitions — experimental in Next 16; existing `.fade-in` covers basic case.

When the time comes to flip things on (Vercel AI Gateway, Vercel KV for distributed rate limits, Resend domain): the code is already shaped to accept those — see the per-item notes in ROADMAP. Production deployed. **Update 2026-05-25:** `CLAUDE_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `CRON_SECRET` are all confirmed present in Vercel production envs (verified from the dashboard) — the earlier "CLAUDE_API_KEY missing" warning is resolved; outreach/enrich/search AI is live. `APIFY_ACTOR_ID` is set and recent scrapes used `zen-studio~importyeti-scraper` (customs data). Phase 1 remaining: P1-3 + P1-4 + P1-14 (WhatsApp tenant routing bundle), P1-5 (zod validation), P1-13 (Supabase dashboard toggle).

## Recent decisions
- **2026-05-25 (wave 5)** — **Real-time opportunity detection engine** (migration `20260525140000`, commit `dc7a5a7`, deployed prod). Turns the passive Live Feed into a scored, alerting action queue.
  - **`opportunities` table** (org-scoped RLS via `app_private.current_org_id()`): `type` (demand_match | supplier_switch | new_fit_buyer), title, summary, priority 0-100, company_id/thread_id, evidence jsonb, status (new|viewed|acted|dismissed), `dedupe_key` unique per org (so re-detection upserts, never duplicates).
  - **Detectors** ([src/lib/opportunities/detect.ts](src/lib/opportunities/detect.ts)) — pure: demand_match (inbound `extracted_demand` whose product matches org commodities via the buyerFit taxonomy — `matchesOrgCommodity` now exported), supplier_switch (switching/declining signal + commodity match, priority 76-100), new_fit_buyer (buyer_fit≥70, Importer, commodity match). [runDetect.ts](src/lib/opportunities/runDetect.ts) upserts (ignoreDuplicates) + raises a `notifications` row for priority≥80.
  - **Real-time triggers**: the WhatsApp webhook calls `detectFromDemand` right after demand extraction; scrape ingest (company-mode in apifyReplay + shipments-mode via `recomputeCompanyTradeAggregates`) calls `detectFromCompany`. So an opportunity is created the moment its event lands, and the inbox + NotificationCenter (both Supabase-realtime) surface it instantly.
  - **APIs**: `GET /api/opportunities` (open, priority desc), `POST /api/opportunities/detect` (user rescan → `detectAndStoreForOrg`), `PATCH /api/opportunities/[id]` (status). **`/dashboard/opportunities`** inbox: realtime-subscribed, priority-ranked, type badges, dismiss/outreach actions, sidebar entry (Flame).
  - **Seed**: 11 demo opportunities mirroring detect output (1 switch @96 Al-Rashid, 3 fit-buyers 72-100, 7 demand @88). Coffee buyers correctly excluded for the spice-seller org.
- **2026-05-25 (wave 4)** — **Market-intelligence analytics + live Trade Feed** (commit `f4db62c`, deployed prod).
  - **Analytics**: `/dashboard/analytics` gained a "Trade Intelligence" section (in [AnalyticsClient.tsx](src/app/dashboard/analytics/AnalyticsClient.tsx) + new `charts/` components) — monthly import volume by commodity (stacked area), top origins, top growing importers, commodity price trends, headline stats. Backed by `GET /api/analytics/market` (org-scoped JS aggregation over shipments + commodity_prices).
  - **Live Trade Feed**: new `/dashboard/live` — a merged, date-desc stream of `contract` (new shipments), `demand` (inbound `extracted_demand`), and `signal` (switching/declining) events, with **Supabase realtime** INSERT subscriptions on `shipments` + `outreach_threads` (same pattern as NotificationCenter/WhatsAppInbox) prepending live. `GET /api/live` builds the initial feed; sidebar nav added.
  - **Fix**: matches page Active-Demand filter was `direction = 'inbound'` but the `outreach_threads.direction` CHECK only allows `'Inbound'`/`'Outbound'` — corrected to `'Inbound'` so inbound demand actually shows.
  - **Seed**: 7 inbound WhatsApp demand signals (tagged `extracted_demand._seed=true`) across the org commodities so the feed + Active-Demand picker + Buyer-Match demand path aren't empty.
- **2026-05-25 (wave 3)** — **Shipments-mode ingestion + tuned displacement + signals backfill** (commit `9437cb7`, deployed prod). Makes the per-shipment timeline pull from a real actor instead of only seeded data.
  - **Shipments-mode actor**: `ScraperActor` gained `dataKind: 'shipments'`, an `apifyActorId` (real Apify id, distinct from the synthetic registry key), `defaultRunSize`, and an optional `mapShipmentRow`. Registered `lulzasaur~importyeti-scraper~shipments` (runs the lulzasaur actor in `mode: 'shipments'`; field mapping per the actor's documented output — `buyerName, supplierName, productDescription, hsCode, shipmentDate, weight, portOfLading/Unlading, country, vesselName` — verified via the Apify store page; confirm against a live run).
  - **Grouped ingestion** ([shipmentIngest.ts](src/lib/agents/shipmentIngest.ts)): shipments mode returns a FLAT list of shipment rows, so `enrichAndInsertShipments` groups by buyer, upserts the company, bulk-inserts shipments, then `recomputeCompanyTradeAggregates` derives total/last/top_suppliers/hs_codes/partners + buyer-fit + signal. A single `ingestApifyDataset` branch point (used by the webhook receiver AND admin replay) routes on `actor.dataKind`. Dispatch now uses `actor.apifyActorId` + `actor.defaultRunSize` (200 for shipments).
  - **Tuned thresholds** ([supplierShift.ts](src/lib/signals/supplierShift.ts)): min-history guards (≥5 total, ≥2 recent), switch now requires the prior-top to fall ≥40% AND the new top to hold ≥40% recent share, declining at <60% of prior rate (was 70%), growing at >140%, a dormant detector ("imports paused"), and a `confidence` field.
  - **`POST /api/admin/companies/signals-backfill`** (Bearer CRON_SECRET) recomputes `sourcing_signal` for all companies with shipments — run after tuning.
  - **UI**: agents source-picker gained a "Full shipment history" option (the shipments actor); the Buyer-Match leaderboard shows the sourcing-signal badge.
  - Note: the seeded demo signals remain hand-set jsonb (the tuned algorithm reproduces them); real shipments-mode runs/the backfill recompute via the canonical JS path.
- **2026-05-25 (wave 2)** — **Shipment/contract detail + supplier-shift signal + Demand Radar + grounded outreach** (migration `20260525130000`, commits `49b05e3` signals foundation, `fda39c5` feature UI; deployed prod). Builds on the moat below.
  - **Migration**: `shipments` gains contract economics (`supplier_name, origin_country, destination_country, value_usd, quantity_mt, incoterm`) + date indexes; `companies` gains `sourcing_signal` (jsonb) + `sourcing_signal_at`.
  - **Supplier-shift signal** ([src/lib/signals/supplierShift.ts](src/lib/signals/supplierShift.ts)): compares recent vs prior shipment windows → `{status: switching|declining|growing|stable|new, headline, intent, dropPct, decliningSupplier, topSupplierNow, newOrigins, evidence}`. Persisted by [runSignals.ts](src/lib/signals/runSignals.ts), computed on scrape ingest; the scraper adapter now also parses a per-shipment array when an actor exposes one. Shared `SourcingSignalBadge` component.
  - **Dossier**: Shipment History tab now has a shipments-per-month area chart + a contracts table (date · product · qty MT · value · origin→dest lane · incoterm · supplier); signal badge in hero + on directory cards.
  - **Demand Radar** (`/dashboard/radar`, `/api/radar`): "what's needed where" (product × destination, buyer count, volume, value, top buyers) + "buyers shifting suppliers" (high-intent displacement list w/ one-click outreach).
  - **Grounded outreach**: `/api/outreach/generate` (+ stream) accept `company_id` and inject a customs-verified "buyer intelligence" block (volume, origins, suppliers, HS codes, switching signal) so pitches cite real evidence.
  - **Seed**: 6 demo importers got 18 months of monthly shipment/contract rows + matching signals (Al-Rashid & Atlas Coffee = switching, EuroFoods = growing, VendiBean = declining, 2 stable). Signals seeded via SQL (canonical JS runner runs on real ingest). Note: real per-shipment capture only fires when the actor returns shipment-level rows; the registered ImportYeti actors return company summaries, so existing scraped companies have aggregates but no per-shipment timeline until a shipments-mode actor is used.
- **2026-05-25** — **Customs-data moat + buyer-fit scoring + Buyer-Match engine** (commits `2c91ff5` foundation, `f66f466` shared UI, `493e749` feature UI). The ImportYeti-class actors return customs-grade signal (shipment volume, suppliers, HS codes, trademarks, profile URL) that the adapter layer was flattening into a prose `description` and letting Gemini re-interpret — the most defensible data in the product was being discarded. This wave captures and surfaces it.
  - **Migration** `20260525120000_company_trade_intelligence.sql`: adds `companies.{total_shipments, last_shipment_date, source_url, top_suppliers(jsonb), hs_codes(jsonb), top_trading_partners(jsonb), trademarks(jsonb), trade_metrics(jsonb), buyer_fit_score(numeric 0-100), score_breakdown(jsonb), scored_at}` + index `(org_id, buyer_fit_score desc)`. Applied to prod; advisors clean.
  - **Capture**: `ScrapedPlace` DTO extended; a shared `mapImportYetiRecord` in [scraperActors.ts](src/lib/agents/scraperActors.ts) parses structured fields defensively for all ImportYeti actors (zen-studio, lulzasaur, + the console actor `7sDq1LHYZAlHQS9yW` now registered). Persisted verbatim in [apifyReplay.ts](src/lib/agents/apifyReplay.ts) — **facts are never LLM-laundered**. `confidence_score` now derived from source quality, not a hardcoded 0.92.
  - **Scoring**: [src/lib/scoring/buyerFit.ts](src/lib/scoring/buyerFit.ts) `scoreBuyerFit(company, org)` → 0-100 (commodityMatch 40 / shipmentVolume 25 / recency 15 / tradeDirection 10 / marketFit 10) + reasons. Includes a commodity + market **taxonomy** so generic org terms ("spices", "UAE", "Europe") match specific products/countries. Companies auto-scored on scrape ingest; `POST /api/companies/score` (user) + `/api/admin/companies/score-backfill` (CRON_SECRET).
  - **Flagship**: `/dashboard/matches` Buyer-Match engine — pick a commodity (or an Active Demand signal) → ranked best-fit buyers via `scoreBuyerFit` against `{commodities:[picked], target_markets}` → reasons + one-click outreach deep-link. `POST /api/matches`. Sidebar nav added.
  - **Dossier**: the fake "Shipment History" tab is now real (Recharts HS-code chart, top suppliers/partners, trademarks, source link); hero shows score + breakdown; cards (directory + search) show `BuyerFitBadge` + shipment stat; directory sorted by score.
  - **Seeding**: the dev org's 27 companies + the onboarding seed now carry realistic customs metrics + scores so demos aren't empty (heroes: EuroFoods 100, Al-Rashid 73, Gulf Spices 72). Seed scores were written via SQL mirroring the JS formula because local env lacks `SUPABASE_SERVICE_ROLE_KEY`/`CRON_SECRET` (the canonical scorer runs in prod on ingest / via the backfill endpoint).
  - **Verified**: `typecheck` + `lint` clean, `next build` green (47 routes), landing renders, authed routes 307. NOT visually verified in an authed browser locally (no service-role key locally → can't log in); confirm dossier/matches visuals on the prod deploy.
- **2026-05-22** — **Onboarding wizard** ships the first-customer experience. Before this, new users signed in with Google and silently got auto-linked to the Sultan Trades org via `DEFAULT_ORG_ID` — fine for one developer, blocking for everyone else.
  - New route `/onboarding` is a Server Component shell ([page.tsx](src/app/onboarding/page.tsx)) that decides where to land based on `users.org_id` + `users.onboarding_step` + `organizations.onboarding_complete`, then hands off to a Client wizard ([OnboardingWizard.tsx](src/app/onboarding/OnboardingWizard.tsx)).
  - **Step 1** — org name + auto-suggested slug + commodity multi-select (lime chip grid) + target markets. `POST /api/onboarding/org` uses the service-role client (the user has no `org_id` yet so RLS would reject) — same auth-boundary justification as webhook receivers. Slug collision: retry once with a 4-digit random suffix on Postgres `23505`, then surface the error.
  - **Step 2** — Twilio WhatsApp number (skippable). `POST /api/onboarding/twilio` normalizes `+14155238886` ↔ `whatsapp:+14155238886` ↔ raw digits into the canonical `whatsapp:+<E.164>` shape, surfaces the `idx_organizations_twilio_whatsapp_number` unique-violation as a friendly 409.
  - **Step 3** — sample data seed (skippable). `POST /api/onboarding/seed` creates 3 spice-trade demo companies (Al Khaleej Spice Imports / Kerala Cardamom Exports / Singapore Commodity Brokers) tagged `sample` for cleanup, plus 2 demo deals (one `New Lead`, one `Negotiation`). Idempotent by tag — re-running is a no-op. Marks `onboarding_complete = true` + clears `onboarding_step` on success. `POST /api/onboarding/complete` is the skip-seed equivalent.
  - **Gate** lives in `dashboard/layout.tsx` — converted from Client to Server Component, with the interactive chrome extracted to [DashboardShell.tsx](src/app/dashboard/DashboardShell.tsx). Layer choice (per spec): NOT in the proxy — the Server Component layer reads user context cleanly via the existing auth helpers, the proxy stays focused on session refresh + pure auth redirects.
  - **`ensureUserProfile()` refactored** ([src/lib/auth/server.ts](src/lib/auth/server.ts)) — no more auto-assigning DEFAULT_ORG_ID. New users land with `org_id = null`, `onboarding_step = 1`, `role = 'member'`. Existing users (the dev) are untouched — the function returns their row as-is. `getUserContext()` now returns null when `org_id` is null so dashboard pages still bounce correctly; new `getOnboardingContext()` + `requireOnboardingContext()` helpers allow the onboarding API routes to authenticate a user without an org.
  - **Proxy matcher extended** to `/onboarding` + `/onboarding/:path*` so the Supabase session cookie refreshes there too.
  - **Known follow-ups**: `DEFAULT_ORG_ID` env var is still referenced for back-compat but no longer used as a write target — can be deleted after the dev profile is verified to no longer depend on it; auth callback could short-circuit straight to `/onboarding` for never-onboarded users (currently it goes to `/dashboard` and the layout gate rebounces — one extra redirect, harmless).
- **2026-05-22** — **Per-org deal_code sequences** (migration `20260522120000_per_org_deal_code.sql`). Previously `LEAD-OPP-2026-NNNNN` was a global sequence under unique index `idx_deals_pipeline_deal_code` — two tenants couldn't share the same code so the second org would have started at e.g. `00037`. Migration:
  - Adds `organizations.deal_code_prefix TEXT NOT NULL DEFAULT 'LEAD-OPP'` with `CHECK (deal_code_prefix ~ '^[A-Z0-9-]{2,12}$')` so a slash/space can't sneak in and break the `<PREFIX>-<YEAR>-<NNNNN>` format.
  - Drops the global unique index and replaces it with `deals_pipeline_deal_code_org_uidx` on `(org_id, deal_code) WHERE deal_code IS NOT NULL` — each org now has an independent counter starting at 00001.
  - Existing rows are NOT renumbered. Sultan Trades keeps its current `LEAD-OPP-2026-NNNNN` codes; new orgs start fresh.
  - `mintNextDealCode(supabase, orgId)` in [src/app/api/deals/route.ts](src/app/api/deals/route.ts) looks up the org's prefix, then `SELECT MAX(deal_code) WHERE org_id = ? AND deal_code LIKE '<PREFIX>-<YEAR>-%'`. Unique-violation retry preserved.
  - New backend-only endpoint `PATCH /api/org` lets the org `owner` change `deal_code_prefix` (zod-validated, auto-uppercased, role-gated). No UI surface yet — `curl` with session cookie is the way for now. Acme Spice Co would `PATCH {deal_code_prefix: "ACME"}` and their next deal mints as `ACME-2026-00001`.
  - Verified by SQL transaction: inserted `LEAD-OPP-2026-00001` into a second org while Sultan Trades already holds that code; both coexist under the new index; CHECK rejected `bad slash/`. Rolled back.
- **2026-05-21** — Initial repo audit completed. Findings split between [CLAUDE.md](CLAUDE.md) (orientation) and [ROADMAP.md](ROADMAP.md) (action items). Live state verified against Vercel (8 projects in team, denver-trades on `main`) and Supabase (12 tables, RLS on all, 3 migrations applied, 1 security WARN, 19 unused indexes per advisor).
- **2026-05-21** — Phase 0 agent-fix bundle shipped (commits TBD). Key architectural choices:
  - **Lazy timeout sweep** in [src/app/api/agents/run/route.ts](src/app/api/agents/run/route.ts) auto-fails stale `Running` rows on every new dispatch — avoids needing minute-level crons (Hobby plan limit).
  - **Doc Audit + WhatsApp Parser are presentational only** in the agent dashboard — they navigate to their real homes (`/dashboard/documents`, `/dashboard/outreach`) instead of running a no-op backend trigger.
  - **`mode` field** (`live` | `simulation` | `idle`) returned from `/api/agents/run` drives the UI toast tone and surfaces a banner when `APIFY_TOKEN` is missing.
  - **Apify webhook callback URL** prefers `VERCEL_PROJECT_PRODUCTION_URL` → `VERCEL_URL` → `NEXT_PUBLIC_SITE_URL` so it survives hashed deploy URLs. Webhook secret moved from query string to `x-denver-webhook-secret` header (folded P1-1 into this work since we were touching the line).
  - **`runPriceIngest()` extracted** to [src/lib/agents/priceIngest.ts](src/lib/agents/priceIngest.ts) — shared by Vercel cron and the agent trigger, no more self-fetch with missing auth.
- **2026-05-21** — UI polish bundle 1 shipped:
  - **`lucide-react`** is the canonical icon library — replaced ~20 hand-rolled SVGs across [Sidebar.tsx](src/components/Sidebar.tsx), [layout.tsx](src/app/dashboard/layout.tsx), [CommandPalette.tsx](src/components/CommandPalette.tsx), [EmptyState.tsx](src/components/EmptyState.tsx). Convention: `size={20} strokeWidth={1.6}` for nav, `size={18}` inline.
  - **[TopBarUser.tsx](src/components/TopBarUser.tsx)** owns the avatar/profile section in the topbar — reads real `users` row + joined `organizations.name` via the browser Supabase client; shows skeleton until loaded; no more hardcoded "Sultan Trades / Owner".
  - **Toast already uses real SVGs** — left as-is since the icons are valid and replacing would be churn for no visible gain.
- **2026-05-22** — **Wave 4 cleanup** — regenerated `database.types.ts` from canonical Supabase schema via MCP (closes the drift Agent C accidentally introduced when reverting `deal_code`). Added two endpoints: `GET /api/companies/[id]` (Agent A's follow-up — outreach can now hydrate full company context) and `POST /api/agents/backfill-embeddings` (user-context proxy to the admin embeddings-backfill endpoint, so a signed-in user can trigger backfill from the browser dev console without copying `CRON_SECRET`). GO_LIVE.md backfill section now documents both the proxy and the curl path. System health (via Supabase advisors): **0 security findings**, only INFO-level unused-index lints (P2-15, deferred).
- **2026-05-22** — **Wave 2 — competitor-parity trade UI** (commits `343dc6b` + `284ad3d` + `5bbb04c` + `009a587` → merged `58547d3`). Inspired by an audit of Tradyon.ai (the leading exporter-focused vertical CRM). Across four parallel agents in worktrees:
  - **Real company dossier at `/dashboard/companies/[id]`** (was hardcoded mock). Server Component with `notFound()` 404, 4 tabs (Overview · Shipment History · Commodities · Contacts), trade-lane fields (sources from / ships to), clickable commodity chips that cross-link back into `/dashboard/search?q=<product>`. New shared `IntentChip` component used across search card, companies card, dossier hero, and agent-run drill-down preview.
  - **9-stage trade pipeline at `/dashboard/pipeline`** with stages: New Lead → Qualified → Sample Sent → Quote Issued → Negotiation → PO Confirmed → Shipped → Closed Won / Closed Lost. Deal IDs (`LEAD-OPP-2026-NNNNN`) on every card. dnd-kit drag-drop with optimistic `PATCH /api/deals/[id]`. Migration: `20260521120000_pipeline_trade_stages.sql`.
  - **Active Demand feed on `/dashboard`** — *our wedge over Tradyon* (they don't have an active-buyer-intent feed). Inbound WhatsApp messages → Gemini-2.5-flash structured extraction (`{product, quantity, incoterm, port, deadline_iso, raw_intent}`) → persisted as `extracted_demand` JSONB on `outreach_threads` → rendered as cards on the dashboard with one-click "Generate quote →" that deep-links to outreach prefilled. Migration: `20260521182235_outreach_threads_extracted_demand.sql`. Admin backfill: `POST /api/admin/whatsapp/extract-backfill` (Bearer CRON_SECRET).
  - **Inline leads drill-down on `/dashboard/agents`** — Success rows for Lead Scraper get a "View leads" expander that shows the 5 created companies inline as mini-cards (no tab-switch needed). Lookup strategy: parse dataset id from `error_log` → query by `enrichment_source = 'apify:<datasetId>'`; falls back to a time-window query for older rows.
  - **AI search typeahead** on `/dashboard/search` — commodity × country × template scoring, keyboard nav, click-outside dismiss, replaces the static "Try" badges when the user is actively typing.
  - **Sidebar restructured** into MARKET RESEARCH (Find Buyers / Find Sellers / Companies) · CRM (Pipeline / Outreach) · TOOLS (Documents / Analytics / Agents / Prices) groups, matching the Tradyon information architecture.
  - **Trade-aware UI everywhere** — every card carries a prominent BUYS (coral) / SELLS (lime) / BROKER (blue) chip top-right. SOURCES FROM and SHIPS TO rows with directional arrows. Enriched checkmark + formatted date.
  - **Outreach prefill** — `/dashboard/outreach` reads `?companyName=` (from dossier) AND `?product=` (from Active Demand cards). Suspense-wrapped for Next 16 prerender compatibility.
  - **POST `/api/deals`** added with `deal_code` auto-mint (`LEAD-OPP-2026-NNNNN`), unique-violation retry, and per-org `company_id` cross-tenant check.
  - **Known follow-ups**: `schema.sql` snapshot is intentionally out of sync with migrations (migrations are canonical — schema dump is for orientation only); `kanban_order` column is unused (defer until reorder-within-column lands); customs-data Apify actor swap is the next strategic enrichment upgrade.
- **2026-05-21** — **Go-live bundle** shipped (commits `c4a3bee` + `94912db` merge + `5396f73` merge):
  - **Lead Scraper webhook fix root cause**: Apify only registers ad-hoc webhooks from the `webhooks=` query parameter (URL-safe base64 JSON), NEVER from the request body. Our prior code put webhooks in the body alongside `searchStringsArray` and Apify silently dropped them. Fix in `7e2ce28`. Documented in [src/app/api/agents/run/route.ts](src/app/api/agents/run/route.ts) `dispatchLeadScraper`.
  - **5 leads backfilled via raw SQL** for the orphan from dataset `ffeKO5Oq7meoNAXLf` (West India Coffee, VendiBean, Coffeeco India, Venino Coffee, Atlas Coffee). One-shot — the new admin endpoint replaces this for future orphans.
  - **NEW: admin escape hatches** (Bearer-auth via `CRON_SECRET`):
    - `POST /api/admin/apify/replay` — re-runs the Gemini-enrich + companies-insert + embed pipeline against an existing `agent_runs` row + Apify dataset id. Refuses 409 on a row that's already terminal.
    - `POST /api/admin/embeddings/backfill` — computes pgvector embeddings for any companies with `embedding IS NULL`. Optional `{ limit }` body, default 50, cap 500.
    - Shared `enrichAndInsertScrapedItems` helper at [src/lib/agents/apifyReplay.ts](src/lib/agents/apifyReplay.ts) — used by both the live webhook receiver and the replay endpoint so they can never drift.
  - **NEW: user-context replay proxy** at [src/app/api/agents/replay-apify/route.ts](src/app/api/agents/replay-apify/route.ts) — lets the signed-in user click "Replay" on a Failed run in the UI without exposing `CRON_SECRET` to the client.
  - **Agents dashboard UX** ([AgentDashboard.tsx](src/components/AgentDashboard.tsx)):
    - `<details>` disclosure on Failed rows surfaces first 400 chars of `error_log` (red monospace).
    - Apify dataset chip on Lead Scraper Success rows (`Apify: ffeKO5Oq…`).
    - Replay button on Failed Lead Scraper runs with a dataset id parsed from `error_log` (regex `/dataset(?:\s+|:)([a-zA-Z0-9_-]{10,})/i`).
    - Persistent dismissible amber banner when `mode === 'simulation'` arrives (localStorage key `denver-trades.agents.sim-banner-dismissed`).
  - **Companies directory at `/dashboard/companies`** ([page.tsx](src/app/dashboard/companies/page.tsx)) — new server-rendered page listing all org companies. Sidebar gained the nav item. Empty state with two CTAs.
  - **Search page polish** ([search/page.tsx](src/app/dashboard/search/page.tsx)) — lucide icons throughout, product chips with `+N more`, target=_blank rel=noopener on websites, company name links to dossier, persistent favorite via new `POST /api/companies/favorite`, three differentiated empty states.
  - **Topbar profile menu** ([TopBarUser.tsx](src/components/TopBarUser.tsx)) — avatar is now a button opening a Settings/Sign-out dropdown wired to the existing `signOut` server action.
  - **Notification center** — switched to lucide `Bell` + tracks unread vs a localStorage timestamp (`denver:notif-last-seen`) instead of flagging every fetch as new.
  - **Known follow-up:** `/dashboard/companies/[id]` still shows hardcoded mock data — needs server-component conversion against the DB. Out of scope for go-live; tracked.

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
**Roadmap closed.** Phase 0: 12/12 ✅ · Phase 1: 13/14 ✅ · Phase 2: 13/17 ✅ · Phase 3: 15/18 ✅ · Phase 2.5: Resend + Embeddings + semantic-search UI + streaming + rate limiting all ✅.

Items not shipped — each with an explicit reason in [ROADMAP.md](ROADMAP.md):
- **P1-13** Supabase leaked-password protection — your dashboard toggle.
- **P2-4** Vercel Workflow — deferred indefinitely (current Apify path already durable enough; revisit on reliability complaint).
- **P2-5** 5 of 8 dashboard pages stay client — interactive state pays the JS cost.
- **P2-15** unused indexes — wait for real traffic patterns.
- **P2-17** branch protection — your GH repo settings.
- **P3-10** card consistency — intentionally not converged (component-internal cards have layout-specific affordances).
- **P3-14** page transitions — experimental in Next 16; existing `.fade-in` covers basic case.

When the time comes to flip things on (Vercel AI Gateway, Vercel KV for distributed rate limits, Resend domain): the code is already shaped to accept those — see the per-item notes in ROADMAP. Production deployed (`dpl_nNF86Ly4wQUDNVXP2w2TReWh6RW5`). One critical follow-up: **`CLAUDE_API_KEY` is missing in Vercel production envs** — outreach/enrich/search will return 500s until this is added (`vercel env add CLAUDE_API_KEY production`). Phase 1 remaining: P1-3 + P1-4 + P1-14 (WhatsApp tenant routing bundle), P1-5 (zod validation), P1-13 (Supabase dashboard toggle).

## Recent decisions
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

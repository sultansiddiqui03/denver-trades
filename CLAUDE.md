@AGENTS.md

# Denver Trades — Project Doc

## What this is
B2B lead-gen / CRM for commodity-trade companies (spice/agri exports & imports). Tracks companies, shipments, deals, commodity prices; runs AI agents for lead scraping (Apify), enrichment, outreach generation, document audit. WhatsApp inbox via Twilio. Realtime activity feed and notifications via Supabase.

## Stack
- **Framework:** Next.js 16.2.6 (App Router, Turbopack) + React 19.2.4 + TS 5
- **DB / Auth:** Supabase (Postgres 17.6, RLS, region `ap-south-1`, project `edahefbttohwmdokptoc`)
- **AI:** Anthropic Claude + Google Gemini (router at [src/lib/ai/router.ts](src/lib/ai/router.ts)); `openai` is installed but unused
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
- **Styling:** CSS Modules — one `Foo.module.css` next to each `Foo.tsx`.
- **Charts:** Recharts; chart components are client-only — wrap in Suspense / memo when added (current code doesn't).
- **AI calls:** route through [src/lib/ai/router.ts](src/lib/ai/router.ts). Today it silently returns mock data on error — being replaced (see ROADMAP).

## Environment variables
A `.env.example` is **missing** — to be added. Required envs grouped:
- **Supabase:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **AI:** `CLAUDE_API_KEY`, `GEMINI_API_KEY` (`OPENAI_API_KEY` is unused dep)
- **Apify:** `APIFY_TOKEN` (or `APIFY_API_TOKEN`), `APIFY_ACTOR_ID` (opt), `APIFY_WEBHOOK_SECRET`
- **Twilio:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`
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
**Phase 0 complete (12/12). Phase 1 at 9/14.** Production deployed (`dpl_nNF86Ly4wQUDNVXP2w2TReWh6RW5`). One critical follow-up: **`CLAUDE_API_KEY` is missing in Vercel production envs** — outreach/enrich/search will return 500s until this is added (`vercel env add CLAUDE_API_KEY production`). Phase 1 remaining: P1-3 + P1-4 + P1-14 (WhatsApp tenant routing bundle), P1-5 (zod validation), P1-13 (Supabase dashboard toggle).

## Recent decisions
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

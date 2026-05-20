# Denver Trades — Roadmap

Comprehensive backlog from the 2026-05-21 full-project audit, expanded after the "agents not working / UI not polished" review. Each item has a **why**, **files/refs**, **steps**, an **acceptance criterion**, and a **size** (XS <30m, S <1h, M 1–4h, L day, XL multi-day).

> **Execution rule:** finish Phase 0 before Phase 1, Phase 1 before Phase 2. Don't ship more features on top of a broken agent + insecure webhook + zero validation foundation. Phases 2 and 3 can run partly in parallel once 0 and 1 are clean.

---

## Phase 0 — Make it work + first polish (this week)

Goal: agents actually execute end-to-end; users see real auth state; the worst inline-style and icon inconsistencies are gone. This is the "stop the bleeding" phase.

**Progress (2026-05-21):** **11 of 12 Phase 0 items shipped.**
- Bundle 1: P0-A1, A3, A4, A5, A6, A7, A8, UI3 — agents now end-to-end. Bonus P1-1 + P1-7 folded in. Build green.
- Bundle 2: P0-UI1, UI2, UI4 — `lucide-react` adopted across Sidebar / TopBar / CommandPalette / EmptyState; real auth user + role + org name in topbar via new [TopBarUser.tsx](src/components/TopBarUser.tsx). Build green.
- Remaining: **P0-A2** (Vercel env audit — needs CLI install).
- Bundle 3 (Phase 1 high-leverage): P1-6, P1-9, P1-12 ✅. The typed Supabase clients caught 6 real null-safety bugs on the way in — see [P1-6](#-p1-6--generate-supabase-ts-types--s).
- Bundle 4 (Phase 1 quick wins): P1-2, P1-8, P1-10 ✅. Cron now Bearer-only; AI calls throw real errors instead of fake outreach copy; schema.sql now a complete RLS-enable snapshot.
- Bundle 5: P1-5 ✅ (zod on every API body, shared `parseBody` helper).
- Bundle 6 (webhook hardening): P1-3 + P1-4 + P1-14 ✅. Per-org Twilio routing, replay-proof on MessageSid + `agent_runs.status`, service-role writes always carry a verified `org_id`.

### ✅ P0-A1 · Unstick zombie agent runs + add server-side timeout · S
**Why:** A Lead Scraper run from 2026-05-20 21:48 is still `status: Running` in the DB because the Apify webhook callback never arrived. UI shows infinite "Running".
**Files:** [src/app/api/agents/run/route.ts](src/app/api/agents/run/route.ts), [supabase/migrations/](supabase/migrations/)
**Steps:**
1. One-shot SQL: `UPDATE agent_runs SET status='Failed', completed_at=NOW(), error_log='Auto-failed (stale > 1h)' WHERE status='Running' AND started_at < NOW() - INTERVAL '1 hour';`
2. New migration: a `pg_cron` job (or a route called by Vercel cron) every 5 min to fail any run with `status='Running' AND started_at < NOW() - INTERVAL '15 min'`.
**Accept:** no `Running` rows older than 15 min in `agent_runs`.

### ✅ P0-A2 · Audit Vercel env vars · S
Vercel CLI installed; `vercel env ls production` run on 2026-05-21. Findings:
- **`CLAUDE_API_KEY` MISSING** — critical because the new P1-8 error propagation surfaces this as 500s on outreach/enrich/search. Was previously hidden by the now-removed mock fallback.
- `OPENAI_API_KEY` present but unused — drop with P2-8.
- Webhook secrets + cron + app URLs are Production-only; mirror to Preview before opening a PR workflow.
- Everything else (Supabase, Twilio, Apify, Gemini) is correctly set.
**Why:** Most agent failures trace to missing/wrong env vars (`APIFY_TOKEN`, `APIFY_WEBHOOK_SECRET`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL`). We're guessing what's set.
**Steps:**
1. Install Vercel CLI: `npm i -g vercel`
2. `vercel link` (already linked locally — confirm)
3. `vercel env ls production` → share output
4. Compare against `.env.example` (P1-12) and document gaps in CLAUDE.md.
**Accept:** all required envs in [CLAUDE.md](CLAUDE.md#environment-variables) confirmed set in production.

### ✅ P0-A3 · Wire Doc Audit Agent to a real handler · M
**Why:** Clicking "Run Agent Now" on Doc Audit silently runs the fake-Success default branch ([route.ts:158](src/app/api/agents/run/route.ts:158)).
**Files:** [src/app/api/agents/run/route.ts](src/app/api/agents/run/route.ts), [src/app/api/documents/audit/route.ts](src/app/api/documents/audit/route.ts)
**Steps:** in the agent run handler, dispatch `Doc Audit Agent` to scan the most recent N pending documents for the org and call the audit endpoint per doc. If there are no pending docs, return a 200 with `mode: 'idle'` and `records_processed: 0` (truthful idle state, not fake Success).
**Accept:** running Doc Audit on an org with 0 docs returns `mode: idle`; with N docs returns `records_processed: N`.

### ✅ P0-A4 · WhatsApp Parser Agent — remove "Run Now" or make it process the backlog · S
**Why:** The agent is real-time-webhook-triggered (per its own description) but the UI offers a "Run Agent Now" button that falls into fake-Success.
**Decision needed:** either (a) remove the run button and show only history, or (b) make it parse the last N unparsed messages.
**Recommend (b):** call the parser over `outreach_threads` rows with `parsed_at IS NULL` in the user's org.
**Accept:** clicking Run on a backlog of N messages updates N rows; with empty backlog returns `mode: idle`.

### ✅ P0-A5 · Fix Price Ingest Agent self-fetch · S
**Why:** `agents/run` POSTs internally to `/api/prices` ([route.ts:137](src/app/api/agents/run/route.ts:137)) without the cron secret → 401 silently caught; agent reports Success despite no ingest.
**Steps:**
1. Extract `runPriceIngest(orgId)` from [src/app/api/prices/route.ts](src/app/api/prices/route.ts) into a function in `src/lib/agents/priceIngest.ts`.
2. Both the cron route and the agent handler call the function directly.
3. Remove the `fetch(${domain}/api/prices)` call.
**Accept:** running Price Ingest from the UI updates `commodity_prices` rows.

### ✅ P0-A6 · Always write `error_log` on failure · XS
**Why:** Every catch block in [route.ts:174-176](src/app/api/agents/run/route.ts:174) returns an error to the client but doesn't update the `agent_runs` row — the run stays `Running` and the dashboard never sees the error.
**Steps:** in the top-level catch, if `runRecord` exists, update it with `status='Failed', completed_at=NOW(), error_log=getErrorMessage(error)`.
**Accept:** a forced failure shows `Failed` + readable error in the history table within 5s.

### ✅ P0-A7 · Use the correct webhook callback URL · S
**Why:** Apify webhook URL falls back to `https://denver-trades.vercel.app` — but actual prod deploy URL contains a hash. Webhooks never reach the function.
**Steps:**
1. Use `process.env.VERCEL_PROJECT_PRODUCTION_URL` (Vercel sets this automatically on production) in [route.ts:86](src/app/api/agents/run/route.ts:86); fall back to `VERCEL_URL`, then `NEXT_PUBLIC_SITE_URL`.
2. Add a custom domain in Vercel (e.g. `app.denver-trades.com`) so the URL is stable. Make that the primary `NEXT_PUBLIC_SITE_URL`.
**Accept:** Apify webhook reaches the function and updates the `agent_runs` row to `Success` on a real run.

### ✅ P0-A8 · UI: show simulation/missing-env mode clearly · S
**Why:** When `APIFY_TOKEN` isn't set the agent silently runs in simulation mode and inserts a hardcoded "Global Spice Exporters" record — users can't tell.
**Files:** [src/components/AgentDashboard.tsx](src/components/AgentDashboard.tsx)
**Steps:**
1. API response already returns `mode: 'simulation'|'live'|'idle'`. Display it as a small badge on the toast and inline next to the agent's status.
2. Add a yellow info banner on the page when any agent runs in simulation mode this session.
**Accept:** every triggered run shows its mode in the UI.

### ✅ P0-UI1 · Real auth user in topbar · S
**Why:** [src/app/dashboard/layout.tsx:93-99](src/app/dashboard/layout.tsx:93) hardcodes `"ST" / "Sultan Trades" / "Owner"`. Looks like a demo.
**Steps:**
1. Convert [src/app/dashboard/layout.tsx](src/app/dashboard/layout.tsx) topbar to a small Server Component that reads `user` + `organization.name` from Supabase.
2. Initials derived from name; role from `users.role`; fall back to email-prefix.
**Accept:** real name + role + org appear; no string "Sultan" in source.

### ✅ P0-UI2 · Replace emoji icons with SVG · XS
**Why:** Emoji `🕒` in [AgentDashboard.tsx:186](src/components/AgentDashboard.tsx:186) renders differently per OS and clashes with the rest of the icon set.
**Steps:** swap for an inline `<svg>` clock or — better — pull in `lucide-react` once (P0-UI4).
**Accept:** no emoji in `src/components/`.

### ✅ P0-UI3 · Move AgentDashboard inline styles to CSS module · S
**Why:** [AgentDashboard.tsx:158-181](src/components/AgentDashboard.tsx:158) has a wall of inline `style={{...}}` for the scraper input. Inconsistent with the rest of the codebase.
**Steps:** move to [AgentDashboard.module.css](src/components/AgentDashboard.module.css) using the existing `.input` design token in `globals.css`.
**Accept:** no `style={{` in `AgentDashboard.tsx` except for layout grid sizing.

### ✅ P0-UI4 · Adopt `lucide-react` for icons · S
**Why:** Every icon is hand-rolled `<svg>` (Sidebar has 8, layout has 4 more). Hard to maintain and inconsistent stroke widths/sizes. Lucide is tree-shakeable, matches the current visual style, and is what shadcn uses.
**Steps:**
1. `npm i lucide-react`
2. Replace icons in `Sidebar.tsx`, `layout.tsx` (topbar), `AgentDashboard.tsx`, `CommandPalette.tsx`, `EmptyState.tsx`.
3. Standardize on `size={20}` for nav, `size={16}` for inline.
**Accept:** no `<svg ...stroke="currentColor"` in component files except where genuinely custom (logo).

---

## Phase 1 — Security & data-integrity (next week)

### ✅ P1-1 · Apify webhook secret leaks via query string · S
Dispatch URL contains `&secret=${APIFY_WEBHOOK_SECRET}` ([src/app/api/agents/run/route.ts:88-91](src/app/api/agents/run/route.ts:88)). Query params are logged.
**Fix:** pass the secret in the `x-denver-webhook-secret` header on the Apify webhook config; remove the query-string branch.
**Accept:** the secret never appears in any URL.

### ✅ P1-2 · Cron endpoint accepts secret in query string · S
`isAutomationAuthorized` in [src/lib/security/request.ts](src/lib/security/request.ts) now requires `Authorization: Bearer ${CRON_SECRET}` only — query-string fallback removed. Vercel cron sends Bearer natively, so no config change needed.

### ✅ P1-3 · WhatsApp webhook routes everything to a hardcoded org · M
Migration `webhook_tenancy_and_replay_protection` adds `organizations.twilio_whatsapp_number` (unique partial index). Webhook now derives `orgId` via `resolveOrgIdForTwilioNumber(to)`: match by `twilio_whatsapp_number = to`, single-tenant fallback if exactly one org exists in the table, otherwise 403. Once a second org joins, every org must set its own number. `DEFAULT_ORG_ID` no longer appears in the WhatsApp webhook.

### ✅ P1-4 · Webhook replay protection · M
- **Twilio:** `outreach_threads.twilio_message_sid` column + unique partial index. Insert path checks for Postgres `23505` unique-violation and returns 200 silently on replay so Twilio stops retrying.
- **Apify:** webhook handler now checks `agent_runs.status` first; if already `Success` / `Failed`, returns 200 idempotently without re-processing the dataset.
Timestamp/nonce header strategy was considered but rejected — both providers offer stable per-event IDs we can dedupe on directly.

### ✅ P1-5 · Unvalidated request bodies · M
`zod` installed; shared [src/lib/validation.ts](src/lib/validation.ts) `parseBody(request, schema)` returns either typed data or a ready-to-return 400 with `{ path, message }` issues. Per-route schemas added to: `/api/agents/run`, `/api/companies/enrich`, `/api/documents/audit`, `/api/outreach/generate`, `/api/outreach/whatsapp/send`, `/api/webhooks/apify`, `/api/webhooks/whatsapp` (JSON test path). Twilio form-data path stays under signature verification.

### ✅ P1-6 · Generate Supabase TS types · S
Generated via Supabase MCP into [src/lib/supabase/database.types.ts](src/lib/supabase/database.types.ts); `<Database>` generic wired into [server.ts](src/lib/supabase/server.ts), [client.ts](src/lib/supabase/client.ts), [admin.ts](src/lib/supabase/admin.ts), and `UserContext.supabase`. **Caught 6 real null-safety bugs** in activity feed, document audit insert, WhatsApp webhook contacts parsing, and WhatsApp inbox component — all fixed. Added `npm run db:types` and `npm run typecheck` scripts.

### ✅ P1-7 · Remove fake-Success default branch · XS
Replaced with 400 on unknown agent names in [route.ts](src/app/api/agents/run/route.ts).

### ✅ P1-8 · Stop masking AI errors with mock responses · S
Both [claude.ts](src/lib/ai/claude.ts) and [gemini.ts](src/lib/ai/gemini.ts) now throw on missing key + propagate errors instead of swallowing them and returning fake outreach copy. Mock helpers deleted. Errors flow up to `/api/agents/run`'s catch block, which writes `error_log` and marks the run Failed (P0-A6).

### ✅ P1-9 · Security headers in `next.config.ts` · S
Added HSTS (1y + preload), X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy locking down camera/mic/geolocation/FLoC, X-DNS-Prefetch-Control off. Also enabled `reactStrictMode`. **CSP intentionally deferred** — needs careful per-source allowlist (Supabase realtime ws, Google OAuth, etc.); will add as report-only first.

### ✅ P1-10 · Sync `schema.sql` with RLS migrations · S
Added missing `ALTER TABLE organizations/users/commodity_prices ENABLE ROW LEVEL SECURITY` lines to [supabase/schema.sql](supabase/schema.sql) plus a header note pointing to the migration files for the policy bodies. Schema.sql is now a complete RLS-enable snapshot.

### P1-11 · Decide `commodity_prices` org scoping · S
No `org_id` but `USING (true)` policy. Confirm intent (global feed? per-org?) and either lock down or document.

### ✅ P1-12 · Add `.env.example` · S
[.env.example](.env.example) added covering Supabase, AI, Apify, Twilio, cron, app URLs; legacy `DENVER_TRADES_DEFAULT_ORG_ID` flagged for removal.

### P1-13 · Enable Supabase leaked-password protection · XS
One-click in Supabase Auth settings.

### ✅ P1-14 · Defense-in-depth on service-role webhook writes · M
- **WhatsApp**: orgId derived from `organizations.twilio_whatsapp_number` lookup (P1-3) — never from the inbound payload. Every insert specifies that derived `orgId` explicitly.
- **Apify**: orgId pulled from the joined `agent_runs.org_id` (which was created under an authed request); never trust any `org_id` field in the Apify payload. Idempotency check on `agent_runs.status` (P1-4) means a forged webhook can't re-process or override a terminal run.

---

## Phase 2 — Production readiness (next 2 weeks)

### P2-1 · Vercel AI Gateway for AI calls · M
Drop `@anthropic-ai/sdk` + `@google/generative-ai` direct deps; use `"anthropic/claude-opus-4-7"` strings via the gateway for unified observability and fallback.

### P2-2 · Stream AI responses · M
Wrap with `streamText` from AI SDK v6; UI shows progressive output.

### P2-3 · Rate-limit AI endpoints per org · M
Sliding-window middleware backed by Upstash/Vercel KV; per-org caps on `/api/outreach/generate`, `/api/companies/enrich`, `/api/documents/audit`, `/api/search`.

### P2-4 · Vercel Workflow for long-running Apify dispatch · M
Make agent runs durable (retriable, cancelable).

### P2-5 · Convert dashboard pages to Server Components · L
All `src/app/dashboard/*/page.tsx` are `'use client'` with `useEffect(fetch)` patterns. Move data fetching to RSC; keep small client islands for interactivity.

### P2-6 · Replace self-fetch in Price Ingest (alt path) · S
Already in P0-A5.

### P2-7 · Add `typecheck`, `format`, custom ESLint rules · S
- `"typecheck": "tsc --noEmit"`, `"format": "prettier -w ."`
- ESLint: `no-unused-vars`, `no-explicit-any`, `no-console` (warn)
- `noUncheckedIndexedAccess: true` in tsconfig

### ✅ P2-8 · Decide on `openai` dep · XS
Kept. `src/lib/ai/openai.ts` retained for future pgvector semantic search on `companies.embedding`. Mock-fallback removed; throws on missing key / provider error to match the P1-8 pattern across the AI router.

### P2-9 · Focus management on Cmd+K and modals · S
[CommandPalette.tsx:40-91](src/components/CommandPalette.tsx:40) lacks focus trap + return-focus + `role="dialog"` + `aria-modal`. Same on sidebar overlay.

### P2-10 · Memoize chart components · S
`React.memo` + `useMemo` on derivations in [PriceChart.tsx](src/components/PriceChart.tsx) and analytics page.

### P2-11 · `AbortController` + cleanup verification · S
[WhatsAppInbox.tsx:50-86](src/components/WhatsAppInbox.tsx:50) — no abort; race on unmount.

### P2-12 · `updated_at` + `moddatetime` trigger on all tables · S
10 of 12 tables lack `updated_at`.

### P2-13 · `deals_pipeline.assigned_to` → ON DELETE SET NULL · S

### P2-14 · Finish RLS `auth.uid()` optimization · S
Migration `20260520194500` covered only 4 of 13 policies. Wrap the rest in `(SELECT auth.uid())`.

### P2-15 · Drop unused indexes · S
Supabase advisor flags 19. Wait until tables have real traffic before deciding; revisit after Phase 0 traffic.

### P2-16 · CI pipeline (GitHub Actions) · S
On PR: `ci`, `typecheck`, `lint`, `build`. Currently every push goes straight to prod.

### P2-17 · Branch protection + PR workflow · XS
Require PR + green CI before merge to `main`.

---

## Phase 3 — Deep UI polish (start in parallel with Phase 2)

This is the polish workstream the user flagged. Concrete fixes, not vibes.

### P3-1 · Design audit + token consistency pass · S
**Why:** `globals.css` defines great tokens but many components ignore them (inline styles, magic colors, off-token spacing).
**Steps:** grep for `style={{` and raw hex colors across `src/components` and `src/app/dashboard`; replace with tokens.
**Accept:** zero raw hex colors and < 5 `style={{` blocks per file.

### P3-2 · Real-time agent status — pulse on Running rows · S
Add a `pulse-glow` animation (already defined in [globals.css:501](src/app/globals.css:501)) to `agent_runs` table rows where `status === 'Running'`. Tiny detail, huge perceived-quality bump.

### ✅ P3-3 · Skeleton loaders on first paint · S
- **AgentDashboard** — 3 skeleton table rows until first `agent_runs` fetch returns; then content or `EmptyState`.
- **NotificationCenter** — 3 skeleton bell items on first paint.
- **PriceChart** — full dashboard-grid skeleton (chart area + 2 info cards) instead of "Loading…" text.
- **WhatsAppInbox** — 4 alternating skeleton message bubbles in the stream while messages load.
- **AnalyticsPage** — already had skeletons on the stats cards + 2 charts (kept).

### P3-4 · Loading states on every action button · S
All `Run Agent` / `Refresh Logs` / `Enrich` / `Generate Outreach` buttons should show a spinner and disable while in-flight. Right now most just toggle disabled + text.
**Pattern:** make a `<Button variant="primary" loading>...` component that handles both.

### P3-5 · Toast polish · XS
- Auto-dismiss `setTimeout` not cleared on unmount ([Toast.tsx:64](src/components/Toast.tsx:64)) — fix.
- Add a "View Details" link on error toasts pointing to the agent run row.

### P3-6 · Empty states everywhere use `<EmptyState />` · S
Pages still hand-roll empty divs (e.g. [PriceChart.tsx:150](src/components/PriceChart.tsx:150)). Switch all to `EmptyState`.

### P3-7 · Sidebar polish · S
- Active state could be more obvious (lime accent bar or background tint).
- Logo "D" tile is plain — consider a small SVG logo.
- Tooltips when collapsed (currently nav labels just hide).

### P3-8 · Cmd+K palette polish · M
- Focus trap (P2-9 already covers a11y).
- Recent-items section.
- Keyboard hints (`↑↓` to navigate, `↵` to open, `esc` to close).
- Match against company names, deals, recent agent runs — not just static actions.

### ✅ P3-9 · Notification Center polish · S (partial)
- Added a Supabase realtime subscription on `notifications` (INSERT events trigger a fresh activity-feed fetch) — replaces the 30s tight poll with a 60s safety fallback poll.
- Skeleton list during first paint (P3-3 work).
- "Mark all read" still only clears local unread count — the bell badge now genuinely reflects new arrivals. Persisting it to `notifications.is_read = true` is deferred: the dropdown currently shows an activity feed (mix of agent runs, deals, audits), not the `notifications` table directly, so the "read" semantic needs a small data-model rethink. Tracked as a follow-up note in CLAUDE.md.

### P3-10 · Card hover/press states consistent · S
`.card` defines hover lift; many components don't use `.card` (e.g. agent cards use their own `.agentCard`). Audit and unify on the global `.card` or extend it.

### P3-11 · Typography rhythm pass · S
- Pages mix h1 inline-styled at `1.75rem` (e.g. [agents/page.tsx:11](src/app/dashboard/agents/page.tsx:11)) and the global h1 at `2.5rem`. Pick one; use the global.
- Body line-height looks tight on tables — bump to 1.5.

### P3-12 · Mobile pass · M
- Sidebar overlay works but the topbar is cramped < 480px.
- Tables overflow horizontally — wrap in scroll containers with sticky first column.
- Cmd+K search button is too wide on mobile.

### P3-13 · Split `DocAuditor.tsx` · S
~200 LOC monolith ([src/components/DocAuditor.tsx](src/components/DocAuditor.tsx)) → DropZone / Editor / ResultPanel.

### P3-14 · Page transitions · S
Already have `.fade-in` — apply consistently on route change. Consider Next.js View Transitions API for navigation.

### P3-15 · Dark theme is the only theme — confirm intent · XS
No light mode anywhere. If intentional, document in CLAUDE.md and remove any `prefers-color-scheme` hooks (none currently — confirmed).

### P3-16 · Microcopy pass · S
Run through every empty state, error message, button label. Trade-jargon precision over generic SaaS-isms. (Use the `design:ux-copy` skill.)

### P3-17 · Pricing chart synthetic-data padding · S
[PriceChart.tsx:85-111](src/components/PriceChart.tsx:85) generates 4 fake historical points if only 1 real record exists. Misleading. Show real points only; otherwise show `EmptyState` with "ingest data" CTA.

### P3-18 · Bundle analyzer + lazy-load Recharts · S
Recharts ships ~150KB. Lazy-load per analytics page.

---

## Phase 4 — Future (when load justifies)

- Multi-tenant org join/invite flow + RBAC beyond `org_id`
- Audit logging (`pgaudit` extension)
- Vercel Queues for outbound WhatsApp / email
- pg_cron migrations (replace Vercel cron) — only if we outgrow free cron limits
- Multi-region or read-replica reads
- Sign in with Vercel as an additional OAuth provider
- Vercel BotID on public surfaces
- pgvector semantic search on `companies.embedding`
- Soft-delete pattern (`deleted_at`) on core tables
- Sentry / proper error tracking
- AI cost & token observability per org
- Playwright E2E for sign-in → run agent happy path

---

## Tracking

- Phase 0 + Phase 1 items are mirrored as session tasks (`/tasks`).
- As items complete, strike them through here with a date and PR/commit ref.
- Add new items at the end of the relevant phase; don't reshuffle IDs.

## Suggested execution order (proposal)

Start of session each day:
1. Open one Phase 0 task; finish it.
2. If a Phase 1 security item is blocking it (e.g. P0-A7 + P1-1 both touch the Apify webhook), bundle.
3. Push a single focused commit per task; PR if Phase 2 CI is in place by then.

Recommended next step: **P0-A1 (unstick zombie runs) + P0-A6 (write error_log on failure)** as a single bundle — 30 minutes, makes the agent UI honest about state.

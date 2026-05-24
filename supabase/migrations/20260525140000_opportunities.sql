-- Real-time opportunity detection.
--
-- An "opportunity" is a scored, actionable event detected from the data we
-- already capture: an inbound buyer demand that matches what the org sells, a
-- buyer who just started switching suppliers, or a freshly-found high-fit
-- importer. The detection engine writes rows here (deduped by dedupe_key) and
-- the Opportunities inbox subscribes via Supabase realtime, so a new lead
-- surfaces the moment its triggering event lands.

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  type text not null,                 -- demand_match | supplier_switch | new_fit_buyer | volume_spike
  title text not null,
  summary text,
  priority integer not null default 50, -- 0-100, higher = hotter
  company_id uuid references public.companies(id) on delete set null,
  thread_id uuid references public.outreach_threads(id) on delete set null,
  product text,
  evidence jsonb,
  status text not null default 'new',  -- new | viewed | acted | dismissed
  dedupe_key text not null,            -- stable key so re-detection doesn't duplicate
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists opportunities_org_dedupe_uidx
  on public.opportunities (org_id, dedupe_key);
create index if not exists idx_opportunities_org_status_priority
  on public.opportunities (org_id, status, priority desc);

alter table public.opportunities enable row level security;

-- Same org-scoping pattern as every other domain table. Service-role ingest
-- (webhook / scrape) bypasses RLS; the user client + realtime honour it.
create policy "Opportunity access by organization" on public.opportunities
  for all
  using (org_id = app_private.current_org_id())
  with check (org_id = app_private.current_org_id());

comment on table public.opportunities is 'Detected, scored, actionable opportunities (demand matches, supplier switches, high-fit buyers).';

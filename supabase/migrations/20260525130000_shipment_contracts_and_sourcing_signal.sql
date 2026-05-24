-- Contract-grade shipment detail + persisted supplier-shift signal.
--
-- Why: aggregate customs metrics on `companies` answer "is this a real buyer?",
-- but a trader also needs the granular contract picture — what product, how
-- much, from whom, origin->destination, on what Incoterm — to spot what's
-- required and where. And the most valuable derived signal is *sourcing
-- displacement*: a buyer whose main supplier volume is dropping is actively
-- shopping. Both are computed from per-shipment rows, so we enrich the
-- existing `shipments` table and cache the signal on `companies`.
--
-- All additive + nullable; RLS inherited (shipments already has an org policy).

alter table public.shipments
  add column if not exists supplier_name text,
  add column if not exists origin_country text,
  add column if not exists destination_country text,
  add column if not exists value_usd numeric,
  add column if not exists quantity_mt numeric,
  add column if not exists incoterm text;

create index if not exists idx_shipments_company_date
  on public.shipments (company_id, shipment_date desc);
create index if not exists idx_shipments_org_date
  on public.shipments (org_id, shipment_date desc);

alter table public.companies
  add column if not exists sourcing_signal jsonb,
  add column if not exists sourcing_signal_at timestamptz;

comment on column public.shipments.supplier_name is 'Counterparty exporter/supplier on this shipment (customs consignor).';
comment on column public.shipments.value_usd is 'Declared/estimated shipment value in USD.';
comment on column public.shipments.quantity_mt is 'Quantity in metric tonnes.';
comment on column public.companies.sourcing_signal is 'jsonb: { status: switching|declining|growing|stable|new, headline, dropPct, decliningSupplier, newOrigins[], topSupplierNow, evidence[] } derived from shipments.';

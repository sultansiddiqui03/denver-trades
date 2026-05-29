-- Market-intelligence cache (price benchmarks + demand-by-destination).
--
-- Derived from anonymized customs aggregates (Zauba India export/import; later
-- UN COMTRADE). Unlike companies, this is GLOBAL market data — not org-scoped,
-- same modelling rationale as commodity_prices. Cached per (product, trade_type,
-- source) with a freshness window so repeated lookups are instant and we don't
-- re-pay the scrape; refreshed on demand when stale.
create table if not exists market_intel (
  id uuid primary key default gen_random_uuid(),
  product text not null,
  trade_type text not null check (trade_type in ('import', 'export')),
  source text not null default 'zauba',
  -- Headline market summary: total trade value, avg price, top countries, peak month, HS.
  summary jsonb,
  -- Demand by destination: [{ country, shipments, totalValueUsd, avgPricePerUnitUsd }].
  top_destinations jsonb,
  -- HS-code breakdown: [{ code, description, shipments, totalValueUsd }].
  hs_breakdown jsonb,
  -- A few representative recent shipment lines for display.
  sample_shipments jsonb,
  total_records integer,
  fetched_at timestamptz not null default now(),
  constraint market_intel_product_type_source_uidx unique (product, trade_type, source)
);

create index if not exists idx_market_intel_product on market_intel (product);

alter table market_intel enable row level security;

-- Global reference data: any authenticated user can read it. Writes happen via
-- the service-role client (the refresh endpoint), which bypasses RLS.
drop policy if exists "market_intel_read_authenticated" on market_intel;
create policy "market_intel_read_authenticated"
  on market_intel for select
  to authenticated
  using (true);

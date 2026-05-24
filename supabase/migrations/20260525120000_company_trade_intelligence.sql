-- Customs / trade-intelligence columns on companies.
--
-- Why: the ImportYeti-class Apify actors return customs-grade signal
-- (shipment volume, recency, top suppliers, HS codes, trademarks, profile
-- URL) which the adapter layer was previously flattening into a free-text
-- `description` and letting Gemini re-interpret — a lossy round-trip that
-- discarded the most defensible, provable signal in the product. These
-- columns give that data a structured home so it can be displayed verbatim,
-- charted, and scored.
--
-- All columns are additive + nullable, so this is a metadata-only change
-- (no table rewrite, no lock of consequence). RLS is inherited from the
-- existing companies policies; no new policy required.

alter table public.companies
  add column if not exists total_shipments integer,
  add column if not exists last_shipment_date date,
  add column if not exists source_url text,
  add column if not exists top_suppliers jsonb,
  add column if not exists hs_codes jsonb,
  add column if not exists top_trading_partners jsonb,
  add column if not exists trademarks jsonb,
  add column if not exists trade_metrics jsonb,
  add column if not exists buyer_fit_score numeric,
  add column if not exists score_breakdown jsonb,
  add column if not exists scored_at timestamptz;

comment on column public.companies.total_shipments is 'Customs shipment count from source actor (ImportYeti). Hard fact, never LLM-derived.';
comment on column public.companies.last_shipment_date is 'Date of most recent customs shipment on record.';
comment on column public.companies.source_url is 'Canonical source profile URL (e.g. ImportYeti detailUrl) for verification.';
comment on column public.companies.top_suppliers is 'jsonb array: [{ name, country, shipments }]';
comment on column public.companies.hs_codes is 'jsonb array: [{ code, description, shipments }]';
comment on column public.companies.top_trading_partners is 'jsonb array: [{ name, country, role }]';
comment on column public.companies.trademarks is 'jsonb array of registered trademark names/objects.';
comment on column public.companies.trade_metrics is 'Raw catch-all blob of additional source metrics not promoted to a column.';
comment on column public.companies.buyer_fit_score is '0-100 fit score vs the org commodities/target markets. See score_breakdown.';
comment on column public.companies.score_breakdown is 'jsonb: { commodityMatch, shipmentVolume, recency, tradeDirection, marketFit, reasons[] }';
comment on column public.companies.scored_at is 'When buyer_fit_score was last computed.';

-- Sort matches/leaderboards by fit within an org. Used immediately by the
-- Buyer-Match engine and the companies directory, so this is not a
-- speculative index.
create index if not exists idx_companies_buyer_fit
  on public.companies (org_id, buyer_fit_score desc nulls last);

-- P1-11: commodity_prices is intentionally global market data, not per-org.
-- Drop RLS so we don't pay the policy-evaluation cost on every read.
--
-- NOTE: This migration is superseded by 20260521080856_commodity_prices_rls_permissive_read.sql
-- which re-enables RLS with a permissive read-all policy to satisfy the
-- Supabase linter (rls_disabled_in_public). The two read identically at
-- runtime; the linter just prefers RLS on for PostgREST-exposed tables.

DROP POLICY IF EXISTS "Commodity price feeds are public" ON public.commodity_prices;
DROP POLICY IF EXISTS "Commodity prices are globally readable" ON public.commodity_prices;
DROP POLICY IF EXISTS "commodity_prices_public_read" ON public.commodity_prices;

ALTER TABLE public.commodity_prices DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.commodity_prices IS
  'Global market price feed shared across all orgs. No org_id by design — any authenticated user can read. RLS intentionally disabled (P1-11, 2026-05-21).';

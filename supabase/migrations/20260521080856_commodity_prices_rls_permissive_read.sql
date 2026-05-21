-- P1-11 follow-up #2: Supabase advisor flags rls_disabled_in_public on
-- commodity_prices. Even for intentionally-global tables exposed to
-- PostgREST, the recommended pattern is RLS + a permissive policy rather
-- than RLS off. The eval cost of `USING (true)` is negligible.
ALTER TABLE public.commodity_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "commodity_prices_read_all" ON public.commodity_prices;
CREATE POLICY "commodity_prices_read_all"
  ON public.commodity_prices
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE public.commodity_prices IS
  'Global market price feed shared across all orgs. Intentionally no org_id. RLS enabled with a permissive read-all policy to satisfy Supabase linter (rls_disabled_in_public). Writes are restricted to the service role.';

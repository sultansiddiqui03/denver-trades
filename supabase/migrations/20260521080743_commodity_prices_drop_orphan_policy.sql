-- P1-11 follow-up: dropping RLS on commodity_prices left the read-policy behind.
-- The advisor flags the orphan as policy_exists_rls_disabled. Drop it for real now.
DROP POLICY IF EXISTS "Authenticated users can read prices" ON public.commodity_prices;

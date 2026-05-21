-- Per-org deal_code sequences with configurable prefix.
--
-- Today `deals_pipeline.deal_code` is GLOBAL-unique under
-- `idx_deals_pipeline_deal_code`, so two orgs cannot share the same
-- `LEAD-OPP-2026-00001`. This migration:
--
--   1. Adds `organizations.deal_code_prefix` (default `'LEAD-OPP'`) so each
--      tenant can rename the human-readable pipeline ID
--      (e.g. Acme Spice Co -> `ACME-2026-00001`).
--   2. Re-keys the unique index from `(deal_code)` to `(org_id, deal_code)`
--      so each org has its own independent counter starting at 00001.
--
-- Existing rows are NOT renumbered. They keep their `LEAD-OPP-2026-NNNNN`
-- codes; per-org counters resume from `(max for that org) + 1`. The mint
-- logic in `src/app/api/deals/route.ts` looks up the org's current
-- `deal_code_prefix` and filters MAX by `LIKE prefix-year-%`.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. organizations.deal_code_prefix
--    CHECK enforces 2-12 chars, uppercase letters + digits + dash only, so
--    nothing slips past with a slash or whitespace that would break the
--    `<prefix>-<year>-<NNNNN>` format.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS deal_code_prefix TEXT NOT NULL DEFAULT 'LEAD-OPP';

ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_deal_code_prefix_check;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_deal_code_prefix_check
  CHECK (deal_code_prefix ~ '^[A-Z0-9-]{2,12}$');

COMMENT ON COLUMN public.organizations.deal_code_prefix IS
  'Tenant-configurable prefix for human-readable deal codes minted by POST /api/deals. Format: <PREFIX>-<YYYY>-<NNNNN>. Validated against ^[A-Z0-9-]{2,12}$. Default LEAD-OPP.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Re-key the deal_code unique index to per-org.
--    The previous index name from 20260521120000_pipeline_trade_stages.sql
--    is `idx_deals_pipeline_deal_code`.
-- ─────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.idx_deals_pipeline_deal_code;

CREATE UNIQUE INDEX IF NOT EXISTS deals_pipeline_deal_code_org_uidx
  ON public.deals_pipeline (org_id, deal_code)
  WHERE deal_code IS NOT NULL;

COMMENT ON INDEX public.deals_pipeline_deal_code_org_uidx IS
  'Per-org uniqueness for deal_code. Two orgs may both have LEAD-OPP-2026-00001 simultaneously.';

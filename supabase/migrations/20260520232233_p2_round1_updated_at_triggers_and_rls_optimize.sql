-- P2-14: wrap auth.uid() in subquery inside the SECURITY DEFINER helper
-- so per-row RLS checks reuse the cached result rather than re-evaluating.
CREATE OR REPLACE FUNCTION app_private.current_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id
  FROM public.users
  WHERE id = (SELECT auth.uid())
  LIMIT 1
$$;

-- P2-12: enable moddatetime + add updated_at to every table that should track it.
-- agent_runs has its own state machine; activity_feed is append-only; commodity_prices
-- is an immutable tick log — those three are intentionally skipped.
CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;

ALTER TABLE public.organizations    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.users            ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.shipments        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.outreach_threads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.document_audits  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.notifications    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.saved_searches   ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DROP TRIGGER IF EXISTS set_organizations_updated_at    ON public.organizations;
DROP TRIGGER IF EXISTS set_users_updated_at            ON public.users;
DROP TRIGGER IF EXISTS set_companies_updated_at        ON public.companies;
DROP TRIGGER IF EXISTS set_shipments_updated_at        ON public.shipments;
DROP TRIGGER IF EXISTS set_deals_pipeline_updated_at   ON public.deals_pipeline;
DROP TRIGGER IF EXISTS set_outreach_threads_updated_at ON public.outreach_threads;
DROP TRIGGER IF EXISTS set_document_audits_updated_at  ON public.document_audits;
DROP TRIGGER IF EXISTS set_notifications_updated_at    ON public.notifications;
DROP TRIGGER IF EXISTS set_saved_searches_updated_at   ON public.saved_searches;

CREATE TRIGGER set_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

CREATE TRIGGER set_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

CREATE TRIGGER set_shipments_updated_at
  BEFORE UPDATE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

CREATE TRIGGER set_deals_pipeline_updated_at
  BEFORE UPDATE ON public.deals_pipeline
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

CREATE TRIGGER set_outreach_threads_updated_at
  BEFORE UPDATE ON public.outreach_threads
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

CREATE TRIGGER set_document_audits_updated_at
  BEFORE UPDATE ON public.document_audits
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

CREATE TRIGGER set_notifications_updated_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

CREATE TRIGGER set_saved_searches_updated_at
  BEFORE UPDATE ON public.saved_searches
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

-- P2-13: deleting a user should null out their assigned deals, not orphan them.
ALTER TABLE public.deals_pipeline
  DROP CONSTRAINT IF EXISTS deals_pipeline_assigned_to_fkey;

ALTER TABLE public.deals_pipeline
  ADD CONSTRAINT deals_pipeline_assigned_to_fkey
  FOREIGN KEY (assigned_to)
  REFERENCES public.users(id)
  ON DELETE SET NULL;

CREATE SCHEMA IF NOT EXISTS app_private;
CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    EXECUTE 'ALTER EXTENSION vector SET SCHEMA extensions';
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT USAGE ON SCHEMA extensions TO authenticated;
GRANT USAGE ON SCHEMA app_private TO authenticated;

CREATE OR REPLACE FUNCTION app_private.current_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id
  FROM public.users
  WHERE id = auth.uid()
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION app_private.current_org_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.current_org_id() TO authenticated;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals_pipeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commodity_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_feed ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.organizations TO authenticated;
GRANT SELECT, UPDATE ON public.users TO authenticated;
GRANT SELECT ON public.commodity_prices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.companies,
  public.shipments,
  public.deals_pipeline,
  public.outreach_threads,
  public.document_audits,
  public.notifications,
  public.saved_searches,
  public.agent_runs,
  public.activity_feed
TO authenticated;

DROP POLICY IF EXISTS "Users can read their organization" ON public.organizations;
CREATE POLICY "Users can read their organization"
ON public.organizations
FOR SELECT
TO authenticated
USING (id = app_private.current_org_id());

DROP POLICY IF EXISTS "Users can read organization profiles" ON public.users;
CREATE POLICY "Users can read organization profiles"
ON public.users
FOR SELECT
TO authenticated
USING (id = auth.uid() OR org_id = app_private.current_org_id());

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile"
ON public.users
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid() AND org_id = app_private.current_org_id());

DROP POLICY IF EXISTS "Authenticated users can read prices" ON public.commodity_prices;
CREATE POLICY "Authenticated users can read prices"
ON public.commodity_prices
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Company access by organization" ON public.companies;
CREATE POLICY "Company access by organization"
ON public.companies
FOR ALL
TO authenticated
USING (org_id = app_private.current_org_id())
WITH CHECK (org_id = app_private.current_org_id());

DROP POLICY IF EXISTS "Shipment access by organization" ON public.shipments;
CREATE POLICY "Shipment access by organization"
ON public.shipments
FOR ALL
TO authenticated
USING (org_id = app_private.current_org_id())
WITH CHECK (org_id = app_private.current_org_id());

DROP POLICY IF EXISTS "Deal access by organization" ON public.deals_pipeline;
CREATE POLICY "Deal access by organization"
ON public.deals_pipeline
FOR ALL
TO authenticated
USING (org_id = app_private.current_org_id())
WITH CHECK (org_id = app_private.current_org_id());

DROP POLICY IF EXISTS "Outreach access by organization" ON public.outreach_threads;
CREATE POLICY "Outreach access by organization"
ON public.outreach_threads
FOR ALL
TO authenticated
USING (org_id = app_private.current_org_id())
WITH CHECK (org_id = app_private.current_org_id());

DROP POLICY IF EXISTS "Document audit access by organization" ON public.document_audits;
CREATE POLICY "Document audit access by organization"
ON public.document_audits
FOR ALL
TO authenticated
USING (org_id = app_private.current_org_id())
WITH CHECK (org_id = app_private.current_org_id());

DROP POLICY IF EXISTS "Notification access by organization" ON public.notifications;
CREATE POLICY "Notification access by organization"
ON public.notifications
FOR ALL
TO authenticated
USING (
  org_id = app_private.current_org_id()
  AND (user_id IS NULL OR user_id = auth.uid())
)
WITH CHECK (
  org_id = app_private.current_org_id()
  AND (user_id IS NULL OR user_id = auth.uid())
);

DROP POLICY IF EXISTS "Saved search access by organization" ON public.saved_searches;
CREATE POLICY "Saved search access by organization"
ON public.saved_searches
FOR ALL
TO authenticated
USING (
  org_id = app_private.current_org_id()
  AND (user_id IS NULL OR user_id = auth.uid())
)
WITH CHECK (
  org_id = app_private.current_org_id()
  AND (user_id IS NULL OR user_id = auth.uid())
);

DROP POLICY IF EXISTS "Agent run access by organization" ON public.agent_runs;
CREATE POLICY "Agent run access by organization"
ON public.agent_runs
FOR ALL
TO authenticated
USING (org_id = app_private.current_org_id())
WITH CHECK (org_id = app_private.current_org_id());

DROP POLICY IF EXISTS "Activity feed access by organization" ON public.activity_feed;
CREATE POLICY "Activity feed access by organization"
ON public.activity_feed
FOR ALL
TO authenticated
USING (org_id = app_private.current_org_id())
WITH CHECK (org_id = app_private.current_org_id());

CREATE INDEX IF NOT EXISTS idx_users_org ON public.users(org_id);
CREATE INDEX IF NOT EXISTS idx_shipments_org ON public.shipments(org_id);
CREATE INDEX IF NOT EXISTS idx_deals_assigned_to ON public.deals_pipeline(assigned_to);
CREATE INDEX IF NOT EXISTS idx_outreach_org ON public.outreach_threads(org_id);
CREATE INDEX IF NOT EXISTS idx_outreach_company ON public.outreach_threads(company_id);
CREATE INDEX IF NOT EXISTS idx_document_audits_org ON public.document_audits(org_id);
CREATE INDEX IF NOT EXISTS idx_document_audits_deal ON public.document_audits(deal_id);
CREATE INDEX IF NOT EXISTS idx_notifications_org ON public.notifications(org_id);
CREATE INDEX IF NOT EXISTS idx_saved_searches_org ON public.saved_searches(org_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_org ON public.agent_runs(org_id);
CREATE INDEX IF NOT EXISTS idx_activity_org ON public.activity_feed(org_id);
CREATE INDEX IF NOT EXISTS idx_activity_company ON public.activity_feed(company_id);
CREATE INDEX IF NOT EXISTS idx_activity_actor ON public.activity_feed(actor_id);

DROP POLICY IF EXISTS "Users can read organization profiles" ON public.users;
CREATE POLICY "Users can read organization profiles"
ON public.users
FOR SELECT
TO authenticated
USING (id = (SELECT auth.uid()) OR org_id = app_private.current_org_id());

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile"
ON public.users
FOR UPDATE
TO authenticated
USING (id = (SELECT auth.uid()))
WITH CHECK (id = (SELECT auth.uid()) AND org_id = app_private.current_org_id());

DROP POLICY IF EXISTS "Notification access by organization" ON public.notifications;
CREATE POLICY "Notification access by organization"
ON public.notifications
FOR ALL
TO authenticated
USING (
  org_id = app_private.current_org_id()
  AND (user_id IS NULL OR user_id = (SELECT auth.uid()))
)
WITH CHECK (
  org_id = app_private.current_org_id()
  AND (user_id IS NULL OR user_id = (SELECT auth.uid()))
);

DROP POLICY IF EXISTS "Saved search access by organization" ON public.saved_searches;
CREATE POLICY "Saved search access by organization"
ON public.saved_searches
FOR ALL
TO authenticated
USING (
  org_id = app_private.current_org_id()
  AND (user_id IS NULL OR user_id = (SELECT auth.uid()))
)
WITH CHECK (
  org_id = app_private.current_org_id()
  AND (user_id IS NULL OR user_id = (SELECT auth.uid()))
);

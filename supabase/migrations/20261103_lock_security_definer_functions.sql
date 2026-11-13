-- SECURITY DEFINER functions run with the owner's rights and most do no caller
-- check (wallet credit/charge, job claims, session revisions...). Supabase grants
-- EXECUTE to anon and authenticated by default, so anyone could call them through
-- /rest/v1/rpc. The app only calls them from the server with the service role,
-- so take EXECUTE away from everyone else.
--
-- is_workspace_member stays callable: RLS policies run it as the signed-in user
-- and it only answers for auth.uid().

DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND p.proname <> 'is_workspace_member'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);
  END LOOP;
END $$;

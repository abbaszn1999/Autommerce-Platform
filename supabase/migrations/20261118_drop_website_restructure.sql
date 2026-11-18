-- Website Restructure is retired: the page, its API and its database objects are gone.
-- The Store Assistant now does this work in chat (see assistant-service skills).
--
-- Deploy the app version without Website Restructure BEFORE running this: the
-- old app still reads wr_projects.
--
-- Files of old projects live in the `workspace-files` bucket under
-- `<workspace_id>/website-restructure/`. Supabase does not allow deleting storage
-- rows from SQL, so remove them with scripts/purge-website-restructure-storage.ts.

-- 1. The admin usage view counted wr_projects: redefine it without that table first,
--    or dropping the table would break it.
CREATE OR REPLACE FUNCTION public.admin_workspace_usage()
RETURNS TABLE (
  workspace_id uuid,
  storage_bytes bigint,
  object_count bigint,
  db_bytes bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  WITH storage_usage AS (
    SELECT
      w.id AS workspace_id,
      COALESCE(SUM(
        CASE
          WHEN (o.metadata->>'size') ~ '^[0-9]+$' THEN (o.metadata->>'size')::bigint
          ELSE 0
        END
      ), 0)::bigint AS storage_bytes,
      COUNT(o.id)::bigint AS object_count
    FROM public.workspaces w
    LEFT JOIN storage.objects o
      ON o.bucket_id = 'workspace-files'
     AND split_part(o.name, '/', 1) = w.id::text
    GROUP BY w.id
  ),
  db_usage AS (
    SELECT workspace_id, SUM(bytes)::bigint AS db_bytes
    FROM (
      SELECT id AS workspace_id, (pg_column_size(t) + 24)::bigint AS bytes FROM public.workspaces t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.activity_log t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.credit_transactions t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.gallery_sessions t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.gs_activity t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.gs_quotas t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.gs_rules t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.gs_runs t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.image_classification_sessions t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.catalog_sessions t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.job_runs t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.mr_extracts t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.mr_projects t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.mr_runs t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.mr_workspace_prefs t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.notifications t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.sync_agent_traces t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.visualizer_sessions t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.wallet_transactions t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.workspace_integrations t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.workspace_invites t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.workspace_members t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.workspace_wallets t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.security_audit_logs t
    ) rows
    GROUP BY 1
  )
  SELECT
    s.workspace_id,
    s.storage_bytes,
    s.object_count,
    COALESCE(d.db_bytes, 0)::bigint AS db_bytes
  FROM storage_usage s
  LEFT JOIN db_usage d ON d.workspace_id = s.workspace_id;
$$;

REVOKE ALL ON FUNCTION public.admin_workspace_usage() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_workspace_usage() TO service_role;

-- 2. The project-slot helpers and the lifetime counter.
DROP FUNCTION IF EXISTS public.wr_try_reserve_project_slot(uuid, integer);
DROP FUNCTION IF EXISTS public.wr_release_project_slot(uuid);
ALTER TABLE public.workspaces DROP COLUMN IF EXISTS wr_projects_created_total;

-- 3. The projects table (its policies, trigger and index go with it).
DROP TABLE IF EXISTS public.wr_projects;

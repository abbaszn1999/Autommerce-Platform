-- Growth Sync is retired. Its rules, runs, activity, watermarks and the functions
-- that leased rules to the scheduler are removed; their rows are dropped on purpose.
--
-- Not touched on purpose:
--   * The Vault secrets growth_sync_app_origin and growth_sync_cron_secret. Despite
--     the name they are what the jobs-sweep and expire-generated-images schedules
--     read to call the app. Dropping them would stop both.
--     (20261121_rename_cron_secrets.sql gives them neutral names afterwards.)

-- The Growth Sync tick schedule, where it exists (pg_cron may not be installed).
DO $$
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'growth-sync-tick';
  END IF;
END $$;

-- The admin usage report counted rows of three of these tables: redefine it first.
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
      COALESCE(SUM(CASE WHEN (o.metadata->>'size') ~ '^[0-9]+$' THEN (o.metadata->>'size')::bigint ELSE 0 END), 0)::bigint AS storage_bytes,
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
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.image_classification_sessions t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.catalog_sessions t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.job_runs t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.mr_extracts t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.mr_projects t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.mr_runs t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.mr_workspace_prefs t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.notifications t
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
  SELECT s.workspace_id, s.storage_bytes, s.object_count, COALESCE(d.db_bytes, 0)::bigint AS db_bytes
  FROM storage_usage s
  LEFT JOIN db_usage d ON d.workspace_id = s.workspace_id;
$$;

-- Functions first: claim_gs_rules and lease_gs_rule return the gs_rules row type.
DROP FUNCTION IF EXISTS public.claim_gs_rules(integer, integer);
DROP FUNCTION IF EXISTS public.defer_gs_rule(uuid);
DROP FUNCTION IF EXISTS public.lease_gs_rule(uuid, integer);
DROP FUNCTION IF EXISTS public.release_gs_rule(uuid, text, boolean, boolean);
DROP FUNCTION IF EXISTS public.gs_interval_to_minutes(text);

-- Tables (their triggers, indexes and policies go with them).
DROP TABLE IF EXISTS public.gs_activity;
DROP TABLE IF EXISTS public.gs_runs;
DROP TABLE IF EXISTS public.gs_watermarks;
DROP TABLE IF EXISTS public.gs_rules;

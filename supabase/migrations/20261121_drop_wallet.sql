-- Remove the workspace wallet.
--
-- The wallet only ever paid for Market Research: Apify keyword probes and
-- extracts, the per-collection push fee and the AI pass-through. Market
-- Research no longer bills anything, and the credit system (credit_transactions
-- / deduct_user_credits) stays the one place usage is paid for. Nothing in the
-- app reads these objects any more.

-- 1. The admin usage function listed the wallet tables in its size estimate.
CREATE OR REPLACE FUNCTION public.admin_workspace_usage()
 RETURNS TABLE(workspace_id uuid, storage_bytes bigint, object_count bigint, db_bytes bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'storage'
AS $function$
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
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.workspace_integrations t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.workspace_invites t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.workspace_members t
      UNION ALL SELECT workspace_id, (pg_column_size(t) + 24)::bigint FROM public.security_audit_logs t
    ) rows
    GROUP BY 1
  )
  SELECT s.workspace_id, s.storage_bytes, s.object_count, COALESCE(d.db_bytes, 0)::bigint AS db_bytes
  FROM storage_usage s
  LEFT JOIN db_usage d ON d.workspace_id = s.workspace_id;
$function$;

-- 2. Trigger that created a wallet row for every new workspace.
DROP TRIGGER IF EXISTS workspaces_ensure_wallet ON public.workspaces;

-- 3. Functions first: their row types depend on the tables.
DROP FUNCTION IF EXISTS public.charge_workspace_wallet(uuid, uuid, numeric, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.credit_workspace_wallet(uuid, uuid, numeric, text, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.wallet_spend_summaries(uuid);
DROP FUNCTION IF EXISTS public.ensure_workspace_wallet_row();

-- 4. Tables (the ledger first, it references the wallet).
DROP TABLE IF EXISTS public.wallet_transactions;
DROP TABLE IF EXISTS public.workspace_wallets;
DROP TABLE IF EXISTS public.wallet_stripe_customers;

-- 5. Market Research billing columns. An extract is open while status is
--    'running', so the old "held and running" index becomes a plain
--    "running" index.
DROP INDEX IF EXISTS public.mr_extracts_held_running_idx;
ALTER TABLE public.mr_extracts DROP CONSTRAINT IF EXISTS mr_extracts_billing_status_check;
ALTER TABLE public.mr_extracts
  DROP COLUMN IF EXISTS held_usd,
  DROP COLUMN IF EXISTS actual_usd,
  DROP COLUMN IF EXISTS billing_status;
ALTER TABLE public.mr_projects DROP COLUMN IF EXISTS extract_charged_usd;
ALTER TABLE public.mr_runs DROP COLUMN IF EXISTS estimated_usd;

-- 6. Each project's saved state kept the amount its extract was charged.
UPDATE public.mr_projects
SET state = state - 'extractCharge'
WHERE state ? 'extractCharge';

CREATE INDEX IF NOT EXISTS mr_extracts_running_idx
  ON public.mr_extracts (workspace_id, project_id, created_at DESC)
  WHERE status = 'running';

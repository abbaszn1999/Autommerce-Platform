-- Free Assessment is retired. Its projects, extracts, wallet, functions and
-- job kinds are removed. Nothing else in the app reads or writes them.
--
-- Its files in the workspace-files bucket (<workspace_id>/free-assessment/...)
-- are not touched from SQL: scripts/purge-retired-storage.ts removes them
-- through the Storage API.

-- Finished Free Assessment jobs (their notifications go with them: ON DELETE CASCADE).
DELETE FROM public.job_runs
WHERE kind IN ('fa_extract', 'fa_stage1', 'fa_classify');

ALTER TABLE public.job_runs DROP CONSTRAINT IF EXISTS job_runs_kind_check;
ALTER TABLE public.job_runs ADD CONSTRAINT job_runs_kind_check CHECK (
  kind IN (
    'catalog',
    'gallery',
    'visualizer',
    'mr_extract',
    'mr_stage1',
    'mr_classify',
    'mr_collections'
  )
);

-- One active run per project and step, now for Market Research only.
DROP INDEX IF EXISTS public.job_runs_one_active_per_session;
CREATE UNIQUE INDEX job_runs_one_active_per_session
  ON public.job_runs (workspace_id, kind, session_id)
  WHERE status IN ('queued', 'running')
    AND kind IN ('mr_stage1', 'mr_classify', 'mr_collections');

-- New workspaces no longer get a Free Assessment wallet row.
DROP TRIGGER IF EXISTS workspaces_ensure_fa_wallet ON public.workspaces;

-- Tables (their triggers, indexes and policies go with them).
DROP TABLE IF EXISTS public.fa_runs;
DROP TABLE IF EXISTS public.fa_extracts;
DROP TABLE IF EXISTS public.fa_workspace_prefs;
DROP TABLE IF EXISTS public.fa_projects;
DROP TABLE IF EXISTS public.fa_wallet_transactions;
DROP TABLE IF EXISTS public.fa_wallets;

DROP FUNCTION IF EXISTS public.charge_fa_wallet(uuid, uuid, numeric, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.credit_fa_wallet(uuid, uuid, numeric, text, text, text, text, text, jsonb);
DROP FUNCTION IF EXISTS public.fa_wallet_spend_summaries(uuid);
DROP FUNCTION IF EXISTS public.ensure_fa_wallet_row();
DROP FUNCTION IF EXISTS public.set_fa_updated_at();

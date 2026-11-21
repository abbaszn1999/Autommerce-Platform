-- The scheduler secrets were created for Growth Sync and kept its name even
-- after the jobs-sweep and expire-generated-images schedules started using
-- them. Growth Sync is gone, so give them neutral names and re-point the two
-- schedules and the verification function. The secret VALUES do not change.
--
--   growth_sync_app_origin  -> app_origin
--   growth_sync_cron_secret -> jobs_cron_secret

-- 1. Rename the Vault entries (vault / pg_cron may not exist on a local stack).
DO $$
DECLARE
  v_id uuid;
BEGIN
  IF to_regclass('vault.secrets') IS NULL THEN
    RAISE NOTICE 'vault not available; secrets not renamed';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'app_origin') THEN
    SELECT id INTO v_id FROM vault.secrets WHERE name = 'growth_sync_app_origin';
    IF v_id IS NOT NULL THEN
      PERFORM vault.update_secret(v_id, NULL, 'app_origin');
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'jobs_cron_secret') THEN
    SELECT id INTO v_id FROM vault.secrets WHERE name = 'growth_sync_cron_secret';
    IF v_id IS NOT NULL THEN
      PERFORM vault.update_secret(v_id, NULL, 'jobs_cron_secret');
    END IF;
  END IF;
END $$;

-- 2. The two schedules read the secrets by name, so they are re-created.
DO $$
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'pg_cron not available; schedules not re-created';
    RETURN;
  END IF;

  PERFORM cron.unschedule(jobid) FROM cron.job
    WHERE jobname IN ('jobs-sweep', 'expire-generated-images');

  PERFORM cron.schedule(
    'jobs-sweep',
    '*/5 * * * *',
    $cmd$
    SELECT net.http_post(
      url := (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'app_origin'
      ) || '/api/jobs/sweep',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name = 'jobs_cron_secret'
        )
      ),
      body := jsonb_build_object('source', 'pg_cron'),
      timeout_milliseconds := 55000
    );
    $cmd$
  );

  PERFORM cron.schedule(
    'expire-generated-images',
    '0 3 * * *',
    $cmd$
    SELECT net.http_post(
      url := (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'app_origin'
      ) || '/api/storage/expire-generated-images',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name = 'jobs_cron_secret'
        )
      ),
      body := jsonb_build_object('source', 'pg_cron'),
      timeout_milliseconds := 120000
    );
    $cmd$
  );
END $$;

-- 3. The app verifies the bearer against the same Vault secret.
CREATE OR REPLACE FUNCTION public.verify_jobs_cron_secret(p_secret text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
BEGIN
  IF p_secret IS NULL OR length(p_secret) = 0 THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM vault.decrypted_secrets
    WHERE name = 'jobs_cron_secret'
      AND decrypted_secret = p_secret
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_jobs_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_jobs_cron_secret(text) TO service_role;

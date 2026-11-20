-- try_advisory_lock_text and advisory_unlock_text were called only by
-- src/lib/sync/core/advisory-lock.ts, a helper nothing imported; the helper is
-- deleted. Nothing in the database uses them either: no function, policy,
-- trigger or scheduled job.
DROP FUNCTION IF EXISTS public.try_advisory_lock_text(text);
DROP FUNCTION IF EXISTS public.advisory_unlock_text(text);

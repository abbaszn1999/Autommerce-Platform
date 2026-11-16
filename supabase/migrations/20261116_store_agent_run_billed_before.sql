-- Bill a run cut off by a crash from Cursor's own figure, like a finished run.
--   billed_before_cents: the agent's billed total (Cursor's usage) when the run started.
--   extra_usd: paid work outside the agent that the run had used so far (generated images, chat title).
-- Without them the service falls back to the run's saved estimate.

ALTER TABLE public.store_agent_runs
  ADD COLUMN IF NOT EXISTS billed_before_cents NUMERIC(14, 4),
  ADD COLUMN IF NOT EXISTS extra_usd NUMERIC(14, 6);
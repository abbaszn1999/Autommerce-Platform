-- What is needed to bill a run that was cut off, and to compare what customers
-- paid with Cursor's usage dashboard.
--   owner_user_id: whose balance the run is charged to (a run left unfinished by a
--     crash is charged from its last saved estimate when the service starts).
--   cursor_agent_id: the agent on Cursor's side, kept even after a chat drops it.
--   shortfall_credits: what the run cost but could not be charged.
--   estimate_saved_at: when a running run last saved its estimate; one that has
--     stopped saving was left behind by a process that died.

ALTER TABLE public.store_agent_runs
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cursor_agent_id TEXT,
  ADD COLUMN IF NOT EXISTS shortfall_credits NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (shortfall_credits >= 0),
  ADD COLUMN IF NOT EXISTS estimate_saved_at TIMESTAMPTZ;

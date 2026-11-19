-- Extra workspaces granted to one customer on top of their plan's limit, set from the
-- platform admin (user page). 0 for everyone by default, so no limit changes.
-- Stripe webhooks update named columns only, so renewals keep the grant.

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS extra_workspaces integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_subscriptions_extra_workspaces_range') THEN
    ALTER TABLE public.user_subscriptions
      ADD CONSTRAINT user_subscriptions_extra_workspaces_range CHECK (extra_workspaces BETWEEN 0 AND 100);
  END IF;
END $$;

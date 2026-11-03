-- Every change Autommerce sends to a workspace's Google Ads account, applied or
-- failed. The server keeps the inverse here so an undo never trusts the browser.
-- Written only by the API routes with the service role; members can read their own.

CREATE TABLE IF NOT EXISTS google_ads_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL CHECK (customer_id ~ '^[0-9]{10}$'),
  -- Id the browser gave the change; a retry with the same id never applies twice.
  client_change_id TEXT NOT NULL,
  title TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('AGENT', 'USER', 'RECOMMENDATION', 'UNDO')),
  -- 'applying' is written before anything is sent, so a double click can't send twice.
  status TEXT NOT NULL CHECK (status IN ('applying', 'applied', 'failed')),
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  ops JSONB NOT NULL,
  google_operations JSONB,
  -- Ops that revert this change, built from Google's state just before it.
  inverse JSONB,
  -- Keyword and negative ids this change created (the only things an undo may remove).
  created_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  error TEXT,
  undo_of UUID REFERENCES google_ads_changes(id) ON DELETE SET NULL,
  undone_at TIMESTAMPTZ,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, client_change_id)
);

CREATE INDEX IF NOT EXISTS idx_google_ads_changes_workspace ON google_ads_changes(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_google_ads_changes_undo_of ON google_ads_changes(undo_of);
CREATE INDEX IF NOT EXISTS idx_google_ads_changes_actor ON google_ads_changes(actor_id);

ALTER TABLE google_ads_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "google_ads_changes_select" ON google_ads_changes;
CREATE POLICY "google_ads_changes_select" ON google_ads_changes
  FOR SELECT USING (is_workspace_member(workspace_id));

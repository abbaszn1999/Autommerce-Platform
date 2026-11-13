-- Plans and reports Vera writes for a workspace's Google Ads account, listed
-- on the Documents page and opened in tabs beside the chat. A plan's steps are
-- applied from the page through google_ads_changes (client_change_id
-- "doc:<document id>:<step id>:<attempt>"), so their state is read from there.
-- Writes go through the platform (service role).

CREATE TABLE IF NOT EXISTS google_ads_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  -- The Google Ads account it was written for; another account does not list it.
  customer_id TEXT NOT NULL CHECK (customer_id ~ '^\d{1,20}$'),
  kind TEXT NOT NULL CHECK (kind IN ('plan', 'report')),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  summary TEXT NOT NULL DEFAULT '' CHECK (char_length(summary) <= 1000),
  content JSONB NOT NULL CHECK (jsonb_typeof(content) = 'object' AND pg_column_size(content) < 500000),
  version INTEGER NOT NULL DEFAULT 1,
  -- Earlier versions, newest first: [{ version, at, title, summary, content }].
  history JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(history) = 'array' AND pg_column_size(history) < 2000000),
  chat_id UUID REFERENCES store_agent_chats(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS google_ads_documents_workspace_idx ON google_ads_documents (workspace_id, customer_id, updated_at DESC);

ALTER TABLE google_ads_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "google_ads_documents_select" ON google_ads_documents;
CREATE POLICY "google_ads_documents_select" ON google_ads_documents FOR SELECT USING (is_workspace_member(workspace_id));

-- Meta Ads (stage A, meta-ads/connect-plan.md).
-- One Meta connection per workspace, made with Facebook Login for Business on our
-- own Meta app. The client's user access token is stored encrypted (same envelope
-- as other integrations, src/lib/integrations/crypto.ts) and never leaves the
-- server: the site calls Meta's Ads MCP server and the Graph API with it.
-- Written and read only by the API routes with the service role: there is no
-- member policy, so not even the encrypted token is readable from the browser.

CREATE TABLE IF NOT EXISTS meta_ads_connections (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  -- Encrypted envelope holding { access_token }.
  token JSONB NOT NULL,
  -- Long-lived user tokens last about 60 days; null when Meta gave no expiry.
  token_expires_at TIMESTAMPTZ,
  granted_scopes TEXT[] NOT NULL DEFAULT '{}',
  -- App-scoped Meta user id (used by the deauthorize callback) and display name.
  meta_user_id TEXT NOT NULL CHECK (meta_user_id ~ '^[0-9]{1,30}$'),
  meta_user_name TEXT,
  -- The assets the workspace picked. Ids are digits only (ad account without "act_").
  ad_account_id TEXT CHECK (ad_account_id ~ '^[0-9]{1,30}$'),
  ad_account_name TEXT,
  ad_account_currency TEXT,
  business_id TEXT CHECK (business_id ~ '^[0-9]{1,30}$'),
  business_name TEXT,
  page_id TEXT CHECK (page_id ~ '^[0-9]{1,30}$'),
  page_name TEXT,
  catalog_id TEXT CHECK (catalog_id ~ '^[0-9]{1,30}$'),
  catalog_name TEXT,
  connected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meta_ads_connections_meta_user ON meta_ads_connections(meta_user_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_connections_connected_by ON meta_ads_connections(connected_by);

ALTER TABLE meta_ads_connections ENABLE ROW LEVEL SECURITY;

-- Every change the Meta agent applied after a person approved it.
-- Deleted with the connection when the workspace disconnects Meta.
CREATE TABLE IF NOT EXISTS meta_ads_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  chat_id UUID,
  approval_id UUID UNIQUE,
  tool TEXT NOT NULL CHECK (char_length(tool) BETWEEN 1 AND 120),
  title TEXT NOT NULL,
  arguments JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('applied', 'failed')),
  result JSONB,
  error TEXT,
  applied_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meta_ads_changes_workspace ON meta_ads_changes(workspace_id, created_at DESC);

ALTER TABLE meta_ads_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "meta_ads_changes_select" ON meta_ads_changes;
CREATE POLICY "meta_ads_changes_select" ON meta_ads_changes
  FOR SELECT USING (is_workspace_member(workspace_id));

-- The agent engine now serves a third place: the Meta Ads page ('meta_ads').
ALTER TABLE store_agent_chats DROP CONSTRAINT IF EXISTS store_agent_chats_domain_check;
ALTER TABLE store_agent_chats
  ADD CONSTRAINT store_agent_chats_domain_check CHECK (domain IN ('store', 'google_ads', 'meta_ads'));

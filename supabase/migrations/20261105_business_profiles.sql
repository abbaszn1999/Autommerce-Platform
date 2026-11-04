-- The workspace's business profile, shared by every agent (Vera on the Google
-- Ads page, the Store Assistant). One row per workspace: the values, and per
-- field where each came from and whether the owner confirmed it. Every edit is
-- logged (who changed what). Writes go through the platform (service role).

CREATE TABLE IF NOT EXISTS business_profiles (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  profile JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(profile) = 'object' AND pg_column_size(profile) < 100000),
  field_meta JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(field_meta) = 'object'),
  -- Bumped on every write; a write that read an older revision is retried.
  revision INTEGER NOT NULL DEFAULT 0,
  -- The first-run setup screen: finished, or skipped for now. NULL: show it.
  setup_status TEXT CHECK (setup_status IN ('completed', 'skipped')),
  setup_at TIMESTAMPTZ,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS business_profile_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  field TEXT NOT NULL CHECK (field ~ '^[a-zA-Z]{1,40}$'),
  before_value JSONB,
  after_value JSONB,
  before_meta JSONB,
  after_meta JSONB,
  source TEXT NOT NULL CHECK (source IN ('owner', 'chat', 'website', 'google_ads', 'merchant', 'store')),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  chat_id UUID REFERENCES store_agent_chats(id) ON DELETE SET NULL,
  undo_of UUID REFERENCES business_profile_changes(id) ON DELETE SET NULL,
  undone_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS business_profile_changes_workspace_idx ON business_profile_changes (workspace_id, created_at DESC);

ALTER TABLE business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_profile_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "business_profiles_select" ON business_profiles;
CREATE POLICY "business_profiles_select" ON business_profiles FOR SELECT USING (is_workspace_member(workspace_id));
DROP POLICY IF EXISTS "business_profile_changes_select" ON business_profile_changes;
CREATE POLICY "business_profile_changes_select" ON business_profile_changes FOR SELECT USING (is_workspace_member(workspace_id));
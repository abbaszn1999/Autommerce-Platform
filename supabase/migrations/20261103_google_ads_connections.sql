-- Google Ads and Merchant Center connections, one of each per workspace.
-- Tokens live in Composio (user_id = workspace_id); this table only keeps the
-- Composio connected-account ids and the account the workspace picked.
-- Written only by the API routes with the service role; members can read their own.

CREATE TABLE IF NOT EXISTS google_ads_connections (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('ads', 'merchant')),
  -- Active Composio connection; null until the first sign-in completes.
  composio_connected_account_id TEXT,
  -- Sign-in in progress; replaces the active one once Composio reports it ACTIVE.
  pending_connected_account_id TEXT,
  composio_auth_config_id TEXT NOT NULL,
  -- Google Ads only: the account (or manager) the user signed in with, digits only.
  login_customer_id TEXT CHECK (login_customer_id ~ '^[0-9]{10}$'),
  -- What the pending sign-in was started with; becomes login_customer_id on success.
  pending_login_customer_id TEXT CHECK (pending_login_customer_id ~ '^[0-9]{10}$'),
  -- The account the agent works on: Google Ads customer id or Merchant Center id.
  account_id TEXT CHECK (account_id ~ '^[0-9]{1,20}$'),
  account_name TEXT,
  account_currency TEXT,
  account_time_zone TEXT,
  connected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_google_ads_connections_connected_by ON google_ads_connections(connected_by);

ALTER TABLE google_ads_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "google_ads_connections_select" ON google_ads_connections;
CREATE POLICY "google_ads_connections_select" ON google_ads_connections
  FOR SELECT USING (is_workspace_member(workspace_id));

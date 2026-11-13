-- The same agent engine serves two places: the Store Assistant ('store') and the
-- Google Ads page ('google_ads'). Each chat belongs to one, so their chat lists,
-- tools and rules never mix. Existing chats are Store Assistant chats.

ALTER TABLE store_agent_chats
  ADD COLUMN IF NOT EXISTS domain TEXT NOT NULL DEFAULT 'store';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_agent_chats_domain_check') THEN
    ALTER TABLE store_agent_chats ADD CONSTRAINT store_agent_chats_domain_check CHECK (domain IN ('store', 'google_ads'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_store_agent_chats_domain
  ON store_agent_chats(workspace_id, user_id, domain, last_activity_at DESC);

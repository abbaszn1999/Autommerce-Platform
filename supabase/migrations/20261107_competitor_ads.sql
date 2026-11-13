-- Competitor ads: the search keywords a competitor's site pays for in a
-- country (SE Ranking's paid keyword list, bought with the platform's key).
--
-- competitor_ads_pages: what SE Ranking answered, one row per page of a site's
-- list, shared by every workspace for the month (their paid data refreshes
-- monthly). A workspace asking for a page already here pays nothing.
-- Platform only (service role): no policies.
--
-- competitor_ads_analyses: the analyses a workspace ran, with what it paid
-- (credits at our cost, no margin), listed on the Competitor ads page.

CREATE TABLE IF NOT EXISTS competitor_ads_pages (
  domain TEXT NOT NULL CHECK (char_length(domain) BETWEEN 3 AND 253),
  country TEXT NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
  month TEXT NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  page INTEGER NOT NULL CHECK (page BETWEEN 1 AND 50),
  rows JSONB NOT NULL CHECK (jsonb_typeof(rows) = 'array' AND pg_column_size(rows) < 8000000),
  -- SE Ranking units this answer cost us.
  units INTEGER NOT NULL DEFAULT 0 CHECK (units >= 0),
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (domain, country, month, page)
);

ALTER TABLE competitor_ads_pages ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS competitor_ads_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  domain TEXT NOT NULL CHECK (char_length(domain) BETWEEN 3 AND 253),
  country TEXT NOT NULL CHECK (country ~ '^[A-Z]{2}$'),
  month TEXT NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  -- Pages of the list loaded (1,000 rows each).
  pages INTEGER NOT NULL DEFAULT 1 CHECK (pages BETWEEN 1 AND 50),
  -- What this workspace paid: SE Ranking units bought for it and the credits charged.
  units_bought INTEGER NOT NULL DEFAULT 0 CHECK (units_bought >= 0),
  credits_charged NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (credits_charged >= 0),
  -- For the list: { keywords, traffic, cost }.
  totals JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(totals) = 'object'),
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, domain, country, month)
);

CREATE INDEX IF NOT EXISTS competitor_ads_analyses_workspace_idx ON competitor_ads_analyses (workspace_id, updated_at DESC);

ALTER TABLE competitor_ads_analyses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "competitor_ads_analyses_select" ON competitor_ads_analyses;
CREATE POLICY "competitor_ads_analyses_select" ON competitor_ads_analyses FOR SELECT USING (is_workspace_member(workspace_id));

-- Lookups are charged as their own credit operation. Same list as the live constraint, plus 'competitor_ads'.
ALTER TABLE public.credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_operation_check;

ALTER TABLE public.credit_transactions
  ADD CONSTRAINT credit_transactions_operation_check
  CHECK (operation = ANY (ARRAY[
    'catalog_intelligence'::text,
    'ai_image_search'::text,
    'ai_column_mapping'::text,
    'ai_category_suggest'::text,
    'ai_function'::text,
    'store_assistant'::text,
    'image_classification'::text,
    'gallery_google'::text,
    'gallery_ai'::text,
    'visualizer_description'::text,
    'visualizer_images'::text,
    'credit_topup'::text,
    'monthly_reset'::text,
    'assistant'::text,
    'competitor_ads'::text
  ]));

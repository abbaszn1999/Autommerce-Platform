-- Merchant Center product fixes go through the same change log as Google Ads
-- changes ('target' tells them apart), and each product's current Autommerce
-- values are kept here, so an undo restores exactly what was there before.

ALTER TABLE google_ads_changes
  ADD COLUMN IF NOT EXISTS target TEXT NOT NULL DEFAULT 'ads';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'google_ads_changes_target_check') THEN
    ALTER TABLE google_ads_changes ADD CONSTRAINT google_ads_changes_target_check CHECK (target IN ('ads', 'merchant'));
  END IF;
END $$;

-- Merchant Center ids aren't always 10 digits like Google Ads customer ids.
ALTER TABLE google_ads_changes DROP CONSTRAINT IF EXISTS google_ads_changes_customer_id_check;
ALTER TABLE google_ads_changes ADD CONSTRAINT google_ads_changes_customer_id_check
  CHECK ((target = 'ads' AND customer_id ~ '^[0-9]{10}$') OR (target = 'merchant' AND customer_id ~ '^[0-9]{1,20}$'));

-- The values Autommerce currently supplies for one product, through its own
-- supplemental data source in the merchant's account. No row: nothing supplied.
CREATE TABLE IF NOT EXISTS merchant_product_overrides (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  merchant_id TEXT NOT NULL CHECK (merchant_id ~ '^[0-9]{1,20}$'),
  product_id TEXT NOT NULL,
  attributes JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (workspace_id, merchant_id, product_id)
);

ALTER TABLE merchant_product_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "merchant_product_overrides_select" ON merchant_product_overrides;
CREATE POLICY "merchant_product_overrides_select" ON merchant_product_overrides
  FOR SELECT USING (is_workspace_member(workspace_id));

-- Google Ads connections are read and written only by the API routes (service role).
-- Members never need direct table access, so the member SELECT policy is dropped:
-- with RLS on and no policy, the browser and any member token see no rows
-- (the service role bypasses RLS). The row holds Composio connected-account ids.

DROP POLICY IF EXISTS "google_ads_connections_select" ON google_ads_connections;
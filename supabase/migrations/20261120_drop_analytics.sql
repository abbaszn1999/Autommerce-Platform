-- The workspace Analytics feature (Search Console and GA4 connections, URL-filter rules
-- for the PLP and Products pages) and the Low Hanging Fruits placeholder are gone:
-- the pages, their API and their code are removed.
--
-- Deploy the app version without Analytics BEFORE running this: the old app still
-- reads these tables. Nothing else references them (no views, functions, policies
-- or foreign keys point at them).
--
-- The stored Google tokens are encrypted and are deleted with the tables. To also
-- revoke access on Google's side, remove "Autommerce" from each connected Google
-- account's third-party access page.
DROP TABLE IF EXISTS public.workspace_analytics_rules;
DROP TABLE IF EXISTS public.workspace_analytics_connections;

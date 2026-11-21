-- Retire the Customize tab (embeddable FAQ / internal-links widget).
--
-- The tab, the public embed endpoint (/api/embed/content) and public/widget.js
-- are removed from the app, so their storage goes too:
--   * workspace_domains       maps a store domain to a workspace so the embed
--                             endpoint could find it (also blocked two
--                             workspaces from connecting the same store).
--   * embed_page_cache        cached embed payloads per store domain + handle.
--   * workspaces.widget_settings  the merchant's saved widget styles.
--
-- Kept on purpose: workspaces.collection_prefix. Market Research still reads
-- it, and it is retired together with Market Research later.
--
-- None of these objects has a dependent function or view.

DROP TABLE IF EXISTS public.embed_page_cache;
DROP TABLE IF EXISTS public.workspace_domains;
ALTER TABLE public.workspaces DROP COLUMN IF EXISTS widget_settings;

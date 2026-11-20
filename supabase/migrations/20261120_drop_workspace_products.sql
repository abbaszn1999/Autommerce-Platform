-- Retire the old Products tab row store.
-- Nothing reads or writes workspace_products / workspace_product_columns any more;
-- their rows are dropped on purpose.

DROP FUNCTION IF EXISTS public.category_product_counts(uuid);
DROP FUNCTION IF EXISTS public.delete_workspace_products_except(uuid, text[]);

DROP TABLE IF EXISTS public.workspace_product_columns;
DROP TABLE IF EXISTS public.workspace_products;

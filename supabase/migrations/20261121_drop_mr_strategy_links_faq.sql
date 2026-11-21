-- Retire the last two Market Research stages' leftovers: internal linking,
-- the collection FAQ section and the Content strategy stage (topical blog
-- topics, the article writer and the sync to the store blog).
--
-- Market Research now ends at stage 6 (on-page copy for the pushed
-- collections). There are no tables for these features: everything lived in
-- the `mr_projects.state` JSON (and in per-project files in the
-- `workspace-files` bucket, which scripts/purge-retired-storage.ts removes).
-- This migration cleans that JSON and the stage columns.

-- 1. Drop the retired keys from every project's state.
UPDATE public.mr_projects
SET state = state
  - 'strategy'
  - 'articles'
  - 'strategyReady'
  - 'strategyApproved'
  - 'internalLinks'
WHERE state ?| ARRAY['strategy', 'articles', 'strategyReady', 'strategyApproved', 'internalLinks'];

-- The saved fingerprints of the retired per-project files.
UPDATE public.mr_projects
SET state = state
  #- '{sliceHashes,strategy}'
  #- '{sliceHashes,articles}'
  #- '{sliceHashes,article-jobs}'
  #- '{sliceHashes,internal-links}'
WHERE jsonb_typeof(state->'sliceHashes') = 'object'
  AND (state->'sliceHashes') ?| ARRAY['strategy', 'articles', 'article-jobs', 'internal-links'];

-- 2. The FAQ instruction no longer exists.
UPDATE public.mr_projects
SET state = jsonb_set(state, '{customInstruction}', (state->'customInstruction') - 'faq')
WHERE jsonb_typeof(state->'customInstruction') = 'object'
  AND (state->'customInstruction') ? 'faq';

-- 3. Older projects kept the generated collection copy inline: strip the FAQ
--    list and the internal links from each collection.
UPDATE public.mr_projects p
SET state = jsonb_set(
  p.state,
  '{contentById}',
  (
    SELECT COALESCE(jsonb_object_agg(
      c.key,
      CASE WHEN jsonb_typeof(c.value) = 'object' THEN c.value - 'faqs' - 'links' ELSE c.value END
    ), '{}'::jsonb)
    FROM jsonb_each(p.state->'contentById') AS c
  )
)
WHERE jsonb_typeof(p.state->'contentById') = 'object'
  AND EXISTS (
    SELECT 1
    FROM jsonb_each(p.state->'contentById') AS c
    WHERE jsonb_typeof(c.value) = 'object' AND (c.value ? 'faqs' OR c.value ? 'links')
  );

-- 4. The Content strategy tab folds into the last remaining tab.
UPDATE public.mr_projects
SET state = jsonb_set(state, '{workspaceTab}', '"content"')
WHERE state->>'workspaceTab' = 'strategy';

UPDATE public.mr_projects
SET state = jsonb_set(state, '{openedWorkspace}', '"content"')
WHERE state->>'openedWorkspace' = 'strategy';

-- 5. Stage 7 no longer exists: cap the stage numbers at 6.
UPDATE public.mr_projects
SET current_stage = 6
WHERE current_stage > 6;

UPDATE public.mr_projects
SET opened_max_stage = 6
WHERE opened_max_stage > 6;

UPDATE public.mr_projects
SET state = jsonb_set(state, '{stage}', '6')
WHERE jsonb_typeof(state->'stage') = 'number' AND (state->>'stage')::numeric > 6;

UPDATE public.mr_projects
SET state = jsonb_set(state, '{openedMax}', '6')
WHERE jsonb_typeof(state->'openedMax') = 'number' AND (state->>'openedMax')::numeric > 6;

ALTER TABLE public.mr_projects DROP CONSTRAINT IF EXISTS mr_projects_current_stage_check;
ALTER TABLE public.mr_projects DROP CONSTRAINT IF EXISTS mr_projects_opened_max_stage_check;
ALTER TABLE public.mr_projects
  ADD CONSTRAINT mr_projects_current_stage_check CHECK (current_stage BETWEEN 1 AND 6),
  ADD CONSTRAINT mr_projects_opened_max_stage_check CHECK (opened_max_stage BETWEEN 1 AND 6);

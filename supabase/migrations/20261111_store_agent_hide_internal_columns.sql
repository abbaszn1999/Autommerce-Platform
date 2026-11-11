-- Store Assistant: internal run and chat fields stay on the server.
-- The app reads these tables only with the service role; the browser key could still
-- read a user's own rows, including what it cost us (usd, cost_source, shortfall),
-- Cursor's ids and internal error text. Signed-in users keep the plain columns only.
-- The service role is not affected.

revoke select on public.store_agent_runs from anon, authenticated;
grant select (id, chat_id, workspace_id, user_id, model_id, mode, status,
  input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, credits, started_at, finished_at)
  on public.store_agent_runs to authenticated;

revoke select on public.store_agent_chats from anon, authenticated;
grant select (id, workspace_id, user_id, title, model_id, model_params, mode, status,
  context_used, context_window, credits_total, pinned, created_at, updated_at, last_activity_at, domain)
  on public.store_agent_chats to authenticated;

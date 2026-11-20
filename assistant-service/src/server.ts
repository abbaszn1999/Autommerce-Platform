import { mkdirSync } from "node:fs";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import { SupabaseAgentStoreBackend } from "./core/agent-store/supabase-backend";
import { WriteBehindAgentStore } from "./core/agent-store/write-behind-store";
import { keepModelCatalogFresh } from "./core/model-catalog";
import { StoreAgentRegistry } from "./core/run";
import { AGENTS } from "./agents";
import { loadConfig, type ServiceConfig } from "./config";
import { createResilientFetch } from "./core/resilient-fetch";
import { mountStoreAgentRoutes, shutdownStoreAgent, sweepStoreAgent } from "./core/routes";

export function createApp() {
  const app = new Hono();
  app.get("/health", (c) => c.json({ ok: true }));
  return app;
}

/** Start the Store Agent on the app when it is configured. Returns its shutdown hook. */
function startStoreAgent(app: Hono, config: ServiceConfig): (() => Promise<void>) | null {
  if (!config.storeAgent) {
    console.log("[store-agent] off (set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and INTEGRATION_ENCRYPTION_KEY)");
    return null;
  }
  mkdirSync(config.storeAgent.workDir, { recursive: true });
  const log = (message: string, extra?: unknown) => console.log(`[store-agent] ${message}`, extra ?? "");
  const db = createClient(config.storeAgent.supabaseUrl, config.storeAgent.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: createResilientFetch(fetch, log) },
  });
  const store = new WriteBehindAgentStore(new SupabaseAgentStoreBackend(db), log);
  const registry = new StoreAgentRegistry();
  const deps = {
    db,
    store,
    registry,
    agents: AGENTS,
    log,
    cursorApiKey: config.cursorApiKey,
    workRoot: config.storeAgent.workDir,
    secret: config.secret,
    platformUrl: config.platformUrl,
    imageKeys: config.imageKeys,
  };
  mountStoreAgentRoutes(app, deps);
  // Starting agents then never calls Cursor's rate-limited model list.
  keepModelCatalogFresh(config.cursorApiKey, log);
  void sweepStoreAgent(deps, { startup: true });
  setInterval(() => void sweepStoreAgent(deps, { startup: false }), 60 * 60 * 1000).unref();
  console.log(`[store-agent] on (work dir: ${config.storeAgent.workDir})`);
  return () => shutdownStoreAgent(deps);
}

export async function startServer(config: ServiceConfig = loadConfig()) {
  const app = createApp();
  const shutdownAgents = startStoreAgent(app, config);
  const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host });
  console.log(`[assistant] listening on ${config.host}:${config.port}`);
  return { server, shutdown: async () => shutdownAgents?.() };
}

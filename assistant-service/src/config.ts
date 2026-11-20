import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export interface ServiceConfig {
  /** 127.0.0.1 locally; 0.0.0.0 on a host that routes traffic in, such as Render. */
  host: string;
  port: number;
  /** Shared secret that signs every request from the platform. */
  secret: string;
  cursorApiKey: string;
  /** The agents' storage: on when Supabase and the integration key are configured. */
  storeAgent: { supabaseUrl: string; serviceRoleKey: string; workDir: string } | null;
  /** The platform site, which the ads agents' tools call (signed with `secret`). */
  platformUrl: string;
  /** The agents' own image tool: Google (Nano Banana) and OpenAI (GPT Image) keys; a missing key turns that model off. */
  imageKeys: { gemini?: string; openai?: string };
}

const num = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServiceConfig {
  const secret = env.ASSISTANT_SERVICE_SECRET ?? "";
  if (secret.length < 32) {
    throw new Error("ASSISTANT_SERVICE_SECRET must be set to at least 32 characters");
  }
  const cursorApiKey = env.CURSOR_API_KEY ?? "";
  if (!cursorApiKey) throw new Error("CURSOR_API_KEY is not set");
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
  const storeAgent =
    supabaseUrl && serviceRoleKey && env.INTEGRATION_ENCRYPTION_KEY
      ? {
          supabaseUrl,
          serviceRoleKey,
          // Off OneDrive and off the repo: chat folders are scratch space mirrored to Storage.
          workDir: resolve(env.STORE_AGENT_WORK_DIR || join(tmpdir(), "store-agent-work")),
        }
      : null;
  return {
    host: env.ASSISTANT_SERVICE_HOST || "127.0.0.1",
    port: num(env.ASSISTANT_SERVICE_PORT ?? env.PORT, 4100),
    secret,
    cursorApiKey,
    storeAgent,
    platformUrl: (env.PLATFORM_URL || "http://127.0.0.1:4000").replace(/\/+$/, ""),
    imageKeys: { gemini: env.GEMINI_API_KEY || undefined, openai: env.OPENAI_API_KEY || undefined },
  };
}

import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase-server";
import { PREVIEW_COOKIE, hasPreviewAccess } from "@/lib/google-ads/preview-access";
import { createAdminClient } from "@/lib/supabase-admin";
import { hideProviderNames } from "@/lib/provider-names";
import { storeToolBlock } from "@/lib/integrations/store-scopes";
import { isStoreAgentPlatform } from "./platforms";
import { signServiceRequest } from "@/lib/assistant/service-client";
import { getWorkspaceContext, isContextSubscriptionActive, type WorkspaceContext } from "@/lib/workspace-context";
import { AGENT_DOMAIN_HEADER, STORE_AGENT_LIMITS, type AgentDomain, type StoreAgentEvent } from "./protocol";

/** The Store Agent is on when the service is configured and the feature flag is set. */
export function isStoreAgentEnabled(): boolean {
  return process.env.STORE_AGENT_ENABLED === "true" && Boolean(process.env.ASSISTANT_SERVICE_SECRET);
}

function serviceUrl(): string {
  return (process.env.ASSISTANT_SERVICE_URL || "http://127.0.0.1:4100").replace(/\/+$/, "");
}

/** Signed request to the agent service. GET requests sign an empty body. */
export async function callStoreAgentService(params: {
  path: string;
  userId: string;
  method?: "GET" | "POST";
  body?: unknown;
  query?: string;
  signal?: AbortSignal;
}): Promise<Response> {
  const method = params.method ?? "POST";
  const secret = process.env.ASSISTANT_SERVICE_SECRET ?? "";
  const body = method === "GET" ? "" : JSON.stringify(params.body ?? {});
  const timestamp = Date.now();
  const signature = signServiceRequest({ secret, timestamp, userId: params.userId, method, path: params.path, body });
  return fetch(`${serviceUrl()}${params.path}${params.query ? `?${params.query}` : ""}`, {
    method,
    headers: {
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      "x-assistant-signature": signature,
      "x-assistant-timestamp": String(timestamp),
      "x-assistant-user": params.userId,
    },
    body: method === "POST" ? body : undefined,
    cache: "no-store",
    signal: params.signal,
  });
}

export type StoreAgentAccess = {
  userId: string;
  ctx: WorkspaceContext;
  admin: ReturnType<typeof createAdminClient>;
  /** Which agent the request is for: decides the checks above and the chats it sees. */
  domain: AgentDomain;
};

/** The domain a request asks for: the chat UI's header, else the Store Assistant. */
async function requestDomain(): Promise<AgentDomain> {
  try {
    return (await headers()).get(AGENT_DOMAIN_HEADER) === "google_ads" ? "google_ads" : "store";
  } catch {
    return "store";
  }
}

/**
 * Store Assistant ("store"): a signed-in member (not a viewer) of a workspace
 * with a connected Shopify or WooCommerce store.
 * Google Ads ("google_ads"): the workspace owner or an admin (its changes move
 * real money), with Google Ads connected and an ad account picked, and the
 * Google Ads preview unlocked like the page itself.
 * With `requireCredits`, also an active plan and enough credits to start a run.
 */
export async function authorizeStoreAgent(params: {
  workspaceId: string;
  requireCredits?: boolean;
  /** Defaults to the request's x-agent-domain header, else "store". */
  domain?: AgentDomain;
}): Promise<StoreAgentAccess | NextResponse> {
  if (!isStoreAgentEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!/^[0-9a-f-]{36}$/i.test(params.workspaceId)) return NextResponse.json({ error: "Bad workspace" }, { status: 400 });
  const domain = params.domain ?? (await requestDomain());

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const ctx = await getWorkspaceContext({ workspaceId: params.workspaceId, userId: user.id });
  if (!ctx.membershipRole || ctx.membershipRole === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (domain === "google_ads") {
    if (!["owner", "admin"].includes(String(ctx.membershipRole))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!hasPreviewAccess((await cookies()).get(PREVIEW_COOKIE)?.value)) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { data: ads } = await createAdminClient()
      .from("google_ads_connections")
      .select("account_id")
      .eq("workspace_id", params.workspaceId)
      .eq("kind", "ads")
      .not("composio_connected_account_id", "is", null)
      .maybeSingle();
    if (!ads?.account_id) return NextResponse.json({ error: "NO_GOOGLE_ADS" }, { status: 409 });
  } else if (!isStoreAgentPlatform(ctx.integration?.provider)) {
    return NextResponse.json({ error: "NO_STORE" }, { status: 409 });
  }
  if (params.requireCredits) {
    if (!ctx.subscription || !isContextSubscriptionActive(ctx)) {
      return NextResponse.json({ error: "NO_SUBSCRIPTION" }, { status: 402 });
    }
    if ((ctx.credits?.total ?? 0) < STORE_AGENT_LIMITS.minCreditsToStart) {
      return NextResponse.json({ error: "NO_CREDITS" }, { status: 402 });
    }
  }
  const admin = createAdminClient();
  // A new run needs the store's products readable; the rest only limits what it can do.
  if (params.requireCredits && domain === "store") {
    const noAccess = await storeToolBlock(admin, params.workspaceId, "store-assistant");
    if (noAccess) return noAccess;
  }
  return { userId: user.id, ctx, admin, domain };
}

/** The chat if it belongs to this user in this workspace, and to the agent the request is for. */
export async function loadOwnedChat(access: StoreAgentAccess, workspaceId: string, chatId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(chatId)) return null;
  const { data } = await access.admin
    .from("store_agent_chats")
    .select("*")
    .eq("id", chatId)
    .eq("workspace_id", workspaceId)
    .eq("user_id", access.userId)
    .eq("domain", access.domain)
    .maybeSingle();
  return data;
}

/** The agent a chat belongs to, whoever asks (for routes keyed by a run or approval id). */
export async function chatDomain(admin: StoreAgentAccess["admin"], chatId: string): Promise<AgentDomain | null> {
  const { data } = await admin.from("store_agent_chats").select("domain").eq("id", chatId).maybeSingle();
  return data ? (data.domain === "google_ads" ? "google_ads" : "store") : null;
}

/** Nothing from the service reaches the browser without passing through here. */
export function publicEvent(event: StoreAgentEvent): StoreAgentEvent {
  switch (event.type) {
    case "text":
    case "thinking":
      return { ...event, delta: hideProviderNames(event.delta) };
    case "tool_start":
      return { ...event, title: hideProviderNames(event.title), detail: hideProviderNames(event.detail) };
    case "tool_end":
      return { ...event, summary: hideProviderNames(event.summary) };
    case "error":
      return { ...event, message: hideProviderNames(event.message) };
    case "approval":
      return { ...event, summary: hideProviderNames(event.summary) };
    case "question":
      return {
        ...event,
        questions: event.questions.map((q) => ({ ...q, text: hideProviderNames(q.text), options: q.options.map((o) => hideProviderNames(o)) })),
      };
    case "plan":
      return { ...event, title: hideProviderNames(event.title), content: hideProviderNames(event.content) };
    default:
      return event;
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Relay the service's NDJSON stream to the browser, sanitizing each event.
 * The browser leaving does not stop the run: it keeps going on the service.
 */
export function relayEvents(upstream: Response, request: Request): Response {
  const reader = upstream.body!.getReader();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      request.signal.addEventListener("abort", () => {
        open = false;
        void reader.cancel().catch(() => undefined);
      });
      let buffer = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done || !open) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            let event: StoreAgentEvent;
            try {
              event = JSON.parse(line) as StoreAgentEvent;
            } catch {
              continue;
            }
            try {
              controller.enqueue(encoder.encode(`${JSON.stringify(publicEvent(event))}\n`));
            } catch {
              open = false;
              break;
            }
          }
        }
      } catch {
        // upstream ended
      } finally {
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
    cancel() {
      void reader.cancel().catch(() => undefined);
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

export const STORE_AGENT_FILES_BUCKET = "store-agent-files";

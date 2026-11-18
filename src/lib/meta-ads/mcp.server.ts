// Client for Meta's official Ads MCP server (https://mcp.facebook.com/ads).
// Server only: it sends the client's user access token as the Bearer header.
// Transport checked live (meta-ads/connect-plan.md §9): JSON-RPC over HTTP POST,
// replies as JSON or as an SSE stream, and an Mcp-Session-Id to send back.

import { createHash } from "node:crypto";
import { toAgentTools, type AgentTool, type McpTool } from "./mcp-tools";

export const META_MCP_URL = "https://mcp.facebook.com/ads";
const PROTOCOL_VERSION = "2025-06-18";
const SESSION_TTL_MS = 10 * 60 * 1000;
const TOOLS_TTL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 90_000;

export class MetaMcpError extends Error {
  /** `code` is safe to show; `detail` (Meta's text) is for server logs only. */
  constructor(public code: "unauthorized" | "network" | "meta_error", message: string, public detail?: string) {
    super(message);
  }
}

type Session = { id: string | null; at: number };
const sessions = new Map<string, Session>();
const toolCache = new Map<string, { tools: AgentTool[]; at: number }>();

const keyOf = (token: string) => createHash("sha256").update(token).digest("hex");
let nextId = 1;

async function post(token: string, sessionId: string | null, body: Record<string, unknown>, signal?: AbortSignal) {
  let res: Response;
  try {
    res = await fetch(META_MCP_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": PROTOCOL_VERSION,
        ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
      },
      body: JSON.stringify(body),
      signal: signal ?? AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new MetaMcpError("network", "Meta could not be reached. Try again in a moment.", (error as Error).message);
  }
  const text = await res.text();
  return { res, text };
}

/** The JSON-RPC reply with this id, from a JSON body or an SSE stream. */
function readReply(contentType: string | null, text: string, id: number): { result?: unknown; error?: { code?: number; message?: string } } | null {
  if ((contentType ?? "").includes("text/event-stream")) {
    let found: { result?: unknown; error?: { message?: string } } | null = null;
    for (const line of text.split("\n")) {
      if (!line.startsWith("data:")) continue;
      try {
        const msg = JSON.parse(line.slice(5).trim());
        if (msg && msg.id === id) found = msg;
      } catch {
        // Not JSON: a keep-alive or comment line.
      }
    }
    return found;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function openSession(token: string, signal?: AbortSignal): Promise<Session> {
  const id = nextId++;
  const { res, text } = await post(
    token,
    null,
    { jsonrpc: "2.0", id, method: "initialize", params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "autommerce", version: "1.0" } } },
    signal
  );
  if (res.status === 401 || res.status === 403) throw new MetaMcpError("unauthorized", "Meta refused the connection. Reconnect Meta.", text.slice(0, 500));
  const reply = readReply(res.headers.get("content-type"), text, id);
  if (!res.ok || !reply || reply.error) throw new MetaMcpError("meta_error", "Meta's ads server did not start a session.", (reply?.error?.message ?? text).slice(0, 500));
  const session = { id: res.headers.get("mcp-session-id"), at: Date.now() };
  await post(token, session.id, { jsonrpc: "2.0", method: "notifications/initialized", params: {} }, signal);
  return session;
}

async function session(token: string, signal?: AbortSignal): Promise<Session> {
  const key = keyOf(token);
  const cached = sessions.get(key);
  if (cached && Date.now() - cached.at < SESSION_TTL_MS) return cached;
  const fresh = await openSession(token, signal);
  sessions.set(key, fresh);
  return fresh;
}

/** One request; a session Meta forgot is opened again once. */
async function request(token: string, method: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const s = await session(token, signal);
    const id = nextId++;
    const { res, text } = await post(token, s.id, { jsonrpc: "2.0", id, method, params }, signal);
    if ((res.status === 404 || res.status === 400) && attempt === 0 && s.id) {
      sessions.delete(keyOf(token));
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      sessions.delete(keyOf(token));
      throw new MetaMcpError("unauthorized", "Meta refused the request: the connection expired or was removed. Reconnect Meta.", text.slice(0, 500));
    }
    const reply = readReply(res.headers.get("content-type"), text, id);
    if (!res.ok || !reply) throw new MetaMcpError("meta_error", `Meta's ads server answered with status ${res.status}.`, text.slice(0, 500));
    if (reply.error) throw new MetaMcpError("meta_error", `Meta refused the request: ${reply.error.message ?? "unknown error"}`, JSON.stringify(reply.error).slice(0, 500));
    return reply.result;
  }
  throw new MetaMcpError("meta_error", "Meta's ads server lost the session.");
}

/** The tools our agent may use (hidden ones removed, read vs write from Meta's annotations). */
export async function listAgentTools(token: string, signal?: AbortSignal): Promise<AgentTool[]> {
  const key = keyOf(token);
  const cached = toolCache.get(key);
  if (cached && Date.now() - cached.at < TOOLS_TTL_MS) return cached.tools;
  const all: McpTool[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const result = (await request(token, "tools/list", cursor ? { cursor } : {}, signal)) as { tools?: McpTool[]; nextCursor?: string };
    all.push(...(result?.tools ?? []));
    cursor = result?.nextCursor;
    if (!cursor) break;
  }
  const tools = toAgentTools(all);
  toolCache.set(key, { tools, at: Date.now() });
  return tools;
}

export type ToolOutput = { isError: boolean; text: string };

/** Call one tool; its content blocks joined as text (JSON stays JSON). */
export async function callTool(token: string, name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<ToolOutput> {
  const result = (await request(token, "tools/call", { name, arguments: args }, signal)) as {
    content?: Array<{ type: string; text?: string }>;
    structuredContent?: unknown;
    isError?: boolean;
  };
  const parts = (result?.content ?? []).map((c) => (c.type === "text" ? (c.text ?? "") : `[${c.type}]`));
  const text = parts.length ? parts.join("\n") : result?.structuredContent !== undefined ? JSON.stringify(result.structuredContent) : "";
  return { isError: result?.isError === true, text };
}

/** Parse a tool's JSON text, or null. */
export function parseJson<T = unknown>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Forget cached sessions and tools for a token (after disconnect). */
export function forgetToken(token: string) {
  const key = keyOf(token);
  sessions.delete(key);
  toolCache.delete(key);
}

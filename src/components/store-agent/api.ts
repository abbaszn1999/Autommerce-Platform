import type { MessageBlock } from "@/lib/store-agent/blocks";
import { AGENT_DOMAIN_HEADER, type AgentDomain, type ModelParam, type PlanStatus, type StoreAgentEvent } from "@/lib/store-agent/protocol";

export type ChatSummary = {
  id: string;
  title: string;
  model_id: string;
  model_params: ModelParam[];
  mode: "agent" | "plan";
  status: "idle" | "running" | "awaiting_approval" | "awaiting_answer" | "interrupted" | "error";
  context_used: number;
  context_window: number | null;
  credits_total: number;
  pinned: boolean;
  created_at: string;
  last_activity_at: string;
};

export type ChatMessage = {
  id: string;
  run_id: string | null;
  role: "user" | "assistant";
  content: string;
  blocks: MessageBlock[];
  attachments: Array<{ fileId: string; name: string; mime: string; size: number }>;
  created_at: string;
  run?: { id: string; credits: number; status: string; input_tokens: number; output_tokens: number; cache_read_tokens: number; started_at: string; finished_at: string | null } | null;
};

export type ChatFile = {
  id: string;
  name: string;
  kind: string;
  mime: string;
  size: number;
  created_by: "agent" | "user";
  created_at: string;
  path: string;
  /** A result Vera put in front of the user; otherwise one of her working files. */
  shown?: boolean;
  /** The folder the platform filed it in. */
  folder?: string | null;
  /** The request it came from, in one line. */
  request?: string | null;
};

export type ApprovalState = { status: string; kind: string; undoable: boolean; undone: boolean; applied: boolean };

/** A plan from Plan mode: shown in the panel, revised through the chat, built with Build. */
export type Plan = {
  id: string;
  title: string;
  content: string;
  version: number;
  status: PlanStatus;
  build_run_id: string | null;
  updated_at: string;
};

/** Panel tabs for plans share the files' list of open ids under this prefix. */
export const PLAN_TAB_PREFIX = "plan:";

export type Insight = { id: string; count: number; total: number; title: string; prompt: string };

export type AuditEntry = {
  id: string;
  operation: string;
  records: number;
  ok: boolean;
  error: string | null;
  createdAt: string;
  chatId: string | null;
  chatTitle: string | null;
  by: string | null;
};

export type Mention = { id: string; type: "Product" | "Collection" | "Category"; title: string; image: string | null; detail: string };

export type ModelOption = {
  id: string;
  displayName: string;
  isDefault: boolean;
  defaultParams: ModelParam[];
  parameters: Array<{ id: string; displayName: string; values: Array<{ value: string; displayName: string }> }>;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
  }
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new ApiError(body.error || "Something went wrong", res.status, body.error);
  return body;
}

const q = (params: Record<string, string>) => new URLSearchParams(params).toString();

/**
 * Which agent this page talks to. Only Google Ads requests carry the domain
 * (header, or `domain` in links), so Store Assistant requests stay exactly as before.
 */
let agentDomain: AgentDomain = "store";
export function setAgentDomain(domain: AgentDomain) {
  agentDomain = domain;
}

function agentFetch(input: string, init: RequestInit = {}) {
  if (agentDomain === "store") return fetch(input, init);
  const headers = new Headers(init.headers);
  headers.set(AGENT_DOMAIN_HEADER, agentDomain);
  return fetch(input, { ...init, headers });
}

export const storeAgentApi = {
  listChats: (workspaceId: string, search?: string) =>
    agentFetch(`/api/store-agent/chats?${q({ workspaceId, ...(search ? { q: search } : {}) })}`).then((r) => json<{ chats: ChatSummary[] }>(r)),

  createChat: (workspaceId: string, init?: { modelId?: string; modelParams?: ModelParam[]; mode?: "agent" | "plan" }) =>
    agentFetch("/api/store-agent/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, ...init }),
    }).then((r) => json<{ chat: ChatSummary }>(r)),

  loadChat: (workspaceId: string, chatId: string, before?: string) =>
    agentFetch(`/api/store-agent/chats/${chatId}?${q({ workspaceId, ...(before ? { before } : {}) })}`).then((r) =>
      json<{
        chat: ChatSummary;
        messages: ChatMessage[];
        files: ChatFile[];
        live: { runId: string; lastSeq: number; startedAt?: number } | null;
        hasMore: boolean;
        approvals: Record<string, ApprovalState>;
        plans: Plan[];
      }>(r)
    ),

  undo: (workspaceId: string, approvalId: string) =>
    agentFetch(`/api/store-agent/approvals/${approvalId}/undo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId }),
    }).then((r) => json<{ restored: number; failed: number; errors: string[]; skipped: string[] }>(r)),

  insights: (workspaceId: string) =>
    agentFetch(`/api/store-agent/insights?${q({ workspaceId })}`).then((r) => json<{ insights: Insight[]; scanned?: number; totalProducts?: number }>(r)),

  notes: (workspaceId: string) =>
    agentFetch(`/api/store-agent/notes?${q({ workspaceId })}`).then((r) => json<{ content: string; updatedAt: string | null }>(r)),

  saveNotes: (workspaceId: string, content: string) =>
    agentFetch("/api/store-agent/notes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, content }),
    }).then((r) => json<{ ok: true }>(r)),

  audit: (workspaceId: string, before?: string) =>
    agentFetch(`/api/store-agent/audit?${q({ workspaceId, ...(before ? { before } : {}) })}`).then((r) => json<{ entries: AuditEntry[] }>(r)),

  search: (workspaceId: string, term: string, signal?: AbortSignal) =>
    agentFetch(`/api/store-agent/search?${q({ workspaceId, q: term })}`, { signal }).then((r) => json<{ results: Mention[] }>(r)),

  updateChat: (
    workspaceId: string,
    chatId: string,
    patch: { title?: string; pinned?: boolean; modelId?: string; modelParams?: ModelParam[]; mode?: "agent" | "plan" }
  ) =>
    agentFetch(`/api/store-agent/chats/${chatId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, ...patch }),
    }).then((r) => json<{ chat: ChatSummary }>(r)),

  deleteChat: (workspaceId: string, chatId: string) =>
    agentFetch(`/api/store-agent/chats/${chatId}?${q({ workspaceId })}`, { method: "DELETE" }).then((r) => json<{ ok: true }>(r)),

  models: (workspaceId: string) =>
    agentFetch(`/api/store-agent/models?${q({ workspaceId })}`).then((r) =>
      json<{ models: ModelOption[]; prefs: { autoRun: boolean; modelId: string | null; modelParams: ModelParam[] | null } }>(r)
    ),

  setAutoRun: (workspaceId: string, autoRun: boolean) =>
    agentFetch("/api/store-agent/prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, autoRun }),
    }).then((r) => json<{ ok: true }>(r)),

  upload: (workspaceId: string, chatId: string, file: File) => {
    const form = new FormData();
    form.append("workspaceId", workspaceId);
    form.append("chatId", chatId);
    form.append("file", file);
    return agentFetch("/api/store-agent/files", { method: "POST", body: form }).then((r) =>
      json<{ file: { id: string; name: string; mime: string; size: number } }>(r)
    );
  },

  fileUrl: (workspaceId: string, fileId: string, download = false) =>
    `/api/store-agent/files/${fileId}?${q({ workspaceId, ...(download ? { download: "1" } : {}), ...(agentDomain === "store" ? {} : { domain: agentDomain }) })}`,

  fileText: (workspaceId: string, fileId: string) =>
    agentFetch(`/api/store-agent/files/${fileId}?${q({ workspaceId, format: "json" })}`).then((r) => json<{ text: string; name: string; mime: string; truncated?: boolean }>(r)),

  runAction: (workspaceId: string, runId: string, action: "cancel" | "steer" | "approve" | "answer", body: Record<string, unknown> = {}) =>
    agentFetch(`/api/store-agent/runs/${runId}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, ...body }),
    }).then((r) => json<{ ok?: boolean; delivered?: boolean }>(r)),

  send: (
    workspaceId: string,
    chatId: string,
    body: { message: string; attachmentIds: string[]; model: { id: string; params: ModelParam[] }; mode: "agent" | "plan"; buildPlanId?: string },
    signal: AbortSignal
  ) =>
    agentFetch(`/api/store-agent/chats/${chatId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, ...body }),
      signal,
    }),

  stream: (workspaceId: string, runId: string, after: number, signal: AbortSignal) =>
    agentFetch(`/api/store-agent/runs/${runId}/stream?${q({ workspaceId, after: String(after) })}`, { signal }),
};

/** Read an NDJSON event stream until it ends or the signal aborts. */
export async function readEvents(res: Response, onEvent: (event: StoreAgentEvent) => void): Promise<void> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        onEvent(JSON.parse(line) as StoreAgentEvent);
      } catch {
        // skip a malformed line
      }
    }
  }
}

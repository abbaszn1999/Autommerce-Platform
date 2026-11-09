"use client";

// Plans and reports on the live Google Ads page: the Documents list, the
// document open inside it, and applying a plan's steps one at a time so each
// one is seen to finish.

import { create } from "zustand";
import type { DocKind, LiveDoc, LiveDocSummary, PreviewItem } from "./live-docs";
import { useGoogleAds } from "./store";

export type StepCheckResult = { stepId: string; ok: true; items: PreviewItem[]; warnings: string[] } | { stepId: string; ok: false; error: string };

type State = {
  workspaceId: string | null;
  list: LiveDocSummary[];
  listStatus: "idle" | "loading" | "ready" | "error";
  canApply: boolean;
  docs: Record<string, LiveDoc>;
  /** The Documents page's folder: plans or reports. */
  kind: DocKind;
  /** The document open on the Documents page, or null for the list. */
  openId: string | null;
  /** Steps being applied or undone right now, by "docId:stepId". */
  busy: Record<string, "apply" | "undo">;
};

const empty = (): Omit<State, "workspaceId"> => ({ list: [], listStatus: "idle", canApply: false, docs: {}, kind: "plan", openId: null, busy: {} });

export const useLiveDocs = create<State>(() => ({ workspaceId: null, ...empty() }));

const get = useLiveDocs.getState;
const set = useLiveDocs.setState;

// Leaving the Documents page closes the open document: coming back shows the list.
let watchingView = false;
function watchView() {
  if (watchingView) return;
  watchingView = true;
  useGoogleAds.subscribe((s, prev) => {
    if (s.view !== prev.view && s.view !== "documents" && get().openId) set({ openId: null });
  });
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok && !(res.status === 422 && json && typeof json === "object" && "doc" in json)) throw new Error(errorText(json.error));
  return json;
}

function errorText(code: string | undefined): string {
  const map: Record<string, string> = {
    forbidden: "Only the workspace owner or an admin can apply plan steps.",
    not_connected: "Google Ads is not connected.",
    archived: "This plan is archived. Restore it first.",
    network: "Google could not be reached. Try again in a moment.",
    google_request_failed: "Google did not answer. Try again in a moment.",
    not_found: "This document is not on the connected account.",
  };
  return map[code ?? ""] ?? "Something went wrong. Try again.";
}

/** Start for a workspace (keeps the tabs when it is the same one). */
export function initLiveDocs(workspaceId: string) {
  if (get().workspaceId !== workspaceId) set({ workspaceId, ...empty() });
  watchView();
  void refreshDocList();
}

export async function refreshDocList() {
  const workspaceId = get().workspaceId;
  if (!workspaceId) return;
  if (get().listStatus !== "ready") set({ listStatus: "loading" });
  try {
    const { documents, canApply } = await api<{ documents: LiveDocSummary[]; canApply: boolean }>(`/api/google-ads/documents?${new URLSearchParams({ workspaceId })}`);
    if (get().workspaceId === workspaceId) set({ list: documents, canApply, listStatus: "ready" });
  } catch {
    if (get().workspaceId === workspaceId) set({ listStatus: "error" });
  }
}

function storeDoc(doc: LiveDoc) {
  set((s) => ({
    docs: { ...s.docs, [doc.id]: doc },
    list: s.list.some((d) => d.id === doc.id) ? s.list.map((d) => (d.id === doc.id ? summaryOf(doc) : d)) : [summaryOf(doc), ...s.list],
  }));
}

function summaryOf(doc: LiveDoc): LiveDocSummary {
  const { id, kind, title, summary, status, version, createdAt, updatedAt, chatId, steps } = doc;
  return { id, kind, title, summary, status, version, createdAt, updatedAt, chatId, ...(steps ? { steps } : {}) };
}

export async function loadDoc(docId: string): Promise<LiveDoc | null> {
  const workspaceId = get().workspaceId;
  if (!workspaceId) return null;
  const { document, canApply } = await api<{ document: LiveDoc; canApply: boolean }>(`/api/google-ads/documents/${docId}?${new URLSearchParams({ workspaceId })}`);
  if (get().workspaceId !== workspaceId) return null;
  set({ canApply });
  storeDoc(document);
  return document;
}

export async function loadDocVersion(docId: string, version: number) {
  const workspaceId = get().workspaceId;
  if (!workspaceId) return null;
  const { version: v } = await api<{ version: { version: number; at: string; title: string; summary: string; content: LiveDoc["content"] } }>(
    `/api/google-ads/documents/${docId}?${new URLSearchParams({ workspaceId, version: String(version) })}`
  );
  return v;
}

/** Open a document on the Documents page (from the list, a chat card, or when Vera saves one). */
export function openDoc(docId: string) {
  const known = get().docs[docId] ?? get().list.find((d) => d.id === docId);
  const ads = useGoogleAds.getState();
  // Documents belong to the whole account, not to a campaign.
  if (ads.scope.campaignId || ads.scope.adGroupId || ads.scope.assetGroupId) ads.setScope({});
  if (ads.view !== "documents") ads.setView("documents");
  set({ openId: docId, ...(known ? { kind: known.kind } : {}) });
  // Always read it fresh: a step may have been applied or the agent revised it.
  void loadDoc(docId)
    .then((doc) => doc && get().openId === docId && set({ kind: doc.kind }))
    .catch(() => undefined);
}

/** Back to the list, in the open document's folder. */
export const closeDoc = () => set({ openId: null });

export const setDocKind = (kind: DocKind) => set({ kind });

async function post<T>(docId: string, body: Record<string, unknown>): Promise<T> {
  const workspaceId = get().workspaceId;
  if (!workspaceId) throw new Error("No workspace.");
  return api<T>(`/api/google-ads/documents/${docId}`, { method: "POST", body: JSON.stringify({ workspaceId, ...body }) });
}

/** Ask Google about steps as the account is now; nothing changes. */
export async function checkDocSteps(docId: string, stepIds: string[]): Promise<StepCheckResult[]> {
  const { checks } = await post<{ checks: StepCheckResult[] }>(docId, { action: "check", stepIds });
  return checks;
}

/** Apply or undo one step. Returns Google's reason when it failed. */
export async function runDocStep(docId: string, stepId: string, action: "apply" | "undo"): Promise<{ ok: boolean; error?: string }> {
  const key = `${docId}:${stepId}`;
  if (get().busy[key]) return { ok: false, error: "Already running." };
  set((s) => ({ busy: { ...s.busy, [key]: action } }));
  try {
    const res = await post<{ ok: boolean; error?: string; doc: LiveDoc }>(docId, { action, stepId, version: get().docs[docId]?.version });
    if (res.doc) storeDoc(res.doc);
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  } catch (error) {
    // The result is unknown (network): read the plan again so the page shows what Google confirmed.
    void loadDoc(docId).catch(() => undefined);
    return { ok: false, error: (error as Error).message };
  } finally {
    set((s) => {
      const busy = { ...s.busy };
      delete busy[key];
      return { busy };
    });
  }
}

export async function setDocArchived(docId: string, archived: boolean) {
  const { document } = await post<{ document: LiveDoc }>(docId, { action: archived ? "archive" : "restore" });
  storeDoc(document);
}

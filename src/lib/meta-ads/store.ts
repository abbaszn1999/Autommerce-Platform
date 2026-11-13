"use client";

// Client state for the Meta Ads workspace. Prototype: ad account data lives in
// memory and changes apply locally. With the backend, `applyChange` becomes a
// POST to /api/meta-ads/mutate and account data comes from the Insights cache.
// The business profile and agent memory are not here: they are shared with the
// Google Ads agent (see ads-shared/business-store).

import { create } from "zustand";
import { useBusinessStore } from "@/lib/ads-shared/business-store";
import { rangeFor } from "./metrics";
import { CATALOG_ACCOUNTS, DEMO_FACEBOOK_EMAIL, PORTFOLIO_CHOICES, buildDemoAccount, buildEmptyAccount, buildSecondAccount } from "./mock-data";
import { freshSync, getDataSource, type SyncState } from "./data-source";
import { applyOps, describeOps, gid, partFromOp, touchedBy } from "./mutations";
import { validateOps } from "./validation";
import type { AgentDoc, AgentMemory, BusinessProfile } from "./docs";
import { seedDocs } from "./agent-docs";
import type {
  AgentMessage,
  AttributionSetting,
  CampaignBundle,
  CatalogAccount,
  ChangeEvent,
  ChangeSource,
  ChatThread,
  DateRange,
  DateRangePreset,
  MetaAccountData,
  MetaPortfolioChoice,
  MetaScope,
  MetaView,
  MutateOp,
  Objective,
  PartDraft,
  ProposedChange,
} from "./types";

export type ConnectionStatus = "disconnected" | "authorizing" | "selecting" | "connected";

/** The catalog is its own connection (own consent, own Commerce Manager account), separate from the ad account. */
export type CatalogConnection = {
  status: ConnectionStatus;
  email: string | null;
  accounts: CatalogAccount[];
  /** The chosen catalog. Kept while reconnecting so Cancel can fall back to it. */
  catalogId: string | null;
};

const NO_CATALOG: CatalogConnection = { status: "disconnected", email: null, accounts: [], catalogId: null };

export type MaDialog = { kind: "budget"; entity: "CAMPAIGN" | "AD_SET"; id: string } | { kind: "exclusions"; adSetId: string } | { kind: "rename"; entity: "CAMPAIGN" | "AD_SET" | "AD"; id: string };

/** Pending changes the editor can open: a whole campaign, a new ad set, or new ads. */
export function isEditableChange(change: ProposedChange): boolean {
  return change.status === "PENDING" && change.ops.some((op) => op.kind === "campaign.create" || op.kind === "adSet.create" || op.kind === "ad.create");
}

export type ProposedChangeInput = Pick<ProposedChange, "title" | "rationale" | "ops" | "risk"> & Partial<Pick<ProposedChange, "impact" | "messageId" | "source" | "resetsLearning">>;

export type AccountState = {
  data: MetaAccountData;
  changes: ProposedChange[];
  history: ChangeEvent[];
  chats: ChatThread[];
  openChatIds: string[];
  activeChatId: string;
  docs: AgentDoc[];
  openDocIds: string[];
  /** "account" or a document id. */
  activeTab: string;
  sync: SyncState;
};

type MaStore = {
  status: ConnectionStatus;
  facebookEmail: string | null;
  portfolios: MetaPortfolioChoice[];
  accounts: Record<string, AccountState>;
  accountId: string | null;
  /** The user pressed "Go to agent". Connecting the ad account alone doesn't open the workspace. */
  entered: boolean;
  catalog: CatalogConnection;

  view: MetaView;
  scope: MetaScope;
  range: DateRange;
  autoApprove: boolean;
  agentBusy: boolean;
  busyChatId: string | null;
  editor: { open: boolean; draft?: CampaignBundle; changeId?: string; part?: PartDraft };
  dialog: MaDialog | null;

  startConnect: () => void;
  completeAuth: () => void;
  /** First pick on the connect screen: connects the account but stays there until "Go to agent". */
  chooseAccount: (accountId: string) => void;
  /** Open (or switch to) an ad account inside the workspace. */
  selectAccount: (accountId: string) => void;
  changeAccount: () => void;
  /** Choose the Page, Instagram account and dataset the ads run with. */
  setIdentity: (patch: { pageId?: string; instagramId?: string; datasetId?: string }) => void;
  /** Move an organic post to another day, keeping its time. Organic posts need no approval; published ones cannot move. */
  reschedulePost: (postId: string, day: string) => void;
  enterWorkspace: () => void;
  disconnect: () => void;

  startCatalogConnect: () => void;
  completeCatalogAuth: () => void;
  selectCatalog: (catalogId: string) => void;
  changeCatalog: () => void;
  cancelCatalogConnect: () => void;
  disconnectCatalog: () => void;

  setView: (view: MetaView) => void;
  refreshData: () => Promise<void>;
  setScope: (scope: MetaScope, view?: MetaView) => void;
  setRange: (preset: DateRangePreset) => void;
  setAttribution: (attribution: AttributionSetting) => void;
  setAutoApprove: (on: boolean) => void;
  setAgentBusy: (busy: boolean, chatId?: string) => void;
  openEditor: (draft?: CampaignBundle, changeId?: string) => void;
  /** Opens a pending agent change in the editor that fits it (whole campaign, new ad set, or new ads). */
  openChangeEditor: (changeId: string) => void;
  closeEditor: () => void;
  openDialog: (dialog: MaDialog) => void;
  closeDialog: () => void;

  propose: (input: ProposedChangeInput) => ProposedChange;
  applyChange: (changeId: string) => void;
  rejectChange: (changeId: string) => void;
  reviseChange: (changeId: string, ops: MutateOp[], title?: string) => void;
  applyDirect: (title: string, ops: MutateOp[], source?: ChangeSource) => { ok: boolean; error?: string };
  undo: (eventId: string) => void;

  createDoc: (doc: AgentDoc, open?: boolean) => void;
  updateDoc: (docId: string, update: (doc: AgentDoc) => AgentDoc) => void;
  openDoc: (docId: string) => void;
  closeDocTab: (docId: string) => void;
  setActiveTab: (tab: string) => void;
  /** Profile and memory are shared with the Google Ads agent: one per workspace. */
  setProfile: (patch: Partial<BusinessProfile>) => void;
  addMemory: (text: string, source: AgentMemory["source"]) => void;
  removeMemory: (id: string) => void;
  markAlertsRead: (ids?: string[]) => void;
  addMessage: (message: AgentMessage, chatId?: string) => void;
  patchMessage: (id: string, patch: Partial<AgentMessage>) => void;
  newChat: () => void;
  selectChat: (chatId: string) => void;
  openChat: (chatId: string) => void;
  closeChat: (chatId: string) => void;
  renameChat: (chatId: string, title: string) => void;
  pinChat: (chatId: string) => void;
  deleteChat: (chatId: string) => void;
  setChatMode: (mode: ChatThread["mode"]) => void;
};

const ACTOR = "You";

/**
 * Views that make no sense at a scope fall back to the closest one that does.
 * Targeting lives on the ad set, so audience and placement pages are ad set pages
 * inside a campaign; the account level lists audiences and placements in total.
 */
export function viewForScope(view: MetaView, scope: MetaScope, objective?: Objective, _advantage = false): MetaView {
  const sales = objective === "SALES";
  const accountOnly: MetaView[] = ["campaigns", "experiments", "creatives", "eventsManager", "linkedAssets", "accountQuality", "brandSafety", "billing", "connections", "accountSettings", "documents", "profile", "rules", "opportunities", "trends"];

  if (scope.adSetId) {
    // Inside an ad set only Ads, Audience, Placements, settings and breakdowns exist.
    const allowed: MetaView[] = ["overview", "ads", "adSetAudience", "adSetPlacements", "adSetSettings", "breakdowns", "reports", "calendar", "pending", "history"];
    return allowed.includes(view) ? view : "ads";
  }
  if (view === "adSetAudience" || view === "adSetPlacements" || view === "adSetSettings") return scope.campaignId ? "adSets" : view === "adSetAudience" ? "audiences" : view === "adSetPlacements" ? "placements" : "campaigns";
  if (scope.campaignId) {
    // Inside a campaign the account-wide pages fall back to its ad sets, and objective pages follow the objective.
    if (accountOnly.includes(view)) return "adSets";
    if (view === "leadForms" && objective !== "LEADS") return "adSets";
    if (view === "landingPages" && objective !== "TRAFFIC") return "adSets";
    if (view === "reachFrequency" && objective !== "AWARENESS") return "adSets";
    if (view === "catalog" && !sales) return "adSets";
    return view;
  }
  if (view === "settings") return "campaigns";
  return view;
}

function current(state: MaStore): AccountState | null {
  return state.accountId ? state.accounts[state.accountId] ?? null : null;
}

function withAccount(state: MaStore, update: (a: AccountState) => AccountState): Partial<MaStore> {
  const acc = current(state);
  if (!acc || !state.accountId) return {};
  return { accounts: { ...state.accounts, [state.accountId]: update(acc) } };
}

export const NEW_CHAT_TITLE = "New chat";

function newThread(): ChatThread {
  const now = new Date().toISOString();
  return { id: gid("chat"), title: NEW_CHAT_TITLE, messages: [], mode: "agent", pinned: false, createdAt: now, updatedAt: now };
}

function chatTitleFrom(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 42 ? `${clean.slice(0, 41).trimEnd()}…` : clean || NEW_CHAT_TITLE;
}

export function activeChatOf(acc: Pick<AccountState, "chats" | "activeChatId">): ChatThread {
  return acc.chats.find((c) => c.id === acc.activeChatId) ?? acc.chats[0]!;
}

export function chatOfMessage(acc: Pick<AccountState, "chats">, messageId: string): ChatThread | undefined {
  return acc.chats.find((c) => c.messages.some((m) => m.id === messageId));
}

/** Always keeps at least one chat open: closing or deleting the last one starts a fresh chat. */
function ensureChat(a: AccountState): AccountState {
  if (a.openChatIds.length && a.chats.some((c) => c.id === a.activeChatId && a.openChatIds.includes(c.id))) return a;
  if (a.openChatIds.length) return { ...a, activeChatId: a.openChatIds[a.openChatIds.length - 1]! };
  const fresh = newThread();
  return { ...a, chats: [fresh, ...a.chats], openChatIds: [fresh.id], activeChatId: fresh.id };
}

export const useMetaAds = create<MaStore>((set, get) => ({
  status: "disconnected",
  facebookEmail: null,
  portfolios: [],
  accounts: {},
  accountId: null,
  entered: false,
  catalog: NO_CATALOG,

  view: "overview",
  scope: {},
  range: rangeFor("LAST_30_DAYS"),
  autoApprove: false,
  agentBusy: false,
  busyChatId: null,
  editor: { open: false },
  dialog: null,

  startConnect: () => set({ status: "authorizing" }),

  completeAuth: () => {
    const demo = buildDemoAccount();
    const second = buildSecondAccount();
    const empty = buildEmptyAccount();
    const fresh = (data: MetaAccountData, docs: AgentDoc[] = []): AccountState => {
      const first = newThread();
      return { data, changes: [], history: [], chats: [first], openChatIds: [first.id], activeChatId: first.id, docs, openDocIds: [], activeTab: "account", sync: freshSync() };
    };
    set({
      status: "selecting",
      facebookEmail: DEMO_FACEBOOK_EMAIL,
      portfolios: PORTFOLIO_CHOICES,
      accounts: {
        [demo.account.accountId]: fresh(demo, seedDocs(demo)),
        [second.account.accountId]: fresh(second),
        [empty.account.accountId]: fresh(empty),
      },
    });
  },

  chooseAccount: (accountId) => set({ status: "connected", entered: false, accountId, view: "overview", scope: {}, editor: { open: false }, dialog: null }),

  selectAccount: (accountId) => set({ status: "connected", entered: true, accountId, view: "overview", scope: {}, editor: { open: false }, dialog: null }),

  changeAccount: () => set((s) => (s.status === "connected" ? { status: "selecting", entered: false } : {})),

  setIdentity: (patch) => set((s) => withAccount(s, (a) => ({ ...a, data: { ...a.data, account: { ...a.data.account, ...patch } } }))),

  reschedulePost: (postId, day) =>
    set((s) =>
      withAccount(s, (a) => ({
        ...a,
        data: { ...a.data, posts: a.data.posts.map((p) => (p.id === postId && p.status !== "PUBLISHED" ? { ...p, publishAt: `${day}${p.publishAt.slice(10)}` } : p)) },
      }))
    ),

  enterWorkspace: () => set((s) => (s.status === "connected" && s.accountId ? { entered: true, view: "overview", scope: {} } : {})),

  disconnect: () => set({ status: "disconnected", entered: false, facebookEmail: null, portfolios: [], accounts: {}, accountId: null, view: "overview", scope: {} }),

  startCatalogConnect: () => set((s) => ({ catalog: { ...s.catalog, status: "authorizing" } })),

  completeCatalogAuth: () => set((s) => ({ catalog: { ...s.catalog, status: "selecting", email: DEMO_FACEBOOK_EMAIL, accounts: CATALOG_ACCOUNTS } })),

  selectCatalog: (catalogId) =>
    set((s) =>
      s.catalog.accounts.some((a) => a.catalogId === catalogId)
        ? { catalog: { ...s.catalog, status: "connected", catalogId }, ...withAccount(s, (a) => ({ ...a, data: { ...a.data, account: { ...a.data.account, catalogId } } })) }
        : {}
    ),

  changeCatalog: () => set((s) => (s.catalog.email ? { catalog: { ...s.catalog, status: "selecting", accounts: CATALOG_ACCOUNTS } } : {})),

  cancelCatalogConnect: () => set((s) => ({ catalog: s.catalog.catalogId ? { ...s.catalog, status: "connected" } : NO_CATALOG })),

  disconnectCatalog: () => set((s) => ({ catalog: NO_CATALOG, ...withAccount(s, (a) => ({ ...a, data: { ...a.data, account: { ...a.data.account, catalogId: undefined } } })) })),

  setView: (view) => set({ view }),

  refreshData: async () => {
    const start = get();
    const id = start.accountId;
    const acc = current(start);
    if (!id || !acc || acc.sync.status === "loading") return;
    const patch = (sync: Partial<SyncState>, data?: MetaAccountData) => set((s) => withAccount(s, (a) => ({ ...a, data: data ?? a.data, sync: { ...a.sync, ...sync } })));
    patch({ status: "loading", error: undefined });
    try {
      const next = await getDataSource().fetchAccount(id, acc.data);
      patch({ status: "ready", refreshedAt: new Date().toISOString(), error: undefined }, next === acc.data ? undefined : next);
    } catch (err) {
      patch({ status: "error", error: (err as Error).message || "Could not load this ad account." });
    }
  },

  setScope: (scope, view) =>
    set((s) => {
      const data = current(s)?.data;
      const campaign = data?.campaigns.find((c) => c.id === scope.campaignId);
      return { scope, view: viewForScope(view ?? s.view, scope, campaign?.objective, campaign?.advantageState === "ADVANTAGE_PLUS") };
    }),

  setRange: (preset) => set((s) => ({ range: rangeFor(preset, undefined, s.range.attribution) })),
  setAttribution: (attribution) => set((s) => ({ range: { ...s.range, attribution } })),
  setAutoApprove: (on) => set({ autoApprove: on }),
  setAgentBusy: (busy, chatId) =>
    set((s) => {
      const acc = current(s);
      return { agentBusy: busy, busyChatId: busy ? chatId ?? (acc ? acc.activeChatId : null) : null };
    }),
  openEditor: (draft, changeId) => set({ editor: { open: true, draft, changeId } }),
  openChangeEditor: (changeId) => {
    const acc = current(get());
    const change = acc?.changes.find((c) => c.id === changeId);
    if (!acc || !change) return;
    for (const op of change.ops) {
      if (op.kind === "campaign.create") return set({ editor: { open: true, draft: op.bundle, changeId } });
      const part = partFromOp(op);
      if (part) return set({ editor: { open: true, part, changeId } });
    }
  },
  closeEditor: () => set({ editor: { open: false } }),
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),

  propose: (input) => {
    const acc = current(get());
    if (!acc) throw new Error("No ad account selected");
    const change: ProposedChange = {
      id: gid("chg"),
      createdAt: new Date().toISOString(),
      source: input.source ?? "AGENT",
      title: input.title,
      rationale: input.rationale,
      impact: input.impact,
      risk: input.risk,
      resetsLearning: input.resetsLearning,
      status: "PENDING",
      ops: input.ops,
      diff: describeOps(acc.data, input.ops),
      messageId: input.messageId,
    };
    set((s) => withAccount(s, (a) => ({ ...a, changes: [change, ...a.changes] })));
    if (get().autoApprove) get().applyChange(change.id);
    return change;
  },

  applyChange: (changeId) => {
    const acc = current(get());
    const change = acc?.changes.find((c) => c.id === changeId);
    if (!acc || !change || change.status !== "PENDING") return;
    const errors = validateOps(acc.data, change.ops);
    if (errors.length) {
      set((s) => withAccount(s, (a) => ({ ...a, changes: a.changes.map((c) => (c.id === changeId ? { ...c, status: "FAILED", error: errors.join(" ") } : c)) })));
      return;
    }
    try {
      const { next, inverse } = applyOps(acc.data, change.ops);
      const event: ChangeEvent = {
        id: gid("evt"),
        at: new Date().toISOString(),
        actor: change.source === "AGENT" ? "Agent (approved by you)" : ACTOR,
        source: change.source,
        title: change.title,
        diff: change.diff,
        inverse,
        changeId,
        touched: touchedBy(acc.data, change.ops, next),
      };
      set((s) => withAccount(s, (a) => ({ ...a, data: next, changes: a.changes.map((c) => (c.id === changeId ? { ...c, status: "APPLIED" } : c)), history: [event, ...a.history] })));
    } catch (err) {
      set((s) => withAccount(s, (a) => ({ ...a, changes: a.changes.map((c) => (c.id === changeId ? { ...c, status: "FAILED", error: (err as Error).message } : c)) })));
    }
  },

  rejectChange: (changeId) =>
    set((s) => withAccount(s, (a) => ({ ...a, changes: a.changes.map((c) => (c.id === changeId && c.status === "PENDING" ? { ...c, status: "REJECTED" } : c)) }))),

  reviseChange: (changeId, ops, title) => {
    const acc = current(get());
    if (!acc) return;
    set((s) =>
      withAccount(s, (a) => ({
        ...a,
        changes: a.changes.map((c) =>
          c.id === changeId && c.status === "PENDING" ? { ...c, ops, title: title ?? c.title, diff: describeOps(acc.data, ops), rationale: `${c.rationale} Edited by you before approval.` } : c
        ),
      }))
    );
  },

  applyDirect: (title, ops, source = "USER") => {
    const acc = current(get());
    if (!acc) return { ok: false, error: "No ad account selected" };
    const errors = validateOps(acc.data, ops);
    if (errors.length) return { ok: false, error: errors.join(" ") };
    try {
      const diff = describeOps(acc.data, ops);
      const { next, inverse } = applyOps(acc.data, ops);
      const event: ChangeEvent = { id: gid("evt"), at: new Date().toISOString(), actor: ACTOR, source, title, diff, inverse, touched: touchedBy(acc.data, ops, next) };
      set((s) => withAccount(s, (a) => ({ ...a, data: next, history: [event, ...a.history] })));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  },

  undo: (eventId) => {
    const acc = current(get());
    const event = acc?.history.find((e) => e.id === eventId);
    if (!acc || !event?.inverse || event.undone) return;
    const diff = describeOps(acc.data, event.inverse);
    const { next } = applyOps(acc.data, event.inverse);
    const undoEvent: ChangeEvent = { id: gid("evt"), at: new Date().toISOString(), actor: ACTOR, source: "USER", title: `Undo: ${event.title}`, diff, touched: event.touched };
    set((s) => withAccount(s, (a) => ({ ...a, data: next, history: [undoEvent, ...a.history.map((e) => (e.id === eventId ? { ...e, undone: true } : e))] })));
  },

  createDoc: (doc, open = true) =>
    set((s) =>
      withAccount(s, (a) => ({
        ...a,
        docs: [doc, ...a.docs],
        openDocIds: open ? [...a.openDocIds.filter((id) => id !== doc.id), doc.id] : a.openDocIds,
        activeTab: open ? doc.id : a.activeTab,
      }))
    ),

  updateDoc: (docId, update) => set((s) => withAccount(s, (a) => ({ ...a, docs: a.docs.map((d) => (d.id === docId ? update(d) : d)) }))),

  openDoc: (docId) =>
    set((s) => withAccount(s, (a) => ({ ...a, openDocIds: a.openDocIds.includes(docId) ? a.openDocIds : [...a.openDocIds, docId], activeTab: docId }))),

  closeDocTab: (docId) =>
    set((s) =>
      withAccount(s, (a) => {
        const idx = a.openDocIds.indexOf(docId);
        const openDocIds = a.openDocIds.filter((id) => id !== docId);
        const activeTab = a.activeTab !== docId ? a.activeTab : openDocIds[Math.max(0, idx - 1)] ?? "account";
        return { ...a, openDocIds, activeTab };
      })
    ),

  setActiveTab: (tab) => set((s) => withAccount(s, (a) => ({ ...a, activeTab: tab }))),

  setProfile: (patch) => useBusinessStore.getState().setProfile(patch),
  addMemory: (text, source) => useBusinessStore.getState().addMemory(text, source, "META"),
  removeMemory: (id) => useBusinessStore.getState().removeMemory(id),

  markAlertsRead: (ids) =>
    set((s) => withAccount(s, (a) => ({ ...a, data: { ...a.data, alerts: a.data.alerts.map((al) => (!ids || ids.includes(al.id) ? { ...al, read: true } : al)) } }))),

  addMessage: (message, chatId) =>
    set((s) =>
      withAccount(s, (a) => {
        const id = chatId ?? a.activeChatId;
        const now = new Date().toISOString();
        return {
          ...a,
          chats: a.chats.map((c) => {
            if (c.id !== id) return c;
            const name = c.title === NEW_CHAT_TITLE && message.role === "user" ? chatTitleFrom(message.text) : c.title;
            return { ...c, title: name, messages: [...c.messages, message], updatedAt: now };
          }),
        };
      })
    ),

  patchMessage: (id, patch) =>
    set((s) =>
      withAccount(s, (a) => ({
        ...a,
        chats: a.chats.map((c) => (c.messages.some((m) => m.id === id) ? { ...c, messages: c.messages.map((m) => (m.id === id ? { ...m, ...patch } : m)) } : c)),
      }))
    ),

  newChat: () =>
    set((s) =>
      withAccount(s, (a) => {
        const empty = a.openChatIds.map((id) => a.chats.find((c) => c.id === id)).find((c) => c && c.messages.length === 0);
        if (empty) return { ...a, activeChatId: empty.id };
        const fresh = newThread();
        return { ...a, chats: [fresh, ...a.chats], openChatIds: [...a.openChatIds, fresh.id], activeChatId: fresh.id };
      })
    ),

  selectChat: (chatId) => set((s) => withAccount(s, (a) => (a.openChatIds.includes(chatId) ? { ...a, activeChatId: chatId } : a))),

  openChat: (chatId) =>
    set((s) =>
      withAccount(s, (a) => (a.chats.some((c) => c.id === chatId) ? { ...a, openChatIds: a.openChatIds.includes(chatId) ? a.openChatIds : [...a.openChatIds, chatId], activeChatId: chatId } : a))
    ),

  closeChat: (chatId) =>
    set((s) =>
      withAccount(s, (a) => {
        const idx = a.openChatIds.indexOf(chatId);
        if (idx < 0) return a;
        const openChatIds = a.openChatIds.filter((id) => id !== chatId);
        const activeChatId = a.activeChatId !== chatId ? a.activeChatId : (openChatIds[Math.max(0, idx - 1)] ?? "");
        return ensureChat({ ...a, openChatIds, activeChatId });
      })
    ),

  renameChat: (chatId, title) => set((s) => withAccount(s, (a) => ({ ...a, chats: a.chats.map((c) => (c.id === chatId ? { ...c, title: title.trim() || c.title } : c)) }))),

  pinChat: (chatId) => set((s) => withAccount(s, (a) => ({ ...a, chats: a.chats.map((c) => (c.id === chatId ? { ...c, pinned: !c.pinned } : c)) }))),

  deleteChat: (chatId) =>
    set((s) =>
      withAccount(s, (a) => {
        const idx = a.openChatIds.indexOf(chatId);
        const openChatIds = a.openChatIds.filter((id) => id !== chatId);
        const activeChatId = a.activeChatId !== chatId ? a.activeChatId : (openChatIds[Math.max(0, idx - 1)] ?? "");
        return ensureChat({ ...a, chats: a.chats.filter((c) => c.id !== chatId), openChatIds, activeChatId });
      })
    ),

  setChatMode: (mode) => set((s) => withAccount(s, (a) => ({ ...a, chats: a.chats.map((c) => (c.id === a.activeChatId ? { ...c, mode } : c)) }))),
}));

/** The selected ad account's state; null until one is picked. */
export function useAccountState(): AccountState | null {
  return useMetaAds((s) => (s.accountId ? s.accounts[s.accountId] ?? null : null));
}

export function useAccountData(): MetaAccountData | null {
  return useAccountState()?.data ?? null;
}

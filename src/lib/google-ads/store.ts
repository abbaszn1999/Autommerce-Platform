"use client";

// Client state for the Google Ads workspace. Prototype: account data lives in
// memory and changes apply locally. With the backend, `applyChange` becomes a
// POST to /api/google-ads/mutate and account data comes from the report cache.

import { create } from "zustand";
import { rangeFor } from "./metrics";
import { MANAGER_ACCOUNT, MERCHANT_ACCOUNTS, buildDemoAccount, buildEmptyAccount, buildSecondAccount, DEMO_GOOGLE_EMAIL } from "./mock-data";
import { LANDING_PAGE_TYPES } from "./constants";
import { freshSync, getDataSource, liveDataSource, setDataSource, type SyncState } from "./data-source";
import { applyOps, describeOps, gid, touchedBy } from "./mutations";
import { validateOps } from "./validation";
import { DEFAULT_PROFILE, seedMemories, type AgentDoc, type AgentMemory, type BusinessProfile } from "./docs";
import { seedDocs } from "./agent-docs";
import { LiveApiError, liveApi, type LiveConnection, type LiveKind } from "./live-api";
import type {
  AccountData,
  AgentMessage,
  CampaignBundle,
  CampaignType,
  ChangeEvent,
  ChatThread,
  ChangeSource,
  DateRangePreset,
  DateRange,
  GaScope,
  GaView,
  GoogleAccount,
  MerchantAccount,
  MutateOp,
  ProposedChange,
} from "./types";

export type ConnectionStatus = "disconnected" | "authorizing" | "selecting" | "connected";

/** Merchant Center is its own connection (own consent, own account), separate from Google Ads. */
export type MerchantConnection = {
  status: ConnectionStatus;
  email: string | null;
  /** Accounts the signed-in user can reach; filled after consent. */
  accounts: MerchantAccount[];
  /** The chosen account. Kept while reconnecting so Cancel can fall back to it. */
  merchantId: string | null;
};

const NO_MERCHANT: MerchantConnection = { status: "disconnected", email: null, accounts: [], merchantId: null };

/**
 * "demo": simulated sign-in and sample accounts, all in memory.
 * "live": real Google sign-in through /api/google-ads/connection for one workspace.
 */
export type ConnectionMode = "demo" | "live";

export type LiveState = {
  /** A request to the server is running (connect, list, select, disconnect). */
  busy: boolean;
  error: string | null;
  /** Accounts in the picker that Google won't let us use (cancelled, not enabled). */
  unusable: string[];
};

const LIVE_IDLE: LiveState = { busy: false, error: null, unusable: [] };

export type GaDialog =
  | { kind: "adGroup"; campaignId?: string }
  | { kind: "keywords"; adGroupId?: string }
  | { kind: "negatives"; campaignId?: string; adGroupId?: string }
  | { kind: "ad"; adGroupId?: string; adId?: string }
  | { kind: "asset"; campaignId?: string }
  | { kind: "budget"; campaignId: string }
  | { kind: "audience"; campaignId?: string; adGroupId?: string }
  | { kind: "conversion" };

export type ProposedChangeInput = Pick<ProposedChange, "title" | "rationale" | "ops" | "risk"> &
  Partial<Pick<ProposedChange, "impact" | "messageId" | "source">>;

type AccountState = {
  data: AccountData;
  changes: ProposedChange[];
  history: ChangeEvent[];
  /** Every conversation with the agent for this account. */
  chats: ChatThread[];
  /** Chats open as tabs, in order. */
  openChatIds: string[];
  activeChatId: string;
  docs: AgentDoc[];
  /** Document tabs open beside the Account tab, in order. */
  openDocIds: string[];
  /** "account" or a document id. */
  activeTab: string;
  profile: BusinessProfile;
  memories: AgentMemory[];
  /** Whether the data on screen is loading, failed to load, or was last refreshed at some time. */
  sync: SyncState;
};

type GaStore = {
  status: ConnectionStatus;
  googleEmail: string | null;
  accessible: GoogleAccount[];
  accounts: Record<string, AccountState>;
  customerId: string | null;
  /** The user pressed "Go to agent". Connecting Google Ads alone doesn't open the workspace. */
  entered: boolean;
  merchant: MerchantConnection;
  mode: ConnectionMode;
  workspaceId: string | null;
  live: LiveState;

  view: GaView;
  scope: GaScope;
  range: DateRange;
  autoApprove: boolean;
  agentBusy: boolean;
  /** The chat the running agent turn belongs to. */
  busyChatId: string | null;
  editor: { open: boolean; draft?: CampaignBundle; changeId?: string };
  dialog: GaDialog | null;

  /** Switch to real connections for a workspace and load what it has connected. */
  initLive: (workspaceId: string, notice?: { result: string | null; kind: string | null }) => Promise<void>;
  /** Live mode: send the browser to Google sign-in. Google Ads needs the customer ID first. */
  startLiveConnect: (kind: LiveKind, loginCustomerId?: string) => Promise<void>;
  clearLiveError: () => void;
  /** Close the sign-in step without touching an existing connection. */
  cancelConnect: () => void;

  startConnect: () => void;
  completeAuth: () => void;
  /** First pick on the connect screen: connects the account but stays there until "Go to agent". */
  chooseAccount: (customerId: string) => void;
  /** Open (or switch to) an account inside the workspace. */
  selectAccount: (customerId: string) => void;
  /** Choose a different ad account from the connect screen. */
  changeAccount: () => void;
  enterWorkspace: () => void;
  disconnect: () => void;

  startMerchantConnect: () => void;
  completeMerchantAuth: () => void;
  selectMerchantAccount: (merchantId: string) => void;
  /** Pick another Merchant Center account without signing in again. */
  changeMerchantAccount: () => void;
  /** Leave the consent or picker step; keeps the previous account when there was one. */
  cancelMerchantConnect: () => void;
  disconnectMerchant: () => void;

  setView: (view: GaView) => void;
  /** Reload the open account from the data source (shows loading, then ready or an error with Retry). */
  refreshData: (opts?: { force?: boolean }) => Promise<void>;
  setScope: (scope: GaScope, view?: GaView) => void;
  setRange: (preset: DateRangePreset) => void;
  setAutoApprove: (on: boolean) => void;
  setAgentBusy: (busy: boolean, chatId?: string) => void;
  openEditor: (draft?: CampaignBundle, changeId?: string) => void;
  closeEditor: () => void;
  openDialog: (dialog: GaDialog) => void;
  closeDialog: () => void;

  /** Queue a change for approval (or apply it straight away in auto-approve). */
  propose: (input: ProposedChangeInput) => ProposedChange;
  applyChange: (changeId: string) => void;
  rejectChange: (changeId: string) => void;
  /** Replace a pending change's ops after the user edited it (e.g. in the campaign editor). */
  reviseChange: (changeId: string, ops: MutateOp[], title?: string) => void;
  /** Apply right away: the user acted directly in the UI. */
  applyDirect: (title: string, ops: MutateOp[], source?: ChangeSource) => { ok: boolean; error?: string };
  undo: (eventId: string) => void;

  createDoc: (doc: AgentDoc, open?: boolean) => void;
  updateDoc: (docId: string, update: (doc: AgentDoc) => AgentDoc) => void;
  openDoc: (docId: string) => void;
  closeDocTab: (docId: string) => void;
  setActiveTab: (tab: string) => void;
  setProfile: (patch: Partial<BusinessProfile>) => void;
  addMemory: (text: string, source: AgentMemory["source"]) => void;
  removeMemory: (id: string) => void;
  /** Alerts are notifications, not account changes: no history entry. */
  markAlertsRead: (ids?: string[]) => void;
  /** Add to a chat (the open one unless `chatId` says otherwise). The first user message names the chat. */
  addMessage: (message: AgentMessage, chatId?: string) => void;
  /** Update a message wherever it lives. */
  patchMessage: (id: string, patch: Partial<AgentMessage>) => void;
  /** Start a new chat tab (reuses an empty one that is already open). */
  newChat: () => void;
  selectChat: (chatId: string) => void;
  /** Open a chat from History as a tab and show it. */
  openChat: (chatId: string) => void;
  closeChat: (chatId: string) => void;
  renameChat: (chatId: string, title: string) => void;
  pinChat: (chatId: string) => void;
  deleteChat: (chatId: string) => void;
  setChatMode: (mode: ChatThread["mode"]) => void;
};

const ACTOR = "You";

const PMAX_ONLY: GaView[] = ["brandExclusions", "searchCategories", "assetCombinations", "placementsShown"];
/** Demand Gen has no keywords, search terms or placement pages (Google handles content suitability at account level). */
const DEMAND_GEN_NONE: GaView[] = ["keywords", "negatives", "searchTerms", "content", "contentExclusions"];

/** Views that make no sense at a scope fall back to the closest one that does. */
function viewForScope(view: GaView, scope: GaScope, type?: CampaignType): GaView {
  const isPmax = type === "PERFORMANCE_MAX";
  const isSearch = type === "SEARCH";
  const isShopping = type === "SHOPPING";
  const isDisplay = type === "DISPLAY";
  const isDemandGen = type === "DEMAND_GEN";
  const assetGroupOnly: GaView[] = ["assetGroupAssets", "audienceSignals", "searchThemes", "assetGroupSettings"];
  if (scope.assetGroupId) {
    // Inside a Performance Max asset group only its own pages exist; anything else opens its assets.
    const allowed: GaView[] = ["overview", "reports", "pending", "history", "products", "channels", "assetCombinations", ...assetGroupOnly];
    return allowed.includes(view) ? view : "assetGroupAssets";
  }
  if (assetGroupOnly.includes(view)) return scope.campaignId ? "adGroups" : "campaigns";
  const accountOnly: GaView[] = ["campaigns", "conversions", "library", "products", "rules", "keywordPlanner", "experiments", "links", "accountSettings", "documents", "profile", "connections", "trends"];
  if (scope.adGroupId) {
    // Inside an ad group only that type's own pages exist; anything else goes to its home page.
    const home: GaView = isSearch ? "keywords" : "ads";
    const campaignOnly: GaView[] = ["adGroups", "recommendations", "settings", "planner", "content", "contentExclusions", "landingPages", "impressionShare", "priceCompetitiveness", "channels", "searchCategories", "brandExclusions", "assetCombinations", "placementsShown", "schedule", "devices"];
    if (campaignOnly.includes(view) || (accountOnly.includes(view) && view !== "products")) return home;
    if (view === "productGroups" && !isShopping) return home;
    if (view === "products" && !(isShopping || isDemandGen)) return home;
    if (view === "assets" && isShopping) return home;
    if (view === "keywords" && !isSearch) return isShopping ? "negatives" : home;
    if ((view === "negatives" || view === "searchTerms") && !(isSearch || isShopping)) return home;
    if (view === "demographics" && (isShopping || isPmax)) return home;
    if ((view === "locations" || view === "languages") && !isDemandGen) return home;
    return view;
  }
  if (!scope.adGroupId && view === "adGroupSettings") return scope.campaignId ? "adGroups" : "campaigns";
  // Shopping, Performance Max and Demand Gen can use the product feed, so Products stays inside those campaigns.
  if (scope.campaignId && accountOnly.includes(view) && !((isPmax || isShopping || isDemandGen) && view === "products")) return "adGroups";
  if (scope.campaignId && !scope.adGroupId && isDemandGen && DEMAND_GEN_NONE.includes(view)) return "adGroups";
  // Channels report: Performance Max and Demand Gen.
  if (!isPmax && !isDemandGen && view === "channels") return scope.campaignId ? "adGroups" : "overview";
  if (!scope.campaignId && view === "productGroups") return "products";
  if (!scope.campaignId && view === "settings") return "campaigns";
  // Performance Max has no ads, keywords, audience page, demographics, placements page or device bids.
  if (isPmax && (view === "ads" || view === "keywords" || view === "audiences" || view === "demographics" || view === "content")) return "adGroups";
  if (isPmax && view === "devices") return "locations";
  // Pages that only exist inside a Performance Max campaign.
  if (!isPmax && PMAX_ONLY.includes(view)) return scope.campaignId ? "adGroups" : "overview";
  // Landing pages exist for campaigns whose ads have final URLs.
  if (view === "landingPages" && !(type && LANDING_PAGE_TYPES.includes(type))) return scope.campaignId ? "adGroups" : "overview";
  // Impression share is a Search and Shopping report (account level lists them all); price competitiveness is Shopping only; Display has its own exclusions page.
  if (scope.campaignId && !isSearch && !isShopping && view === "impressionShare") return "adGroups";
  if (!isShopping && view === "priceCompetitiveness") return scope.campaignId ? "adGroups" : "overview";
  if (!isDisplay && view === "contentExclusions") return scope.campaignId ? "adGroups" : "overview";
  // Shopping ads come from the feed: no assets.
  if (isShopping && view === "assets") return "adGroups";
  return view;
}

function current(state: GaStore): AccountState | null {
  return state.customerId ? state.accounts[state.customerId] ?? null : null;
}

function withAccount(state: GaStore, update: (a: AccountState) => AccountState): Partial<GaStore> {
  const acc = current(state);
  if (!acc || !state.customerId) return {};
  return { accounts: { ...state.accounts, [state.customerId]: update(acc) } };
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

/** The chat shown in the agent panel. */
export function activeChatOf(acc: Pick<AccountState, "chats" | "activeChatId">): ChatThread {
  return acc.chats.find((c) => c.id === acc.activeChatId) ?? acc.chats[0]!;
}

/** The chat that holds a message. */
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

function freshAccountState(data: AccountData, docs: AgentDoc[] = []): AccountState {
  const first = newThread();
  return {
    data,
    changes: [],
    history: [],
    chats: [first],
    openChatIds: [first.id],
    activeChatId: first.id,
    docs,
    openDocIds: [],
    activeTab: "account",
    profile: { ...DEFAULT_PROFILE, businessName: data.account.name },
    memories: data.campaigns.length ? seedMemories() : [],
    sync: freshSync(),
  };
}

type LiveAccountFields = Pick<GoogleAccount, "customerId" | "name" | "currency" | "timeZone" | "isManager" | "managerCustomerId">;

function liveGoogleAccount(a: LiveAccountFields): GoogleAccount {
  return {
    customerId: a.customerId,
    name: a.name,
    currency: a.currency,
    timeZone: a.timeZone,
    isManager: a.isManager,
    managerCustomerId: a.managerCustomerId,
    optimizationScore: 0,
    autoTagging: false,
  };
}

/** A real account starts empty; its campaigns and reports load from Google in a later step. */
function liveAccountData(account: GoogleAccount): AccountData {
  return { ...buildEmptyAccount(), account, audiences: [], conversions: [], links: [] };
}

const liveMerchant = (merchantId: string, name: string, website = ""): MerchantAccount => ({ merchantId, name, website, country: "" });

export const useGoogleAds = create<GaStore>((set, get) => {
  /** Run a live request for the current workspace, showing busy and any error. */
  const liveRun = async (fn: (workspaceId: string) => Promise<void>) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return;
    set((s) => ({ live: { ...s.live, busy: true, error: null } }));
    try {
      await fn(workspaceId);
      set((s) => ({ live: { ...s.live, busy: false } }));
    } catch (err) {
      set((s) => ({ live: { ...s.live, busy: false, error: err instanceof LiveApiError ? err.message : "Something went wrong. Try again." } }));
    }
  };

  const loadAdsOptions = async (workspaceId: string) => {
    const { accounts } = await liveApi.adsAccounts(workspaceId);
    set((s) => ({
      status: "selecting",
      entered: false,
      accessible: accounts.map(liveGoogleAccount),
      live: { ...s.live, unusable: accounts.filter((a) => !a.usable).map((a) => a.customerId) },
    }));
  };

  const openAdsAccount = (account: GoogleAccount, entered: boolean) => {
    set((s) => ({
      status: "connected",
      entered,
      customerId: account.customerId,
      accessible: s.accessible.some((a) => a.customerId === account.customerId) ? s.accessible : [account],
      accounts: { ...s.accounts, [account.customerId]: s.accounts[account.customerId] ?? freshAccountState(liveAccountData(account)) },
      view: "overview",
      scope: {},
      editor: { open: false },
      dialog: null,
    }));
    // First open of a real account: load it from Google (the server caches it for a while).
    if (!get().accounts[account.customerId]?.data.exact) void get().refreshData();
  };

  const chooseLive = (customerId: string, entered: boolean) =>
    liveRun(async (workspaceId) => {
      const { account } = await liveApi.select(workspaceId, "ads", customerId);
      openAdsAccount(liveGoogleAccount(account as LiveAccountFields), entered);
    });

  const loadMerchantOptions = async (workspaceId: string) => {
    const { accounts } = await liveApi.merchantAccounts(workspaceId);
    set((s) => ({ merchant: { ...s.merchant, status: "selecting", accounts: accounts.map((a) => liveMerchant(a.merchantId, a.name, a.website)) } }));
  };

  const connectedAccount = (c: LiveConnection): GoogleAccount | null =>
    c.status === "connected" && c.accountId
      ? liveGoogleAccount({ customerId: c.accountId, name: c.accountName ?? c.accountId, currency: c.currency ?? "", timeZone: c.timeZone ?? "", isManager: false })
      : null;

  return {
  status: "disconnected",
  googleEmail: null,
  accessible: [],
  accounts: {},
  customerId: null,
  entered: false,
  merchant: NO_MERCHANT,
  mode: "demo",
  workspaceId: null,
  live: LIVE_IDLE,

  view: "overview",
  scope: {},
  range: rangeFor("LAST_30_DAYS"),
  autoApprove: false,
  agentBusy: false,
  busyChatId: null,
  editor: { open: false },
  dialog: null,

  initLive: async (workspaceId, notice) => {
    setDataSource(liveDataSource(workspaceId));
    set({
      mode: "live",
      workspaceId,
      status: "disconnected",
      entered: false,
      googleEmail: null,
      accessible: [],
      accounts: {},
      customerId: null,
      merchant: NO_MERCHANT,
      live: { ...LIVE_IDLE, busy: true },
    });
    try {
      const c = await liveApi.connections(workspaceId);
      if (!c.configured) throw new LiveApiError("Google Ads isn't set up on this server yet.");
      const ads = connectedAccount(c.ads);
      if (ads) openAdsAccount(ads, false);
      else if (c.ads.status === "selecting") await loadAdsOptions(workspaceId);
      if (c.merchant.status === "connected" && c.merchant.accountId)
        set({ merchant: { status: "connected", email: null, merchantId: c.merchant.accountId, accounts: [liveMerchant(c.merchant.accountId, c.merchant.accountName ?? c.merchant.accountId)] } });
      else if (c.merchant.status === "selecting") await loadMerchantOptions(workspaceId);
      const failed = notice?.result === "failed";
      const which = notice?.kind === "merchant" ? "Merchant Center" : "Google Ads";
      set((s) => ({ live: { ...s.live, busy: false, error: failed ? `${which} sign-in didn't finish. Try again.` : null } }));
    } catch (err) {
      set((s) => ({ live: { ...s.live, busy: false, error: err instanceof LiveApiError ? err.message : "Couldn't load the Google connection." } }));
    }
  },

  startLiveConnect: async (kind, loginCustomerId) => {
    const workspaceId = get().workspaceId;
    if (!workspaceId) return;
    set((s) => ({ live: { ...s.live, busy: true, error: null } }));
    try {
      const { redirectUrl } = await liveApi.start(workspaceId, kind, loginCustomerId);
      // Stay busy: the page is leaving for Google.
      window.location.assign(redirectUrl);
    } catch (err) {
      set((s) => ({ live: { ...s.live, busy: false, error: err instanceof LiveApiError ? err.message : "Couldn't start Google sign-in." } }));
    }
  },

  clearLiveError: () => set((s) => ({ live: { ...s.live, error: null } })),

  cancelConnect: () => set((s) => ({ status: s.customerId ? "connected" : s.accessible.length ? "selecting" : "disconnected" })),

  startConnect: () => set({ status: "authorizing" }),

  completeAuth: () => {
    const demo = buildDemoAccount();
    const second = buildSecondAccount();
    const empty = buildEmptyAccount();
    set({
      status: "selecting",
      googleEmail: DEMO_GOOGLE_EMAIL,
      accessible: [MANAGER_ACCOUNT, demo.account, second.account, empty.account],
      accounts: {
        [demo.account.customerId]: freshAccountState(demo, seedDocs(demo)),
        [second.account.customerId]: freshAccountState(second),
        [empty.account.customerId]: freshAccountState(empty),
      },
    });
  },

  chooseAccount: (customerId) => {
    if (get().mode === "live") return void chooseLive(customerId, false);
    set({ status: "connected", entered: false, customerId, view: "overview", scope: {}, editor: { open: false }, dialog: null });
  },

  selectAccount: (customerId) => {
    if (get().mode === "live" && customerId !== get().customerId) return void chooseLive(customerId, true);
    set({ status: "connected", entered: true, customerId, view: "overview", scope: {}, editor: { open: false }, dialog: null });
  },

  changeAccount: () => {
    if (get().mode === "live") return void liveRun(loadAdsOptions);
    set((s) => (s.status === "connected" ? { status: "selecting", entered: false } : {}));
  },

  enterWorkspace: () => set((s) => (s.status === "connected" && s.customerId ? { entered: true, view: "overview", scope: {} } : {})),

  disconnect: () => {
    const reset = () =>
      set({ status: "disconnected", entered: false, googleEmail: null, accessible: [], accounts: {}, customerId: null, view: "overview", scope: {} });
    if (get().mode !== "live") return reset();
    void liveRun(async (workspaceId) => {
      await liveApi.disconnect(workspaceId, "ads");
      reset();
    });
  },

  startMerchantConnect: () => {
    if (get().mode === "live") return void get().startLiveConnect("merchant");
    set((s) => ({ merchant: { ...s.merchant, status: "authorizing" } }));
  },

  completeMerchantAuth: () =>
    set((s) => ({ merchant: { ...s.merchant, status: "selecting", email: DEMO_GOOGLE_EMAIL, accounts: MERCHANT_ACCOUNTS } })),

  selectMerchantAccount: (merchantId) => {
    if (get().mode === "live")
      return void liveRun(async (workspaceId) => {
        await liveApi.select(workspaceId, "merchant", merchantId);
        set((s) => ({ merchant: { ...s.merchant, status: "connected", merchantId } }));
      });
    set((s) => (s.merchant.accounts.some((a) => a.merchantId === merchantId) ? { merchant: { ...s.merchant, status: "connected", merchantId } } : {}));
  },

  changeMerchantAccount: () => {
    if (get().mode === "live") return void liveRun(loadMerchantOptions);
    set((s) => (s.merchant.email ? { merchant: { ...s.merchant, status: "selecting", accounts: MERCHANT_ACCOUNTS } } : {}));
  },

  cancelMerchantConnect: () =>
    set((s) => ({ merchant: s.merchant.merchantId ? { ...s.merchant, status: "connected" } : NO_MERCHANT })),

  disconnectMerchant: () => {
    if (get().mode !== "live") return set({ merchant: NO_MERCHANT });
    void liveRun(async (workspaceId) => {
      await liveApi.disconnect(workspaceId, "merchant");
      set({ merchant: NO_MERCHANT });
    });
  },

  setView: (view) => set({ view }),

  refreshData: async (opts) => {
    const start = get();
    const id = start.customerId;
    const acc = current(start);
    if (!id || !acc || acc.sync.status === "loading") return;
    // Patch the account this load was for, even if the user switched accounts meanwhile.
    const patch = (sync: Partial<SyncState>, data?: AccountData) =>
      set((s) => {
        const a = s.accounts[id];
        return a ? { accounts: { ...s.accounts, [id]: { ...a, data: data ?? a.data, sync: { ...a.sync, ...sync } } } } : {};
      });
    patch({ status: "loading", error: undefined });
    try {
      const next = await getDataSource().fetchAccount(id, acc.data, { range: start.range, force: opts?.force });
      // Keep any change made while loading unless the source returned a new snapshot.
      patch({ status: "ready", refreshedAt: new Date().toISOString(), error: undefined }, next === acc.data ? undefined : next);
    } catch (err) {
      patch({ status: "error", error: (err as Error).message || "Could not load this account." });
    }
  },

  setScope: (scope, view) =>
    set((s) => {
      const data = current(s)?.data;
      const type = data?.campaigns.find((c) => c.id === scope.campaignId)?.type;
      return { scope, view: viewForScope(view ?? s.view, scope, type) };
    }),

  setRange: (preset) => {
    set({ range: rangeFor(preset) });
    // Live: per-keyword and per-ad totals are exact for one range, so load the new one.
    if (get().mode === "live") void get().refreshData();
  },
  setAutoApprove: (on) => set({ autoApprove: on }),
  setAgentBusy: (busy, chatId) =>
    set((s) => {
      const acc = current(s);
      return { agentBusy: busy, busyChatId: busy ? chatId ?? (acc ? acc.activeChatId : null) : null };
    }),
  openEditor: (draft, changeId) => set({ editor: { open: true, draft, changeId } }),
  closeEditor: () => set({ editor: { open: false } }),
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),

  propose: (input) => {
    const acc = current(get());
    if (!acc) throw new Error("No account selected");
    const change: ProposedChange = {
      id: gid("chg"),
      createdAt: new Date().toISOString(),
      source: input.source ?? "AGENT",
      title: input.title,
      rationale: input.rationale,
      impact: input.impact,
      risk: input.risk,
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
      set((s) =>
        withAccount(s, (a) => ({
          ...a,
          changes: a.changes.map((c) => (c.id === changeId ? { ...c, status: "FAILED", error: errors.join(" ") } : c)),
        }))
      );
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
      set((s) =>
        withAccount(s, (a) => ({
          ...a,
          data: next,
          changes: a.changes.map((c) => (c.id === changeId ? { ...c, status: "APPLIED" } : c)),
          history: [event, ...a.history],
        }))
      );
    } catch (err) {
      set((s) =>
        withAccount(s, (a) => ({
          ...a,
          changes: a.changes.map((c) => (c.id === changeId ? { ...c, status: "FAILED", error: (err as Error).message } : c)),
        }))
      );
    }
  },

  rejectChange: (changeId) =>
    set((s) =>
      withAccount(s, (a) => ({
        ...a,
        changes: a.changes.map((c) => (c.id === changeId && c.status === "PENDING" ? { ...c, status: "REJECTED" } : c)),
      }))
    ),

  reviseChange: (changeId, ops, title) => {
    const acc = current(get());
    if (!acc) return;
    set((s) =>
      withAccount(s, (a) => ({
        ...a,
        changes: a.changes.map((c) =>
          c.id === changeId && c.status === "PENDING"
            ? { ...c, ops, title: title ?? c.title, diff: describeOps(acc.data, ops), rationale: `${c.rationale} Edited by you before approval.` }
            : c
        ),
      }))
    );
  },

  applyDirect: (title, ops, source = "USER") => {
    const acc = current(get());
    if (!acc) return { ok: false, error: "No account selected" };
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
    set((s) =>
      withAccount(s, (a) => ({
        ...a,
        data: next,
        history: [undoEvent, ...a.history.map((e) => (e.id === eventId ? { ...e, undone: true } : e))],
      }))
    );
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
    set((s) =>
      withAccount(s, (a) => ({
        ...a,
        openDocIds: a.openDocIds.includes(docId) ? a.openDocIds : [...a.openDocIds, docId],
        activeTab: docId,
      }))
    ),

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

  setProfile: (patch) => set((s) => withAccount(s, (a) => ({ ...a, profile: { ...a.profile, ...patch } }))),

  addMemory: (text, source) =>
    set((s) => withAccount(s, (a) => ({ ...a, memories: [{ id: gid("mem"), text, source, at: new Date().toISOString() }, ...a.memories] }))),

  removeMemory: (id) => set((s) => withAccount(s, (a) => ({ ...a, memories: a.memories.filter((m) => m.id !== id) }))),

  markAlertsRead: (ids) =>
    set((s) =>
      withAccount(s, (a) => ({
        ...a,
        data: { ...a.data, alerts: a.data.alerts.map((al) => (!ids || ids.includes(al.id) ? { ...al, read: true } : al)) },
      }))
    ),

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
        // An empty chat that is already open is the new chat.
        const empty = a.openChatIds.map((id) => a.chats.find((c) => c.id === id)).find((c) => c && c.messages.length === 0);
        if (empty) return { ...a, activeChatId: empty.id };
        const fresh = newThread();
        return { ...a, chats: [fresh, ...a.chats], openChatIds: [...a.openChatIds, fresh.id], activeChatId: fresh.id };
      })
    ),

  selectChat: (chatId) => set((s) => withAccount(s, (a) => (a.openChatIds.includes(chatId) ? { ...a, activeChatId: chatId } : a))),

  openChat: (chatId) =>
    set((s) =>
      withAccount(s, (a) =>
        a.chats.some((c) => c.id === chatId) ? { ...a, openChatIds: a.openChatIds.includes(chatId) ? a.openChatIds : [...a.openChatIds, chatId], activeChatId: chatId } : a
      )
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

  renameChat: (chatId, title) =>
    set((s) => withAccount(s, (a) => ({ ...a, chats: a.chats.map((c) => (c.id === chatId ? { ...c, title: title.trim() || c.title } : c)) }))),

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
  };
});

/** The selected account's state; null until an account is picked. */
export function useAccountState(): AccountState | null {
  return useGoogleAds((s) => (s.customerId ? s.accounts[s.customerId] ?? null : null));
}

export function useAccountData(): AccountData | null {
  return useAccountState()?.data ?? null;
}

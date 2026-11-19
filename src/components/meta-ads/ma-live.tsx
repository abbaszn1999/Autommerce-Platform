"use client";

// The real Meta connection (meta-ads/connect-plan.md, stage A): Connect Meta
// with Facebook Login for Business, pick the assets, Vera's live chat on the
// left (Meta's official Ads MCP tools, every change approved on a card) and
// the account on the right with live data only (ma-live-account.tsx).

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { AlertTriangle, BarChart3, Bot, Building2, Check, Infinity as InfinityIcon, KeyRound, Loader2, Lock, LogOut, Newspaper, RefreshCw, ShieldCheck, ShoppingBag, ThumbsUp } from "lucide-react";
import { useWorkspaceContext } from "@/app/(dashboard)/w/[workspaceSlug]/workspace-context";
import { StoreAgentWorkspace } from "@/components/store-agent/store-agent-workspace";
import { cn } from "@/lib/utils";
import { MetaMark } from "./ma-connect";
import { LiveAccountArea } from "./ma-live-account";
import { BRAND_BTN, GHOST_BTN, Notice, connectUrl, errorText, fmtDate, type LiveConnection } from "./ma-live-common";

export { connectUrl, type LiveConnection } from "./ma-live-common";

type Pair = { id: string; name: string };
type LiveState = { loading: boolean; configured: boolean; canManage: boolean; connection: LiveConnection | null; error: string | null };

/** The workspace's real Meta connection (null until connected, or when Meta isn't configured). */
export function useMetaLive(workspaceId: string | undefined) {
  // Nothing to check without a workspace (e.g. a demo render): the demo shows at once.
  const [state, setState] = useState<LiveState>({ loading: !!workspaceId, configured: false, canManage: false, connection: null, error: null });
  useEffect(() => {
    if (!workspaceId) return;
    let alive = true;
    fetch(`/api/meta-ads/connection?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) setState({ loading: false, configured: false, canManage: false, connection: null, error: json.error ?? "network" });
        else setState({ loading: false, configured: !!json.configured, canManage: !!json.canManage, connection: json.connection ?? null, error: null });
      })
      .catch(() => alive && setState((s) => ({ ...s, loading: false, error: "network" })));
    return () => {
      alive = false;
    };
  }, [workspaceId]);
  return { ...state, setConnection: (connection: LiveConnection | null) => setState((s) => ({ ...s, connection })) };
}

/** ?meta=connected / ?meta_error=… from the login callback: read once, then removed from the address. */
export function useLoginResult(): string | null {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("meta_error");
    if (!code && !url.searchParams.has("meta")) return;
    ["meta", "meta_error", "missing"].forEach((k) => url.searchParams.delete(k));
    window.history.replaceState(null, "", url.toString());
    // After this render: the message shows once the address is clean.
    const timer = setTimeout(() => setError(code), 0);
    return () => clearTimeout(timer);
  }, []);
  return error;
}

// ── Connect ─────────────────────────────────────────────────────────────────

const CAN = [
  { icon: BarChart3, title: "Read your ads results", body: "Campaigns, spend, impressions, reach, clicks and results." },
  { icon: Newspaper, title: "Read your Pages", body: "The Facebook Pages you manage and their posts." },
  { icon: ShoppingBag, title: "Manage your catalogs", body: "List, create, rename and delete product catalogs." },
  { icon: ThumbsUp, title: "Change ads only with your approval", body: "Vera prepares each change; it runs only after you click Apply." },
];
const NEVER = ["See your Facebook password", "Change billing or payment methods", "Post on your Page", "Change anything without your approval"];

/**
 * The connect screen when Meta is set up on the server: only the real Facebook
 * Login for Business (no simulated login a person or a reviewer could mistake
 * for it), what Autommerce does and never does, and the policies.
 */
export function MetaRealConnect({ workspaceId, canManage, loginError }: { workspaceId: string; canManage: boolean; loginError: string | null }) {
  return (
    <div className="autommerce-dashboard flex-1 overflow-auto bg-background [font-family:var(--brand-font)]">
      <section className="relative overflow-hidden border-b border-border/60 bg-gradient-to-br from-[#400095]/[0.08] via-background to-[#F76D01]/[0.08]">
        <div className="absolute -left-24 -top-28 h-72 w-72 rounded-full bg-[#400095]/10 blur-3xl" />
        <div className="absolute -bottom-28 -right-16 h-72 w-72 rounded-full bg-[#F76D01]/10 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-6 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#400095] text-white shadow-[0_8px_25px_rgba(64,0,149,.22)] dark:bg-[#F76D01]">
                <InfinityIcon className="h-4 w-4" />
              </span>
              <span className="text-[9px] font-black uppercase tracking-[0.24em] text-[#400095] dark:text-[#F76D01]">Agents · Meta Ads</span>
            </div>
            <h1 className="text-3xl font-black tracking-[-0.035em] sm:text-5xl">
              Your Meta Ads,
              <span className="block bg-gradient-to-r from-[#F76D01] via-[#C40000] to-[#400095] bg-clip-text pb-1 text-transparent">run with Vera.</span>
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">
              Connect your Meta ad account and see your campaigns, Page posts and catalogs in one place. Ask Vera, Autommerce&apos;s ads agent, to analyse or change
              them. She prepares the change, you approve it.
            </p>
            {loginError && (
              <div className="mt-5 max-w-lg">
                <Notice>{errorText(loginError)}</Notice>
              </div>
            )}
            <div className="mt-6 flex max-w-lg flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-background/80 p-3 pr-4 shadow-sm">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <InfinityIcon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Meta ad account</p>
                <p className="text-xs text-muted-foreground">Facebook and Instagram ads, Pages and catalogs.</p>
              </div>
              {canManage ? (
                <a
                  href={connectUrl(workspaceId)}
                  className="inline-flex h-11 items-center gap-2.5 rounded-xl bg-[#1877F2] px-5 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#166fe0] hover:shadow-md"
                >
                  <MetaMark className="h-5 w-5 [&_circle]:fill-white [&_text]:fill-[#1877F2]" />
                  Connect with Facebook
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">Only the workspace owner or an admin can connect Meta.</span>
              )}
            </div>
            <span className="mt-4 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Lock className="h-3.5 w-3.5" /> Secure Facebook Login for Business. Autommerce never sees your Facebook password.
            </span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="rounded-3xl border border-border/60 bg-card/80 p-5 shadow-xl shadow-black/[0.04] backdrop-blur"
          >
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">With your permission, Autommerce can</p>
            <div className="space-y-3">
              {CAN.map((c) => (
                <div key={c.title} className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#400095]/10 text-[#400095] dark:bg-violet-500/15 dark:text-violet-300">
                    <c.icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{c.title}</p>
                    <p className="text-xs text-muted-foreground">{c.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl bg-muted/50 p-3">
              <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Autommerce never</p>
              {NEVER.map((c) => (
                <p key={c} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> {c}
                </p>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-4 px-6 py-8 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { n: "1", icon: KeyRound, title: "Connect with Facebook", body: "Log in on Facebook and allow the permissions Autommerce asks for." },
          { n: "2", icon: Building2, title: "Choose your assets", body: "Pick the ad account, business portfolio, Page and catalog Vera works on." },
          { n: "3", icon: Bot, title: "Work with Vera", body: "Ask in chat. She reads your account through Meta's official tools." },
          { n: "4", icon: Check, title: "Approve each change", body: "Nothing changes on Meta until you click Apply. Disconnect any time." },
        ].map((s) => (
          <div key={s.n} className="rounded-2xl border border-border/60 bg-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-[11px] font-bold text-background">{s.n}</span>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold">{s.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
          </div>
        ))}
      </div>

      <p className="mx-auto max-w-6xl px-6 pb-10 text-[11px] text-muted-foreground">
        <a href="https://autommerce.com/meta-privacy/" target="_blank" rel="noreferrer" className="underline">
          Privacy Policy for Meta
        </a>{" "}
        ·{" "}
        <a href="https://autommerce.com/meta-terms/" target="_blank" rel="noreferrer" className="underline">
          Terms
        </a>{" "}
        ·{" "}
        <a href="https://autommerce.com/data-deletion/" target="_blank" rel="noreferrer" className="underline">
          Delete your data
        </a>
      </p>
    </div>
  );
}

// ── Live workspace ──────────────────────────────────────────────────────────

export function MetaLiveWorkspace({ live, loginError }: { live: ReturnType<typeof useMetaLive>; loginError: string | null }) {
  const { workspace, role } = useWorkspaceContext();
  const [choosing, setChoosing] = useState(false);
  const connection = live.connection!;
  const canManage = role === "owner" || role === "admin";
  if (!workspace) return null;

  if (connection.expired) return <Expired workspaceId={workspace.id} canManage={canManage} onDisconnected={() => live.setConnection(null)} />;
  if (!connection.adAccount || choosing) {
    return (
      <AssetPicker
        workspaceId={workspace.id}
        connection={connection}
        canManage={canManage}
        loginError={loginError}
        onSaved={(c) => {
          live.setConnection(c);
          setChoosing(false);
        }}
        onCancel={connection.adAccount ? () => setChoosing(false) : undefined}
      />
    );
  }

  return (
    <div className="autommerce-dashboard flex h-full min-h-0 w-full bg-background [font-family:var(--brand-font)]">
      <aside aria-label="Meta Ads agent" className="flex h-full min-h-0 w-[440px] shrink-0 flex-col overflow-hidden border-e">
        <StoreAgentWorkspace
          workspaceId={workspace.id}
          basePath={`/w/${workspace.slug}`}
          storeName={connection.adAccount.name}
          // Meta changes move real money: only owners and admins work with Vera here.
          canEdit={canManage}
          domain="meta_ads"
          variant="panel"
        />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col bg-[#F6F4FA] dark:bg-background">
        <LiveAccountArea
          workspaceId={workspace.id}
          connection={connection}
          connectionCard={
            <ConnectionCard
              workspaceId={workspace.id}
              connection={connection}
              canManage={canManage}
              onChange={() => setChoosing(true)}
              onDisconnected={() => live.setConnection(null)}
            />
          }
        />
      </div>
    </div>
  );
}

function ConnectionCard({
  workspaceId,
  connection,
  canManage,
  onChange,
  onDisconnected,
}: {
  workspaceId: string;
  connection: LiveConnection;
  canManage: boolean;
  onChange: () => void;
  onDisconnected: () => void;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <MetaMark className="h-9 w-9" />
          <div>
            <h2 className="text-sm font-black">Connected Meta account</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Read and changed only through Meta&apos;s official tools, with the permissions you allowed.</p>
          </div>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onChange} className={GHOST_BTN}>
              Change assets
            </button>
            <a href={connectUrl(workspaceId)} className={GHOST_BTN}>
              <RefreshCw className="h-3.5 w-3.5" /> Reconnect
            </a>
            <DisconnectButton workspaceId={workspaceId} onDone={onDisconnected} />
          </div>
        )}
      </div>
      {connection.expiresSoon && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" /> The connection ends on {fmtDate(connection.expiresAt)}. Reconnect before then so Vera keeps working.
        </div>
      )}
      <dl className="grid gap-x-6 gap-y-2.5 text-[13px] sm:grid-cols-2">
        <Row label="Facebook user" value={connection.metaUserName ?? "—"} />
        <Row label="Ad account" value={connection.adAccount ? `${connection.adAccount.name} (${connection.adAccount.id})${connection.adAccount.currency ? ` · ${connection.adAccount.currency}` : ""}` : "—"} />
        <Row label="Business portfolio" value={connection.business?.name ?? "—"} />
        <Row label="Facebook Page" value={connection.page?.name ?? "—"} />
        <Row label="Catalog" value={connection.catalog?.name ?? "—"} />
        <Row label="Connection valid until" value={fmtDate(connection.expiresAt)} />
      </dl>
      <p className="mb-1.5 mt-4 text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">Permissions you allowed</p>
      <div className="flex flex-wrap gap-1.5">
        {connection.scopes.map((s) => (
          <span key={s} className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            {s}
          </span>
        ))}
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 gap-2">
      <dt className="w-40 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate font-medium" dir="auto">
        {value}
      </dd>
    </div>
  );
}

function DisconnectButton({ workspaceId, onDone }: { workspaceId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    const ok = window.confirm(
      "Disconnect Meta?\n\nAutommerce loses access to your Meta accounts at once. We delete the connection, the change history and the Meta Ads chats now. Your ads, Pages and catalogs on Meta are not changed."
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/meta-ads/connection?workspaceId=${encodeURIComponent(workspaceId)}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        window.alert(errorText(json.error) ?? "Could not disconnect. Try again.");
        return;
      }
      onDone();
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={run} disabled={busy} className={cn(GHOST_BTN, "text-red-600 hover:bg-red-500/10")}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />} Disconnect
    </button>
  );
}

function Expired({ workspaceId, canManage, onDisconnected }: { workspaceId: string; canManage: boolean; onDisconnected: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-md space-y-4 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
        <h2 className="text-xl font-black">The Meta connection expired</h2>
        <p className="text-sm text-muted-foreground">Meta connections last about 60 days. Reconnect to keep using Vera on Meta Ads; your choices are kept.</p>
        {canManage ? (
          <div className="flex justify-center gap-2">
            <a href={connectUrl(workspaceId)} className={BRAND_BTN}>
              Reconnect Meta
            </a>
            <DisconnectButton workspaceId={workspaceId} onDone={onDisconnected} />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Ask the workspace owner or an admin to reconnect Meta.</p>
        )}
      </div>
    </div>
  );
}

// ── Asset picker ────────────────────────────────────────────────────────────

type AssetLists = {
  adAccounts: Array<{ id: string; name: string; currency: string | null; status: string | null; mcpEnabled: boolean | null }>;
  businesses: Pair[];
  pages: Pair[];
  catalogs: Pair[];
  errors: Partial<Record<"adAccounts" | "businesses" | "pages" | "catalogs", string>>;
};

function AssetPicker({
  workspaceId,
  connection,
  canManage,
  loginError,
  onSaved,
  onCancel,
}: {
  workspaceId: string;
  connection: LiveConnection;
  canManage: boolean;
  loginError: string | null;
  onSaved: (c: LiveConnection) => void;
  onCancel?: () => void;
}) {
  const [lists, setLists] = useState<AssetLists | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pick, setPick] = useState({
    adAccount: connection.adAccount?.id ?? "",
    business: connection.business?.id ?? "",
    page: connection.page?.id ?? "",
    catalog: connection.catalog?.id ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/meta-ads/assets?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok) return setLoadError(json.error ?? "network");
        setLists(json);
        // Pre-select the first of each list: the user changes what they want.
        setPick((p) => ({
          adAccount: p.adAccount || (json.adAccounts?.[0]?.id ?? ""),
          business: p.business || (json.businesses?.[0]?.id ?? ""),
          page: p.page || (json.pages?.[0]?.id ?? ""),
          catalog: p.catalog || (json.catalogs?.[0]?.id ?? ""),
        }));
      })
      .catch(() => alive && setLoadError("network"));
    return () => {
      alive = false;
    };
  }, [workspaceId]);

  const save = async () => {
    if (!lists) return;
    setSaving(true);
    setSaveError(null);
    const find = <T extends Pair>(list: T[], id: string) => list.find((x) => x.id === id) ?? null;
    const ad = find(lists.adAccounts, pick.adAccount);
    try {
      const res = await fetch("/api/meta-ads/connection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          adAccount: ad ? { id: ad.id, name: ad.name, currency: ad.currency ?? "" } : null,
          business: find(lists.businesses, pick.business),
          page: find(lists.pages, pick.page),
          catalog: find(lists.catalogs, pick.catalog),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setSaveError(errorText(json.error));
      onSaved(json.connection);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="autommerce-dashboard flex flex-1 items-start justify-center overflow-auto bg-background px-4 py-12 [font-family:var(--brand-font)]">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-xl">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10">
            <Check className="h-6 w-6 text-emerald-600" />
          </span>
          <h1 className="text-2xl font-black tracking-tight">Choose what Vera works on</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connected as <span className="font-medium text-foreground">{connection.metaUserName ?? "your Facebook account"}</span>. Only the assets you shared on Facebook are
            listed.
          </p>
        </div>
        <div className="space-y-3">
          {loginError && <Notice>{errorText(loginError)}</Notice>}
          {loadError && <Notice>{errorText(loadError)}</Notice>}
        </div>
        {!lists && !loadError && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading your Meta accounts…
          </div>
        )}
        {lists && (
          <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
            <Picker
              label="Ad account"
              hint="Required. The account whose campaigns Vera reads and changes."
              value={pick.adAccount}
              onChange={(v) => setPick((p) => ({ ...p, adAccount: v }))}
              options={lists.adAccounts.map((a) => ({ id: a.id, label: `${a.name} (${a.id})${a.currency ? ` · ${a.currency}` : ""}${a.mcpEnabled === false ? " · not available to AI agents" : ""}` }))}
              error={lists.errors.adAccounts}
            />
            <Picker
              label="Business portfolio"
              hint="The business that owns your ad accounts, Pages and catalogs."
              value={pick.business}
              onChange={(v) => setPick((p) => ({ ...p, business: v }))}
              options={lists.businesses.map((b) => ({ id: b.id, label: b.name }))}
              error={lists.errors.businesses}
            />
            <Picker
              label="Facebook Page"
              hint="The Page whose posts are shown."
              value={pick.page}
              onChange={(v) => setPick((p) => ({ ...p, page: v }))}
              options={lists.pages.map((b) => ({ id: b.id, label: b.name }))}
              error={lists.errors.pages}
            />
            <Picker
              label="Product catalog"
              hint="The catalog whose products are shown."
              value={pick.catalog}
              onChange={(v) => setPick((p) => ({ ...p, catalog: v }))}
              options={lists.catalogs.map((b) => ({ id: b.id, label: b.name }))}
              error={lists.errors.catalogs}
            />
            {saveError && <Notice>{saveError}</Notice>}
            <div className="flex items-center justify-between gap-3 pt-2">
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" /> Every change Vera proposes waits for your approval.
              </p>
              <div className="flex gap-2">
                {onCancel && (
                  <button type="button" onClick={onCancel} className={GHOST_BTN}>
                    Cancel
                  </button>
                )}
                <button type="button" onClick={save} disabled={!canManage || !pick.adAccount || saving} className={BRAND_BTN}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />} Continue
                </button>
              </div>
            </div>
            {!canManage && <p className="text-xs text-muted-foreground">Only the workspace owner or an admin can choose the assets.</p>}
          </div>
        )}
      </motion.div>
    </div>
  );
}

function Picker({
  label,
  hint,
  value,
  onChange,
  options,
  error,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ id: string; label: string }>;
  error?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        dir="auto"
        className="h-10 w-full rounded-xl border border-border/70 bg-background px-3 text-sm outline-none focus:border-[#6B358D]"
      >
        <option value="">{options.length ? "— None —" : "Nothing shared"}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="block text-[11px] text-muted-foreground">{hint}</span>
      {error && <span className="block text-[11px] text-red-600">Meta could not list these: {error}</span>}
    </label>
  );
}

"use client";

// Stage A of the real Meta connection (meta-ads/connect-plan.md): Connect Meta
// with Facebook Login for Business, pick the assets, Vera's live chat on the
// left (Meta's official Ads MCP tools, every change approved on a card) and a
// small live panel on the right that shows each permission in use.

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, Infinity as InfinityIcon, Loader2, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { useWorkspaceContext } from "@/app/(dashboard)/w/[workspaceSlug]/workspace-context";
import { StoreAgentWorkspace } from "@/components/store-agent/store-agent-workspace";
import { cn } from "@/lib/utils";
import { MetaMark } from "./ma-connect";

type Pair = { id: string; name: string };
export type LiveConnection = {
  metaUserName: string | null;
  connectedAt: string;
  expiresAt: string | null;
  expired: boolean;
  expiresSoon: boolean;
  scopes: string[];
  adAccount: (Pair & { currency: string | null }) | null;
  business: Pair | null;
  page: Pair | null;
  catalog: Pair | null;
};
type LiveState = { loading: boolean; configured: boolean; canManage: boolean; connection: LiveConnection | null; error: string | null };

const BRAND_BTN =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#400095] px-5 text-sm font-bold text-white transition-colors hover:bg-[#340079] disabled:opacity-60 dark:bg-[#F76D01] dark:hover:bg-[#d85f00]";
const GHOST_BTN = "inline-flex h-9 items-center gap-1.5 rounded-lg border border-border/70 px-3 text-xs font-semibold transition-colors hover:bg-muted/60 disabled:opacity-60";

const ERRORS: Record<string, string> = {
  cancelled: "You cancelled the Facebook login. Nothing was connected.",
  missing_permissions: "Some permissions were not allowed, so nothing was connected. Connect again and allow everything asked.",
  invalid_state: "The login link expired or was opened by another account. Start again.",
  login_failed: "Facebook did not complete the login. Try again.",
  token_expired: "The Meta connection expired or was removed. Reconnect Meta.",
  meta_permission_missing: "Meta refused: a permission is missing. Reconnect Meta and allow everything asked.",
  not_configured: "Meta is not set up on this server yet.",
  network: "Meta could not be reached. Try again in a moment.",
  meta_request_failed: "Meta did not answer. Try again in a moment.",
  forbidden: "Only the workspace owner or an admin can do this.",
};
const errorText = (code: string | null | undefined) => (code ? ERRORS[code] ?? `Something went wrong (${code}).` : null);

export const connectUrl = (workspaceId: string) => `/api/meta-ads/oauth/start?workspaceId=${encodeURIComponent(workspaceId)}`;

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

/** Shown above the demo: connect the real account (admins) or why it isn't possible. */
export function MetaConnectBanner({ workspaceId, canManage, loginError }: { workspaceId: string; canManage: boolean; loginError: string | null }) {
  return (
    <div className="border-b border-border/60 bg-[#1877F2]/[0.06] px-6 py-3">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3">
        <MetaMark className="h-7 w-7 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">Connect your real Meta ad account</div>
          <div className="text-xs text-muted-foreground">
            Facebook Login for Business: you choose which ad accounts, Pages and catalogs Autommerce may use. We never see your password, and every change waits for your approval.
          </div>
          {loginError && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-red-600">
              <AlertTriangle className="h-3.5 w-3.5" /> {errorText(loginError)}
            </div>
          )}
        </div>
        {canManage ? (
          <a href={connectUrl(workspaceId)} className={cn(BRAND_BTN, "bg-[#1877F2] hover:bg-[#166fe0] dark:bg-[#1877F2] dark:hover:bg-[#166fe0]")}>
            Connect with Facebook
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">Only the workspace owner or an admin can connect Meta.</span>
        )}
      </div>
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
      <main className="min-w-0 flex-1 overflow-y-auto bg-[#F6F4FA] dark:bg-background">
        <div className="mx-auto max-w-5xl space-y-4 px-5 py-5">
          <ConnectionCard
            workspaceId={workspace.id}
            connection={connection}
            canManage={canManage}
            onChange={() => setChoosing(true)}
            onDisconnected={() => live.setConnection(null)}
          />
          <LivePanel workspaceId={workspace.id} connection={connection} />
        </div>
      </main>
    </div>
  );
}

function Card({ title, hint, children, action }: { title: string; hint?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/70 bg-background p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black">{title}</h2>
          {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—");

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
    <Card
      title="Connected Meta account"
      hint="Read and changed only through Meta's official tools, with the permissions you allowed."
      action={
        canManage ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onChange} className={GHOST_BTN}>
              Change assets
            </button>
            <a href={connectUrl(workspaceId)} className={GHOST_BTN}>
              <RefreshCw className="h-3.5 w-3.5" /> Reconnect
            </a>
            <DisconnectButton workspaceId={workspaceId} onDone={onDisconnected} />
          </div>
        ) : null
      }
    >
      {connection.expiresSoon && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" /> The connection ends on {fmtDate(connection.expiresAt)}. Reconnect before then so Vera keeps working.
        </div>
      )}
      <dl className="grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
        <Row label="Facebook user" value={connection.metaUserName ?? "—"} />
        <Row label="Ad account" value={connection.adAccount ? `${connection.adAccount.name} (${connection.adAccount.id})${connection.adAccount.currency ? ` · ${connection.adAccount.currency}` : ""}` : "—"} />
        <Row label="Business portfolio" value={connection.business?.name ?? "—"} />
        <Row label="Facebook Page" value={connection.page?.name ?? "—"} />
        <Row label="Catalog" value={connection.catalog?.name ?? "—"} />
        <Row label="Connection valid until" value={fmtDate(connection.expiresAt)} />
      </dl>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {connection.scopes.map((s) => (
          <span key={s} className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            {s}
          </span>
        ))}
      </div>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 gap-2">
      <dt className="w-40 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate font-medium">{value}</dd>
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
        // One choice only: pick it.
        setPick((p) => ({
          adAccount: p.adAccount || (json.adAccounts?.length === 1 ? json.adAccounts[0].id : ""),
          business: p.business || (json.businesses?.length === 1 ? json.businesses[0].id : ""),
          page: p.page || (json.pages?.length === 1 ? json.pages[0].id : ""),
          catalog: p.catalog || (json.catalogs?.length === 1 ? json.catalogs[0].id : ""),
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
    <div className="autommerce-dashboard flex-1 overflow-auto bg-background p-6 [font-family:var(--brand-font)]">
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#400095] text-white dark:bg-[#F76D01]">
            <InfinityIcon className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-black">Choose what Vera works on</h1>
            <p className="text-sm text-muted-foreground">
              Connected as {connection.metaUserName ?? "your Facebook account"}. Only the assets you shared in the Facebook popup are listed.
            </p>
          </div>
        </div>
        {loginError && <Notice>{errorText(loginError)}</Notice>}
        {loadError && <Notice>{errorText(loadError)}</Notice>}
        {!lists && !loadError && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading your Meta accounts…
          </div>
        )}
        {lists && (
          <div className="space-y-4 rounded-2xl border border-border/70 p-5">
            <Picker
              label="Ad account (required)"
              value={pick.adAccount}
              onChange={(v) => setPick((p) => ({ ...p, adAccount: v }))}
              options={lists.adAccounts.map((a) => ({ id: a.id, label: `${a.name} (${a.id})${a.currency ? ` · ${a.currency}` : ""}${a.mcpEnabled === false ? " · not available to AI agents" : ""}` }))}
              error={lists.errors.adAccounts}
            />
            <Picker label="Business portfolio" value={pick.business} onChange={(v) => setPick((p) => ({ ...p, business: v }))} options={lists.businesses.map((b) => ({ id: b.id, label: b.name }))} error={lists.errors.businesses} />
            <Picker label="Facebook Page" value={pick.page} onChange={(v) => setPick((p) => ({ ...p, page: v }))} options={lists.pages.map((b) => ({ id: b.id, label: b.name }))} error={lists.errors.pages} />
            <Picker label="Product catalog" value={pick.catalog} onChange={(v) => setPick((p) => ({ ...p, catalog: v }))} options={lists.catalogs.map((b) => ({ id: b.id, label: b.name }))} error={lists.errors.catalogs} />
            {saveError && <Notice>{saveError}</Notice>}
            <div className="flex items-center justify-between gap-3 pt-1">
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
      </div>
    </div>
  );
}

function Picker({ label, value, onChange, options, error }: { label: string; value: string; onChange: (v: string) => void; options: Array<{ id: string; label: string }>; error?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-bold">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-xl border border-border/70 bg-background px-3 text-sm outline-none focus:border-[#6B358D]"
      >
        <option value="">{options.length ? "— None —" : "Nothing shared"}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <span className="block text-[11px] text-red-600">Meta could not list these: {error}</span>}
    </label>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-medium text-red-700 dark:text-red-400">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{children}</span>
    </div>
  );
}

// ── Live panel ──────────────────────────────────────────────────────────────

type Section<T> = { ok: true; data: T } | { ok: false; error: string };
type PanelData = {
  campaigns: Section<{ rows: Array<Record<string, unknown>>; raw?: string }>;
  posts: Section<Array<{ id: string; message: string | null; createdTime: string; permalink: string | null; picture: string | null }>>;
  products: Section<{ rows: Array<Record<string, unknown>>; total: number | null }>;
};

/** A value from Meta: money comes as { value, unit } or { amount, currency }. */
const cell = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const amount = o.value ?? o.amount;
    const unit = o.unit ?? o.currency;
    if (amount !== undefined) return `${amount}${unit ? ` ${unit}` : ""}`;
  }
  return typeof v === "object" ? JSON.stringify(v).slice(0, 60) : String(v);
};
/** Columns worth showing first, when Meta's answer has them. */
const CAMPAIGN_COLUMNS = ["name", "status", "effective_status", "objective", "amount_spent", "spend", "impressions", "reach", "clicks", "ctr", "cpc", "cpm", "results", "cost_per_result"];

function LivePanel({ workspaceId, connection }: { workspaceId: string; connection: LiveConnection }) {
  const [data, setData] = useState<PanelData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/meta-ads/panel?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setError(json.error ?? "network");
      else setData(json);
    } catch {
      setError("network");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);
  useEffect(() => {
    void load();
  }, [load, connection.adAccount?.id, connection.page?.id, connection.catalog?.id]);

  const refresh = (
    <button type="button" onClick={() => void load()} disabled={loading} className={GHOST_BTN}>
      <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
    </button>
  );
  if (error) return <Notice>{errorText(error)}</Notice>;
  if (!data)
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Reading live data from Meta…
      </div>
    );

  return (
    <>
      <Card title="Campaigns · last 30 days" hint={`${connection.adAccount?.name ?? ""} · read live from Meta`} action={refresh}>
        <SectionBody section={data.campaigns}>
          {(d) => {
            if (!d.rows.length) return <Empty>{d.raw ? "Meta's answer had no campaign list." : "No campaigns in this ad account yet."}</Empty>;
            const keys = Object.keys(d.rows[0]);
            const cols = [...CAMPAIGN_COLUMNS.filter((c) => keys.includes(c)), ...keys.filter((k) => !CAMPAIGN_COLUMNS.includes(k) && /id$/.test(k) === false)].slice(0, 8);
            return (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[12px]">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      {cols.map((c) => (
                        <th key={c} className="whitespace-nowrap px-2 py-1.5 font-semibold">
                          {c.replace(/_/g, " ")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {d.rows.map((r, i) => (
                      <tr key={i} className="border-b border-border/40 last:border-0">
                        {cols.map((c) => (
                          <td key={c} className="max-w-[220px] truncate whitespace-nowrap px-2 py-1.5">
                            {cell(r[c])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }}
        </SectionBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Latest Page posts" hint={connection.page?.name ?? "No Page selected"}>
          <SectionBody section={data.posts}>
            {(posts) =>
              posts.length ? (
                <ul className="space-y-2.5">
                  {posts.map((p) => (
                    <li key={p.id} className="flex gap-3">
                      {p.picture ? <img src={p.picture} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" /> : <div className="h-12 w-12 shrink-0 rounded-lg bg-muted" />}
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-[12px]">{p.message ?? "(no text)"}</p>
                        <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-muted-foreground">
                          {fmtDate(p.createdTime)}
                          {p.permalink && (
                            <a href={p.permalink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:text-foreground">
                              Open <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>This Page has no posts yet.</Empty>
              )
            }
          </SectionBody>
        </Card>

        <Card title="Catalog products" hint={connection.catalog?.name ?? "No catalog selected"}>
          <SectionBody section={data.products}>
            {(d) =>
              d.rows.length ? (
                <>
                  {d.total !== null && <p className="mb-2 text-[11px] text-muted-foreground">{d.total.toLocaleString()} products in total</p>}
                  <ul className="divide-y divide-border/40 text-[12px]">
                    {d.rows.map((r, i) => (
                      <li key={i} className="flex justify-between gap-3 py-1.5">
                        <span className="truncate">{cell(r.name ?? r.title ?? r.retailer_id ?? r.id)}</span>
                        <span className="shrink-0 text-muted-foreground">{cell(r.price ?? r.availability ?? "")}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <Empty>This catalog has no products yet.</Empty>
              )
            }
          </SectionBody>
        </Card>
      </div>
    </>
  );
}

function SectionBody<T>({ section, children }: { section: Section<T>; children: (data: T) => React.ReactNode }) {
  if (!section.ok) return <p className="text-[12px] text-muted-foreground">{section.error}</p>;
  return <>{children(section.data)}</>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] text-muted-foreground">{children}</p>;
}

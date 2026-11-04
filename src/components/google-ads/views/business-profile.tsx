"use client";

// Live mode: the workspace's real business profile, shared by every agent.
// Owners and admins edit it here or tell Vera in chat; what Vera finds herself
// shows as a suggestion to confirm.

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Bot, Building2, Check, ExternalLink, Globe2, Loader2, Palette, Pencil, RefreshCw, ShieldBan, Swords, Wallet, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  FIELD_KEYS,
  REQUIRED,
  SECTIONS,
  completeness,
  fieldDef,
  formatValue,
  type BusinessProfileData,
  type Competitor,
  type PaletteColor,
  type ProfileField,
  type ProfileSection,
  type ProfileSource,
  type ProfileValue,
} from "@/lib/business-profile";
import { runAgentTurn } from "@/lib/google-ads/agent-runner";
import { useGoogleAds } from "@/lib/google-ads/store";
import { ACCENT_BTN, Card, Pill, SelectBox, ViewHeader } from "../ga-ui";

type Loaded = { profile: BusinessProfileData; canEdit: boolean; currency: string | null };

const ICONS: Record<ProfileSection, typeof Building2> = { business: Building2, markets: Globe2, economics: Wallet, positioning: Swords, guardrails: ShieldBan, brand: Palette };
const SOURCE_LABEL: Record<ProfileSource, string> = {
  owner: "you, on this page",
  chat: "you, in chat with Vera",
  website: "your website",
  google_ads: "your Google Ads account",
  merchant: "Merchant Center",
  store: "your store",
};
const REQUIRED_FIELDS = new Set<ProfileField>(REQUIRED.flat());

async function api<T>(init: RequestInit & { query?: Record<string, string> }): Promise<T> {
  const qs = init.query ? `?${new URLSearchParams(init.query)}` : "";
  const res = await fetch(`/api/business-profile${qs}`, { ...init, headers: { "Content-Type": "application/json" }, cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) {
    throw new Error(
      body.message ??
        (body.error === "forbidden" ? "Only workspace owners and admins can change the business profile." : body.error === "network" ? "Couldn't reach the server. Try again." : "Something went wrong. Try again.")
    );
  }
  return body as T;
}

function ago(iso: string | null | undefined) {
  if (!iso) return "never";
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : undefined);
const hostOf = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");

/** The value as the edit box shows it. */
function toDraft(field: ProfileField, value: ProfileValue | undefined): string {
  if (value == null) return "";
  switch (fieldDef(field).kind) {
    case "percent":
      return String(Math.round(Number(value) * 1000) / 10);
    case "list":
      return (value as string[]).join("\n");
    case "competitors":
      return (value as Competitor[]).map((c) => (c.url ? `${c.name} | ${c.url}` : c.name)).join("\n");
    case "palette":
      return (value as PaletteColor[]).map((c) => [c.name, c.hex, c.role].filter(Boolean).join(" | ")).join("\n");
    default:
      return String(value);
  }
}

/** The edit box's text as the raw value the server checks and stores. */
function fromDraft(field: ProfileField, draft: string): unknown {
  const text = draft.trim();
  if (!text) return null;
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const parts = (l: string) => l.split("|").map((p) => p.trim());
  switch (fieldDef(field).kind) {
    case "percent":
      return `${text}%`;
    case "list":
      return lines;
    case "competitors":
      return lines.map((l) => ({ name: parts(l)[0], url: parts(l)[1] ?? "" }));
    case "palette":
      return lines.map((l) => {
        const p = parts(l);
        const hexAt = p.findIndex((x) => /^#?[0-9a-f]{6}$/i.test(x));
        const hex = hexAt >= 0 ? (p[hexAt]!.startsWith("#") ? p[hexAt] : `#${p[hexAt]}`) : "";
        const rest = p.filter((_, i) => i !== hexAt);
        return { name: rest[0] ?? hex, hex, role: rest[1] ?? "" };
      });
    default:
      return text;
  }
}

const PLACEHOLDER: Partial<Record<ProfileField, string>> = {
  website: "https://yourstore.com",
  margin: "40",
  targetRoas: "4",
  brandTerms: "One per line, e.g.\nKalema\nكلمة",
  markets: "One country per line",
  competitors: "One per line: Name | https://their-site.com",
  palette: "One per line: Name | #400095 | Primary",
  neverAdvertise: "One per line",
};

function ValueView({ field, value, currency }: { field: ProfileField; value: ProfileValue | undefined; currency: string }) {
  if (value == null) return <p className="text-xs italic text-muted-foreground">Not filled yet</p>;
  const kind = fieldDef(field).kind;
  if (kind === "list")
    return (
      <div className="flex flex-wrap gap-1.5">
        {(value as string[]).map((i) => (
          <Pill key={i} tone={field === "neverAdvertise" ? "bad" : field === "markets" || field === "peakSeasons" ? "brand" : "neutral"}>
            {i}
          </Pill>
        ))}
      </div>
    );
  if (kind === "url") {
    const url = safeUrl(String(value));
    if (field === "logoUrl" && url)
      // eslint-disable-next-line @next/next/no-img-element -- logos live on the merchant's own site
      return <img src={url} alt="Logo" className="h-14 w-14 rounded-xl border border-border/60 object-contain" />;
    return url ? (
      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-[#400095] hover:underline dark:text-violet-300">
        {hostOf(url)} <ExternalLink className="h-3 w-3" />
      </a>
    ) : (
      <p className="text-xs">{String(value)}</p>
    );
  }
  if (kind === "competitors")
    return (
      <div className="grid gap-1.5 sm:grid-cols-2">
        {(value as Competitor[]).map((c) => {
          const url = safeUrl(c.url);
          return (
            <div key={c.name} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-xs">
              <span className="font-semibold">{c.name}</span>
              {url && (
                <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground hover:underline">
                  {hostOf(url)} <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          );
        })}
      </div>
    );
  if (kind === "palette")
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {(value as PaletteColor[]).map((c) => (
          <div key={c.hex + c.name} className="overflow-hidden rounded-xl border border-border/60">
            <div className="h-10" style={{ backgroundColor: c.hex }} />
            <div className="px-2.5 py-1.5">
              <p className="truncate text-[11px] font-semibold">{c.name}</p>
              <p className="truncate text-[10px] uppercase text-muted-foreground">
                {c.hex}
                {c.role ? ` · ${c.role}` : ""}
              </p>
            </div>
          </div>
        ))}
      </div>
    );
  if (kind === "percent" || kind === "ratio" || kind === "money")
    return (
      <p className="text-lg font-black leading-none tracking-tight">
        {formatValue(field, value, currency).replace(/ \(\d+%\)$/, "")}
        {field === "margin" && <span className="ml-2 text-[11px] font-normal text-muted-foreground">break-even ROAS {(1 / Number(value)).toFixed(2)}×</span>}
      </p>
    );
  return <p className="whitespace-pre-line text-xs leading-relaxed">{formatValue(field, value, currency)}</p>;
}

function FieldRow({
  field,
  data,
  canEdit,
  currency,
  onSave,
}: {
  field: ProfileField;
  data: BusinessProfileData;
  canEdit: boolean;
  currency: string;
  onSave: (field: ProfileField, value: unknown) => Promise<void>;
}) {
  const d = fieldDef(field);
  const value = data.values[field];
  const meta = data.meta[field];
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suggested = value != null && meta?.status === "suggested";
  const missingRequired = value == null && REQUIRED_FIELDS.has(field) && !(field === "margin" && data.values.targetRoas != null) && !(field === "targetRoas" && data.values.margin != null);

  const save = async (raw: unknown) => {
    setBusy(true);
    setError(null);
    try {
      await onSave(field, raw);
      setDraft(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const multiline = d.kind === "longtext" || d.kind === "list" || d.kind === "competitors" || d.kind === "palette";
  const inputCls = "w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

  return (
    <div className={cn("rounded-xl border p-3", suggested ? "border-amber-500/40 bg-amber-500/[0.04]" : missingRequired ? "border-dashed border-amber-500/50" : "border-border/60")}>
      <div className="mb-1.5 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">
            {d.label}
            {REQUIRED_FIELDS.has(field) && <span className="ml-1 text-amber-600" title="Required before money decisions">*</span>}
          </p>
          {d.hint && draft === null && <p className="mt-0.5 text-[11px] text-muted-foreground">{d.hint}</p>}
        </div>
        {canEdit && draft === null && (
          <button type="button" onClick={() => setDraft(toDraft(field, value))} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Edit ${d.label}`}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {draft === null ? (
        <>
          <ValueView field={field} value={value} currency={currency} />
          {suggested && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Pill tone="warn">Suggested by Vera from {SOURCE_LABEL[meta!.source] ?? meta!.source}</Pill>
              {canEdit && (
                <>
                  <button type="button" disabled={busy} onClick={() => void save(value)} className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                    <Check className="h-3 w-3" /> Confirm
                  </button>
                  <button type="button" disabled={busy} onClick={() => void save(null)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-semibold hover:bg-muted disabled:opacity-60">
                    <X className="h-3 w-3" /> Discard
                  </button>
                </>
              )}
            </div>
          )}
          {error && <p className="mt-1.5 text-[11px] text-red-600">{error}</p>}
        </>
      ) : (
        <div className="space-y-2">
          {d.kind === "choice" ? (
            <SelectBox
              value={draft}
              onChange={setDraft}
              options={[{ value: "", label: "Choose…" }, ...(d.choices ?? []).map((c) => ({ value: c.value, label: c.label }))]}
            />
          ) : multiline ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={d.kind === "longtext" ? 4 : 5}
              placeholder={PLACEHOLDER[field] ?? (d.kind === "list" ? "One per line" : "")}
              className={cn(inputCls, "resize-y py-2")}
              autoFocus
            />
          ) : (
            <div className="relative">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void save(fromDraft(field, draft))}
                inputMode={d.kind === "percent" || d.kind === "ratio" || d.kind === "money" ? "decimal" : undefined}
                placeholder={PLACEHOLDER[field] ?? ""}
                className={cn(inputCls, "h-9", (d.kind === "percent" || d.kind === "ratio" || d.kind === "money") && "pr-14")}
                autoFocus
              />
              {(d.kind === "percent" || d.kind === "ratio" || d.kind === "money") && (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  {d.kind === "percent" ? "%" : d.kind === "ratio" ? "×" : currency}
                </span>
              )}
            </div>
          )}
          {error && <p className="text-[11px] text-red-600">{error}</p>}
          <div className="flex items-center gap-2">
            <button type="button" disabled={busy} onClick={() => void save(fromDraft(field, draft))} className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold", ACCENT_BTN)}>
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
            </button>
            <button type="button" disabled={busy} onClick={() => (setDraft(null), setError(null))} className="rounded-md px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function LiveProfileView() {
  const workspaceId = useGoogleAds((s) => s.workspaceId);
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      setData(await api<Loaded>({ query: { workspaceId } }));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  // Vera can change the profile from the chat beside this page: read it again when the tab comes back and every 20 s.
  useEffect(() => {
    void load();
    const again = () => document.visibilityState === "visible" && void load();
    const timer = setInterval(again, 20_000);
    window.addEventListener("focus", again);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", again);
    };
  }, [load]);

  const saveField = useCallback(
    async (field: ProfileField, value: unknown) => {
      await api({ method: "PATCH", body: JSON.stringify({ workspaceId, edits: [{ field, value }] }) });
      await load();
    },
    [workspaceId, load]
  );

  if (!data) {
    return (
      <div className="space-y-4">
        <ViewHeader title="Business profile" />
        {error ? (
          <p className="rounded-lg bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-400">{error}</p>
        ) : (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading the business profile…
          </p>
        )}
      </div>
    );
  }

  const { profile, canEdit } = data;
  const currency = data.currency ?? "";
  const { sections, filled, total, missing } = completeness(profile.values);
  const suggestions = FIELD_KEYS.filter((f) => profile.values[f] != null && profile.meta[f]?.status === "suggested").length;

  return (
    <div className="space-y-4">
      <ViewHeader
        title="Business profile"
        subtitle="What Vera and every Autommerce agent in this workspace know about your business. Vera reads it before every plan, report and change. Edit it here, or just tell Vera in chat."
        actions={
          <>
            <span className="text-[11px] text-muted-foreground">Updated {ago(profile.updatedAt)}</span>
            <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 px-3 text-xs font-semibold hover:bg-muted disabled:opacity-60">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
            </button>
            <button
              type="button"
              onClick={() =>
                runAgentTurn(
                  "Fill in my business profile: read my website and my Google Ads account (and Merchant Center if connected) and save what you find as suggestions. Ask me only for required values that are still empty; never ask again about values already saved."
                )
              }
              className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold", ACCENT_BTN)}
            >
              <Bot className="h-3.5 w-3.5" /> Ask Vera to fill it
            </button>
          </>
        }
      />

      {error && <p className="rounded-lg bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-400">{error}</p>}

      {missing.length > 0 && (
        <Card className="flex items-start gap-3 border-amber-500/30 bg-amber-500/[0.05] p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="text-xs">
            <p className="font-bold">Vera needs these before she advises on money</p>
            <p className="mt-0.5 text-muted-foreground">
              {missing.join(" · ")}. She still analyses the account without them, and asks for them in chat when a decision depends on one.
            </p>
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <p className="text-xs font-bold">
            Knowledge base{" "}
            <span className="font-normal text-muted-foreground">
              · {filled} of {total} fields filled{suggestions ? ` · ${suggestions} suggestion${suggestions > 1 ? "s" : ""} to confirm` : ""}
            </span>
          </p>
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-gradient-to-r from-[#400095] to-[#F76D01]" style={{ width: `${(filled / total) * 100}%` }} />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {sections.map((s) => (
            <Pill key={s.id} tone={s.filled === s.total ? "good" : "neutral"}>
              {s.filled === s.total ? "✓ " : ""}
              {s.label} {s.filled}/{s.total}
            </Pill>
          ))}
        </div>
        {!canEdit && <p className="mt-2.5 text-[11px] text-muted-foreground">Only workspace owners and admins can change the profile.</p>}
      </Card>

      <div>
        <div className="space-y-4">
          {SECTIONS.map((s) => {
            const Icon = ICONS[s.id];
            const fields = FIELD_KEYS.filter((f) => fieldDef(f).section === s.id);
            return (
              <Card key={s.id} className="p-5">
                <div className="mb-3 flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#400095]/10 text-[#400095] dark:bg-violet-500/15 dark:text-violet-300">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <p className="text-sm font-bold leading-tight">{s.label}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{s.hint}</p>
                  </div>
                </div>
                <div className={cn("grid gap-3", s.id !== "brand" && "sm:grid-cols-2")}>
                  {fields.map((f) => (
                    <div key={f} className={cn(["longtext", "competitors", "palette"].includes(fieldDef(f).kind) && "sm:col-span-2")}>
                      <FieldRow field={f} data={profile} canEdit={canEdit} currency={currency} onSave={saveField} />
                    </div>
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

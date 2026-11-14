"use client";

// Live mode: the workspace's business profile, shared by every agent, as one
// fixed document: the same numbered headings for every business, filled by Vera
// from the owner's answers, files and her own research. Owners and admins edit it
// here or tell Vera in chat; what Vera finds herself shows as a suggestion to confirm.

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Bot, Building2, CalendarDays, Check, ExternalLink, FileText, Globe2, History, Info, ListChecks, Loader2, Palette, Paperclip, Pencil, RefreshCw, ShieldBan, ShoppingBag, Sparkles, Swords, Tag, Truck, Wallet, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DOC_FIELDS,
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
import { Markdown } from "@/components/store-agent/markdown";
import { runAgentTurn } from "@/lib/google-ads/agent-runner";
import { useGoogleAds } from "@/lib/google-ads/store";
import { ACCENT_BTN, Card, Pill, SelectBox, ViewHeader } from "../ga-ui";
import { RowsSkeleton } from "../ga-skeleton";

type Loaded = { profile: BusinessProfileData; canEdit: boolean; currency: string | null };

const ICONS: Record<ProfileSection, typeof Building2> = {
  facts: Info,
  overview: Building2,
  names: Tag,
  markets: Globe2,
  economics: Wallet,
  catalog: ShoppingBag,
  positioning: Sparkles,
  offers: Truck,
  competitors: Swords,
  seasonality: CalendarDays,
  guardrails: ShieldBan,
  brand: Palette,
  history: History,
  sources: Paperclip,
  questions: ListChecks,
};
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
  if (kind === "longtext") return <Markdown text={String(value)} className="text-[13px] leading-relaxed" />;
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
    <div className={cn("rounded-r-lg border-s-2 py-1.5 ps-3.5 pe-2", suggested ? "border-amber-500 bg-amber-500/[0.05]" : missingRequired ? "border-dashed border-amber-500/60" : "border-border/70 hover:border-[#400095]/50")}>
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
              rows={d.kind === "longtext" ? 9 : 5}
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
          <RowsSkeleton rows={6} />
        )}
      </div>
    );
  }

  const { profile, canEdit } = data;
  const currency = data.currency ?? "";
  const { sections, filled, total, missing } = completeness(profile.values);
  const suggestionsIn = (id: ProfileSection) => DOC_FIELDS.filter((f) => fieldDef(f).section === id && profile.values[f] != null && profile.meta[f]?.status === "suggested");
  const suggestions = DOC_FIELDS.filter((f) => profile.values[f] != null && profile.meta[f]?.status === "suggested").length;
  const title = typeof profile.values.businessName === "string" ? profile.values.businessName : "Your business";

  const confirmAll = async (fields: ProfileField[]) => {
    await api({ method: "PATCH", body: JSON.stringify({ workspaceId, edits: fields.map((field) => ({ field, value: profile.values[field] })) }) });
    await load();
  };

  return (
    <div className="space-y-4">
      <ViewHeader
        title="Business profile"
        subtitle="One document every Autommerce agent reads before it plans, reports or changes anything. The headings are the same for every business; Vera fills them from your answers, your files and her research. Edit any part here, or just tell Vera in chat."
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
                  "Update my business profile document: re-read my website and my files, research anything that is missing, and fill the empty sections as suggestions. Ask me only for what you cannot find; never ask again about values already saved."
                )
              }
              className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold", ACCENT_BTN)}
            >
              <Bot className="h-3.5 w-3.5" /> Ask Vera to update it
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

      <div className="grid items-start gap-5 lg:grid-cols-[210px_minmax(0,1fr)]">
        {/* Contents: the fixed headings, with what is filled. */}
        <nav aria-label="Document sections" className="sticky top-2 hidden rounded-2xl border border-border/60 bg-card p-3 lg:block">
          <p className="mb-2 px-2 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground">Contents</p>
          <ol className="space-y-0.5">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#profile-${s.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] font-medium hover:bg-muted">
                  <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-black", s.filled === s.total ? "bg-emerald-500 text-white" : s.filled ? "bg-[#400095]/15 text-[#400095] dark:text-violet-300" : "bg-muted text-muted-foreground")}>
                    {s.filled === s.total ? <Check className="h-2.5 w-2.5" /> : i}
                  </span>
                  <span className="truncate">{s.label}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* The document. */}
        <article className="min-w-0 rounded-2xl border border-border/60 bg-card shadow-sm">
          <header className="border-b border-border/60 px-6 py-5">
            <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#400095] dark:text-violet-300">
              <FileText className="h-3.5 w-3.5" /> Business knowledge base
            </p>
            <h2 className="mt-1 text-2xl font-black tracking-tight">{title}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#400095] to-[#F76D01]" style={{ width: `${(filled / total) * 100}%` }} />
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {filled} of {total} fields filled{suggestions ? ` · ${suggestions} suggestion${suggestions > 1 ? "s" : ""} to confirm` : ""}
                </span>
              </div>
              {!canEdit && <span className="text-[11px] text-muted-foreground">Only workspace owners and admins can change this document.</span>}
            </div>
          </header>

          <div className="divide-y divide-border/60">
            {SECTIONS.map((s, i) => {
              const Icon = ICONS[s.id];
              const fields = DOC_FIELDS.filter((f) => fieldDef(f).section === s.id);
              const suggested = suggestionsIn(s.id);
              const filledHere = fields.filter((f) => profile.values[f] != null).length;
              return (
                <section key={s.id} id={`profile-${s.id}`} className="scroll-mt-4 px-6 py-5">
                  <div className="mb-3 flex flex-wrap items-start gap-2.5">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#400095]/10 text-[#400095] dark:bg-violet-500/15 dark:text-violet-300">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-base font-black leading-tight tracking-tight">
                        <span className="me-1.5 text-muted-foreground">{i}</span>
                        {s.label}
                      </h3>
                      <p className="mt-0.5 text-[11.5px] text-muted-foreground">{s.hint}</p>
                    </div>
                    {suggested.length > 0 ? (
                      <div className="flex items-center gap-2">
                        <Pill tone="warn">{suggested.length} suggested by Vera</Pill>
                        {canEdit && (
                          <button type="button" onClick={() => void confirmAll(suggested)} className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700">
                            <Check className="h-3 w-3" /> Confirm section
                          </button>
                        )}
                      </div>
                    ) : filledHere === 0 ? (
                      <Pill tone="neutral">Empty</Pill>
                    ) : (
                      <Pill tone="good">Confirmed</Pill>
                    )}
                  </div>
                  <div className="space-y-3">
                    {fields.map((f) => (
                      <FieldRow key={f} field={f} data={profile} canEdit={canEdit} currency={currency} onSave={saveField} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </article>
      </div>
    </div>
  );
}

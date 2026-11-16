"use client";

// Live mode: the workspace's business profile, shared by every agent, as one
// document. The headings are fixed (the same for every business); under each is
// text anyone can edit like a document (Markdown), and Vera writes into the same
// text from the owner's answers, files and her research. A few values the platform
// reads as data (countries, goal, margin, target ROAS, budget cap, competitors...)
// sit in small blocks under their heading. Every save is kept in the version history.

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Bold, Bot, Check, ChevronDown, ExternalLink, FileText, Heading3, History, Italic, Link2, List, ListOrdered, Loader2, Pencil, RefreshCw, RotateCcw, Trash2, Upload, X } from "lucide-react";
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
  type ProfileField,
  type ProfileSection,
  type ProfileSource,
  type ProfileValue,
} from "@/lib/business-profile";
import { DOC_MAX_BYTES, docBytes, parseDocument } from "@/lib/business-profile-doc";
import { BUSINESS_FILE_KINDS, BUSINESS_FILE_KIND_IDS, MAX_BUSINESS_FILE_BYTES, businessFileProblem, type BusinessFile, type BusinessFileKind } from "@/lib/business-files";
import { Markdown } from "@/components/store-agent/markdown";
import { runAgentTurn } from "@/lib/google-ads/agent-runner";
import { useGoogleAds } from "@/lib/google-ads/store";
import { ACCENT_BTN, Card, Pill, SelectBox, ViewHeader } from "../ga-ui";
import { RowsSkeleton } from "../ga-skeleton";

type Loaded = { profile: BusinessProfileData; canEdit: boolean; currency: string | null };
type Version = { id: string; source: ProfileSource; createdAt: string; changed: string[] };

const SOURCE_LABEL: Record<ProfileSource, string> = {
  owner: "You",
  chat: "Vera, from what you said",
  website: "Vera, from your website and research",
  google_ads: "Vera, from your Google Ads account",
  merchant: "Vera, from Merchant Center",
  store: "Vera, from your store",
};
const REQUIRED_FIELDS = new Set<ProfileField>(REQUIRED.flat());

async function api<T>(init: RequestInit & { query?: Record<string, string>; path?: string }): Promise<T> {
  const qs = init.query ? `?${new URLSearchParams(init.query)}` : "";
  const res = await fetch(`/api/business-profile${init.path ?? ""}${qs}`, { ...init, headers: { "Content-Type": "application/json" }, cache: "no-store" });
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
    default:
      return text;
  }
}

const PLACEHOLDER: Partial<Record<ProfileField, string>> = {
  website: "https://yourstore.com",
  margin: "40",
  targetRoas: "4",
  brandTerms: "One per line, e.g.\nKalema\nكلمة",
  markets: "One country per line (the first is used for competitor lookups)",
  competitors: "One per line: Name | https://their-site.com",
  neverAdvertise: "One per line",
};

function ValueView({ field, value, currency }: { field: ProfileField; value: ProfileValue | undefined; currency: string }) {
  if (value == null) return <span className="text-xs italic text-muted-foreground">Not filled yet</span>;
  const kind = fieldDef(field).kind;
  if (kind === "list")
    return (
      <span className="flex flex-wrap gap-1.5">
        {(value as string[]).map((i) => (
          <Pill key={i} tone={field === "neverAdvertise" ? "bad" : field === "markets" ? "brand" : "neutral"}>
            {i}
          </Pill>
        ))}
      </span>
    );
  if (kind === "url") {
    const url = safeUrl(String(value));
    return url ? (
      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-[#400095] hover:underline dark:text-violet-300">
        {hostOf(url)} <ExternalLink className="h-3 w-3" />
      </a>
    ) : (
      <span className="text-xs">{String(value)}</span>
    );
  }
  if (kind === "competitors")
    return (
      <span className="flex flex-wrap gap-1.5">
        {(value as Competitor[]).map((c) => {
          const url = safeUrl(c.url);
          return url ? (
            <a key={c.name} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold hover:underline">
              {c.name === hostOf(url) ? c.name : `${c.name} · ${hostOf(url)}`} <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <Pill key={c.name}>{c.name}</Pill>
          );
        })}
      </span>
    );
  if (kind === "percent" || kind === "ratio" || kind === "money")
    return (
      <span className="text-sm font-black">
        {formatValue(field, value, currency).replace(/ \(\d+%\)$/, "")}
        {field === "margin" && <span className="ml-2 text-[11px] font-normal text-muted-foreground">break-even ROAS {(1 / Number(value)).toFixed(2)}×</span>}
      </span>
    );
  return <span className="text-xs">{formatValue(field, value, currency)}</span>;
}

/** One data field the platform reads as a value: a label, the value, and an inline editor. */
function DataRow({
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

  const multiline = d.kind === "list" || d.kind === "competitors";
  const numeric = d.kind === "percent" || d.kind === "ratio" || d.kind === "money";
  const inputCls = "w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

  return (
    <div className={cn("rounded-r-lg border-s-2 py-1 ps-3 pe-1", suggested ? "border-amber-500 bg-amber-500/[0.05]" : missingRequired ? "border-dashed border-amber-500/60" : "border-border/70")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="w-44 shrink-0 text-[11px] font-bold text-muted-foreground">
          {d.label}
          {REQUIRED_FIELDS.has(field) && <span className="ml-1 text-amber-600" title="Required before money decisions">*</span>}
        </span>
        {draft === null ? (
          <>
            <span className="min-w-0 flex-1">
              <ValueView field={field} value={value} currency={currency} />
            </span>
            {suggested && <Pill tone="warn">Suggested from {meta!.source.replace("_", " ")}</Pill>}
            {canEdit && suggested && (
              <>
                <button type="button" disabled={busy} onClick={() => void save(value)} className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                  <Check className="h-3 w-3" /> Confirm
                </button>
                <button type="button" disabled={busy} onClick={() => void save(null)} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-semibold hover:bg-muted disabled:opacity-60">
                  <X className="h-3 w-3" /> Discard
                </button>
              </>
            )}
            {canEdit && (
              <button type="button" onClick={() => setDraft(toDraft(field, value))} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Edit ${d.label}`}>
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        ) : (
          <div className="min-w-0 flex-1 space-y-2">
            {d.kind === "choice" ? (
              <SelectBox value={draft} onChange={setDraft} options={[{ value: "", label: "Choose…" }, ...(d.choices ?? []).map((c) => ({ value: c.value, label: c.label }))]} />
            ) : multiline ? (
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={5} placeholder={PLACEHOLDER[field] ?? "One per line"} className={cn(inputCls, "resize-y py-2")} autoFocus />
            ) : (
              <div className="relative">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void save(fromDraft(field, draft))}
                  inputMode={numeric ? "decimal" : undefined}
                  placeholder={PLACEHOLDER[field] ?? ""}
                  className={cn(inputCls, "h-9", numeric && "pr-14")}
                  autoFocus
                />
                {numeric && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{d.kind === "percent" ? "%" : d.kind === "ratio" ? "×" : currency}</span>}
              </div>
            )}
            {d.hint && <p className="text-[11px] text-muted-foreground">{d.hint}</p>}
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
    </div>
  );
}

/** A section's text: read like a document; click it (or Edit) and it becomes a Markdown editor. */
function SectionText({ section, text, canEdit, onSave }: { section: ProfileSection; text: string; canEdit: boolean; onSave: (section: ProfileSection, markdown: string) => Promise<void> }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const guide = SECTIONS.find((s) => s.id === section)?.guide ?? "";

  // The editor grows with its text, like a page.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(160, el.scrollHeight + 4)}px`;
  }, [draft]);

  const edit = (apply: (value: string, from: number, to: number) => { value: string; from: number; to: number }) => {
    const el = area.current;
    if (!el || draft === null) return;
    const next = apply(draft, el.selectionStart, el.selectionEnd);
    setDraft(next.value);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.from, next.to);
    });
  };
  const wrap = (before: string, after = before, fallback = "text") =>
    edit((v, a, b) => {
      const picked = v.slice(a, b) || fallback;
      return { value: `${v.slice(0, a)}${before}${picked}${after}${v.slice(b)}`, from: a + before.length, to: a + before.length + picked.length };
    });
  const prefix = (mark: (i: number) => string) =>
    edit((v, a, b) => {
      const start = v.lastIndexOf("\n", a - 1) + 1;
      const block = v.slice(start, b) || "item";
      const lines = block.split("\n").map((l, i) => `${mark(i)}${l.replace(/^(\s*([-*]|\d+\.)\s+|#{1,6}\s+)/, "")}`);
      return { value: `${v.slice(0, start)}${lines.join("\n")}${v.slice(b)}`, from: start, to: start + lines.join("\n").length };
    });

  const save = async () => {
    if (draft === null) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(section, draft);
      setDraft(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (draft === null) {
    return (
      <div className="group relative">
        {text ? (
          <div className={cn("rounded-lg", canEdit && "cursor-text hover:bg-muted/40")} onClick={canEdit ? () => setDraft(text) : undefined}>
            <Markdown text={text} className="text-[13.5px] leading-relaxed" />
          </div>
        ) : (
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setDraft("")}
            className={cn("w-full rounded-lg border border-dashed border-border/80 px-3 py-3 text-start text-xs text-muted-foreground", canEdit && "hover:border-[#400095]/40 hover:bg-muted/40")}
          >
            Empty. {canEdit ? "Click to write here, or ask Vera to fill it." : ""} <span className="opacity-70">{guide}</span>
          </button>
        )}
        {text && canEdit && (
          <button type="button" onClick={() => setDraft(text)} className="absolute right-1 top-1 hidden items-center gap-1 rounded-md border border-border/70 bg-background px-2 py-1 text-[11px] font-semibold text-muted-foreground shadow-sm hover:text-foreground group-hover:inline-flex">
            <Pencil className="h-3 w-3" /> Edit
          </button>
        )}
      </div>
    );
  }

  const btn = "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground";
  return (
    <div className="rounded-xl border border-[#400095]/30 bg-background shadow-sm">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border/60 px-2 py-1.5">
        <button type="button" className={btn} onClick={() => wrap("**")} title="Bold" aria-label="Bold">
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button type="button" className={btn} onClick={() => wrap("_")} title="Italic" aria-label="Italic">
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button type="button" className={btn} onClick={() => prefix(() => "### ")} title="Heading" aria-label="Heading">
          <Heading3 className="h-3.5 w-3.5" />
        </button>
        <button type="button" className={btn} onClick={() => prefix(() => "- ")} title="Bullet list" aria-label="Bullet list">
          <List className="h-3.5 w-3.5" />
        </button>
        <button type="button" className={btn} onClick={() => prefix((i) => `${i + 1}. `)} title="Numbered list" aria-label="Numbered list">
          <ListOrdered className="h-3.5 w-3.5" />
        </button>
        <button type="button" className={btn} onClick={() => wrap("[", "](https://)", "link text")} title="Link" aria-label="Link">
          <Link2 className="h-3.5 w-3.5" />
        </button>
        <span className="ms-auto pe-1 text-[10px] text-muted-foreground">Markdown · {draft.length.toLocaleString()} characters</span>
      </div>
      <textarea
        ref={area}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        dir="auto"
        autoFocus
        placeholder={guide}
        className="block w-full resize-none bg-transparent px-4 py-3 font-mono text-[13px] leading-relaxed outline-none"
      />
      {error && <p className="px-4 pb-2 text-[11px] text-red-600">{error}</p>}
      <div className="flex items-center gap-2 border-t border-border/60 px-3 py-2">
        <button type="button" disabled={busy} onClick={() => void save()} className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold", ACCENT_BTN)}>
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save
        </button>
        <button type="button" disabled={busy} onClick={() => (setDraft(null), setError(null))} className="rounded-md px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted">
          Cancel
        </button>
        <span className="ms-auto text-[10px] text-muted-foreground">Saved to the version history</span>
      </div>
    </div>
  );
}

const fileSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * The files that describe the business (logo, brand guide, catalogue...), kept for
 * the whole workspace and linked in the document. Vera keeps the ones you upload
 * in the chat when they are about the business; owners and admins can also add
 * or delete files here.
 */
function BusinessFiles({ workspaceId, canEdit, refreshKey, onChanged }: { workspaceId: string; canEdit: boolean; refreshKey: string | null; onChanged: () => Promise<void> }) {
  const [files, setFiles] = useState<BusinessFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<BusinessFileKind>("logo");
  const [description, setDescription] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const read = useCallback(async () => {
    const res = await fetch(`/api/business-profile/files?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" });
    if (!res.ok) throw new Error("Couldn't load the business files.");
    setFiles(((await res.json()) as { files: BusinessFile[] }).files);
  }, [workspaceId]);

  // Vera may keep a file from the chat at any moment: read the list again whenever the document changes.
  useEffect(() => {
    read().then(() => setError(null)).catch((e: Error) => setError(e.message));
  }, [read, refreshKey]);

  const upload = async (file: File) => {
    const problem = businessFileProblem(file.name, file.size);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("workspaceId", workspaceId);
      form.set("kind", kind);
      form.set("description", description);
      form.set("file", file);
      const res = await fetch("/api/business-profile/files", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { files?: BusinessFile[]; message?: string; error?: string };
      if (!res.ok) throw new Error(body.message ?? (body.error === "forbidden" ? "Only workspace owners and admins can add files." : "The file wasn't kept. Try again."));
      setDescription("");
      if (input.current) input.current.value = "";
      await read();
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (name: string) => {
    if (!window.confirm(`Delete ${name}? Its lines leave the document too. You can restore the document from the version history, but not the file.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/business-profile/files", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, name }) });
      if (!res.ok) throw new Error("The file wasn't deleted. Try again.");
      await read();
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <FileText className="h-3.5 w-3.5" /> Business files
        </p>
        <span className="text-[11px] text-muted-foreground">Logo, brand guide, catalogue, strategy, policies. Every agent can open them, and they are linked in the document. Files you send Vera in the chat are kept here when they are about the business.</span>
      </div>
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
      {files === null ? (
        <RowsSkeleton rows={2} />
      ) : files.length === 0 ? (
        <p className="text-xs text-muted-foreground">No files kept yet.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {files.map((f) => (
            <li key={f.name} className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/20 p-2.5">
              {f.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.link} alt={f.name} className="h-11 w-11 shrink-0 rounded-lg border border-border/60 bg-white object-contain" />
              ) : (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#400095]/10 text-[#400095] dark:text-violet-300">
                  <FileText className="h-5 w-5" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <a href={f.link} target="_blank" rel="noreferrer" className="block truncate text-[12.5px] font-semibold hover:underline" title={f.name}>
                  {f.name}
                </a>
                <p className="text-[11px] text-muted-foreground">
                  {fileSize(f.size)} · {ago(f.updatedAt)}
                </p>
              </div>
              {canEdit && (
                <button type="button" disabled={busy} onClick={() => void remove(f.name)} aria-label={`Delete ${f.name}`} className="rounded-md p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-600 disabled:opacity-60">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
          <select value={kind} onChange={(e) => setKind(e.target.value as BusinessFileKind)} disabled={busy} className="h-8 rounded-lg border border-border/70 bg-background px-2 text-xs font-semibold">
            {BUSINESS_FILE_KIND_IDS.map((k) => (
              <option key={k} value={k}>
                {BUSINESS_FILE_KINDS[k].label}
              </option>
            ))}
          </select>
          <input value={description} onChange={(e) => setDescription(e.target.value)} disabled={busy} maxLength={300} placeholder="What is it? (optional)" className="h-8 min-w-[12rem] flex-1 rounded-lg border border-border/70 bg-background px-2.5 text-xs" />
          <input ref={input} type="file" hidden onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold disabled:opacity-60", ACCENT_BTN)}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Upload file
          </button>
          <span className="text-[11px] text-muted-foreground">Up to {MAX_BUSINESS_FILE_BYTES / 1024 / 1024} MB.</span>
        </div>
      )}
    </Card>
  );
}

/** Earlier versions of the document: who changed which sections, with a way back. */
function VersionHistory({ workspaceId, canEdit, onRestored }: { workspaceId: string; canEdit: boolean; onRestored: () => Promise<void> }) {
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [shown, setShown] = useState<{ id: string; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    api<{ versions: Version[] }>({ path: "/history", query: { workspaceId } })
      .then((d) => alive && setVersions(d.versions))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [workspaceId]);

  const view = async (id: string) => {
    if (shown?.id === id) return setShown(null);
    setBusy(id);
    try {
      const d = await api<{ document: string }>({ path: "/history", query: { workspaceId, id } });
      setShown({ id, text: d.document });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  const restore = async (id: string) => {
    if (!window.confirm("Restore this version of the document? The current text is kept in the history, so you can come back to it.")) return;
    setBusy(id);
    try {
      await api({ method: "PATCH", body: JSON.stringify({ workspaceId, restoreVersion: id }) });
      await onRestored();
      setShown(null);
      setVersions((await api<{ versions: Version[] }>({ path: "/history", query: { workspaceId } })).versions);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="p-4">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <History className="h-3.5 w-3.5" /> Version history
      </p>
      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
      {versions === null ? (
        <RowsSkeleton rows={2} />
      ) : versions.length === 0 ? (
        <p className="text-xs text-muted-foreground">No saved versions yet. Every edit by you or Vera is kept here.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {versions.map((v, i) => (
            <li key={v.id} className="py-2 text-[12.5px]">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="font-semibold">{SOURCE_LABEL[v.source] ?? v.source}</span>
                <span className="text-muted-foreground">{ago(v.createdAt)}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{v.changed.length ? `Changed: ${v.changed.join(", ")}` : "Formatting only"}</span>
                <button type="button" disabled={busy === v.id} onClick={() => void view(v.id)} className="rounded-md px-2 py-1 text-xs font-semibold text-[#400095] hover:bg-[#400095]/[0.07] disabled:opacity-60 dark:text-violet-300">
                  {shown?.id === v.id ? "Hide" : "View"}
                </button>
                {canEdit && i > 0 && (
                  <button type="button" disabled={busy === v.id} onClick={() => void restore(v.id)} className="inline-flex items-center gap-1 rounded-md border border-border/70 px-2 py-1 text-xs font-semibold hover:bg-muted disabled:opacity-60">
                    <RotateCcw className="h-3 w-3" /> Restore
                  </button>
                )}
              </div>
              {shown?.id === v.id && (
                <div className="mt-2 max-h-96 overflow-y-auto rounded-lg border border-border/60 bg-muted/20 p-4">
                  <Markdown text={shown.text} className="text-[13px]" />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function LiveProfileView() {
  const workspaceId = useGoogleAds((s) => s.workspaceId);
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState(false);

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

  // Vera writes into the document from the chat beside this page: read it again when the tab comes back and every 20 s.
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
  const saveSection = useCallback(
    async (section: ProfileSection, markdown: string) => {
      await api({ method: "PATCH", body: JSON.stringify({ workspaceId, section, markdown }) });
      await load();
    },
    [workspaceId, load]
  );

  if (!data) {
    return (
      <div className="space-y-4">
        <ViewHeader title="Business profile" />
        {error ? <p className="rounded-lg bg-red-500/10 p-3 text-xs text-red-700 dark:text-red-400">{error}</p> : <RowsSkeleton rows={6} />}
      </div>
    );
  }

  const { profile, canEdit } = data;
  const currency = data.currency ?? "";
  const docText = typeof profile.values.document === "string" ? profile.values.document : "";
  const texts = parseDocument(docText);
  const { sections, filled, total, missing } = completeness(profile.values);
  const suggestedFields = DOC_FIELDS.filter((f) => profile.values[f] != null && profile.meta[f]?.status === "suggested");
  const title = typeof profile.values.businessName === "string" ? profile.values.businessName : "Your business";
  const used = docBytes(docText);

  return (
    <div className="space-y-4">
      <ViewHeader
        title="Business profile"
        subtitle="One document every Autommerce agent reads before it plans, reports or changes anything. The headings are the same for every business. Click any text to edit it, or ask Vera to add to a section."
        actions={
          <>
            <span className="text-[11px] text-muted-foreground">Updated {ago(profile.updatedAt)}</span>
            <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 px-3 text-xs font-semibold hover:bg-muted disabled:opacity-60">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
            </button>
            <button type="button" onClick={() => setHistory((v) => !v)} className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold hover:bg-muted", history ? "border-[#400095]/40 bg-[#400095]/[0.06]" : "border-border/70")}>
              <History className="h-3.5 w-3.5" /> History <ChevronDown className={cn("h-3 w-3 transition-transform", history && "rotate-180")} />
            </button>
            <button
              type="button"
              onClick={() =>
                runAgentTurn(
                  "Update my business profile document: re-read my website and my files, research anything that is missing, and write it into the right sections. Ask me only for what you cannot find; never ask again about what is already written."
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

      {history && workspaceId && <VersionHistory workspaceId={workspaceId} canEdit={canEdit} onRestored={load} />}

      {workspaceId && <BusinessFiles workspaceId={workspaceId} canEdit={canEdit} refreshKey={profile.updatedAt} onChanged={load} />}

      {missing.length > 0 && (
        <Card className="flex items-start gap-3 border-amber-500/30 bg-amber-500/[0.05] p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="text-xs">
            <p className="font-bold">Vera needs these before she advises on money</p>
            <p className="mt-0.5 text-muted-foreground">{missing.join(" · ")}. She still analyses the account without them, and asks for them in chat when a decision depends on one.</p>
          </div>
        </Card>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[210px_minmax(0,1fr)]">
        {/* Contents: the fixed headings, with what is written. */}
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
          <header className="border-b border-border/60 px-7 py-6">
            <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#400095] dark:text-violet-300">
              <FileText className="h-3.5 w-3.5" /> Business knowledge base
            </p>
            <h2 className="mt-1 text-3xl font-black tracking-tight">{title}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#400095] to-[#F76D01]" style={{ width: `${(filled / total) * 100}%` }} />
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {sections.filter((s) => texts[s.id]).length} of {SECTIONS.length} sections written · {Math.round(used / 1000)} of {Math.round(DOC_MAX_BYTES / 1000)} KB
                  {suggestedFields.length ? ` · ${suggestedFields.length} suggested value${suggestedFields.length > 1 ? "s" : ""} to confirm` : ""}
                </span>
              </div>
              {!canEdit && <span className="text-[11px] text-muted-foreground">Only workspace owners and admins can change this document.</span>}
            </div>
          </header>

          <div className="divide-y divide-border/60">
            {SECTIONS.map((s, i) => {
              const fields = DOC_FIELDS.filter((f) => fieldDef(f).section === s.id);
              return (
                <section key={s.id} id={`profile-${s.id}`} className="scroll-mt-4 px-7 py-6">
                  <h3 className="text-xl font-black leading-tight tracking-tight">
                    <span className="me-2 text-muted-foreground/70">{i}</span>
                    {s.label}
                  </h3>
                  <p className="mb-3 mt-0.5 text-[11.5px] text-muted-foreground">{s.hint}</p>
                  {fields.length > 0 && (
                    <div className="mb-4 space-y-1.5 rounded-xl bg-muted/30 p-3">
                      {fields.map((f) => (
                        <DataRow key={f} field={f} data={profile} canEdit={canEdit} currency={currency} onSave={saveField} />
                      ))}
                    </div>
                  )}
                  <SectionText section={s.id} text={texts[s.id]} canEdit={canEdit} onSave={saveSection} />
                </section>
              );
            })}
          </div>
        </article>
      </div>
    </div>
  );
}

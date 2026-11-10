"use client";

// First run, live accounts: before Vera's workspace opens, the owner tells her
// what only they know (goal, margin or target ROAS, budget cap) and confirms
// what Google already tells us (name, website, countries). Three short steps,
// saved as they go; "Skip for now" never blocks anyone.

import { useEffect, useId, useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Globe2, Loader2, Megaphone, Rocket, ShieldBan, ShoppingBag, Sparkles, Target, TrendingUp, UserPlus, Wallet, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizeValue, type ProfileField, type ProfileValues } from "@/lib/business-profile";
import type { SetupPrefill } from "@/lib/business-profile-setup.server";

type Loaded = { prefill: SetupPrefill; values: ProfileValues };
type Source = "google_ads" | "merchant";

const STEPS = [
  { id: "business", title: "Your business", hint: "Who you are and where you sell" },
  { id: "numbers", title: "Your numbers", hint: "What counts as a good result" },
  { id: "brand", title: "Brand & guardrails", hint: "Optional, but it helps" },
] as const;

const GOALS = [
  { value: "profit", icon: TrendingUp, title: "Profit", body: "The most sales value for every 1 spent. Vera judges campaigns by return on ad spend." },
  { value: "growth", icon: Rocket, title: "Growth", body: "More sales, even if each one costs a little more. Vera looks for room to scale." },
  { value: "new_customers", icon: UserPlus, title: "New customers", body: "Reach people who haven't bought yet. Vera favours prospecting over brand and remarketing." },
] as const;

const fmt = (n: number, currency: string) => `${n.toLocaleString("en", { maximumFractionDigits: n < 100 ? 2 : 0 })}${currency ? ` ${currency}` : ""}`;
const hostOf = (u: string) => u.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/.*$/, "");

/** The value as the server would store it, or the reason it would refuse it. */
function check(field: ProfileField, raw: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: normalizeValue(field, raw) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { "Content-Type": "application/json" }, cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!res.ok) throw new Error(body.message ?? (body.error === "network" ? "Couldn't reach the server. Try again." : "Something went wrong. Try again."));
  return body as T;
}

function SourceTag({ source }: { source?: Source }) {
  if (!source) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
      {source === "merchant" ? <ShoppingBag className="h-3 w-3" /> : <Megaphone className="h-3 w-3" />}
      From {source === "merchant" ? "Merchant Center" : "Google Ads"}
    </span>
  );
}

function Label({ children, required, tag }: { children: ReactNode; required?: boolean; tag?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center justify-between gap-2">
      <span className="text-[13px] font-semibold">
        {children}
        {required && <span className="ml-0.5 text-[#F76D01]">*</span>}
      </span>
      {tag}
    </div>
  );
}

const INPUT =
  "h-11 w-full rounded-xl border border-input bg-background px-3.5 text-sm outline-none transition-shadow focus-visible:border-[#400095]/50 focus-visible:ring-[3px] focus-visible:ring-[#400095]/15 dark:bg-input/30";

function Help({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "error" | "warn" }) {
  return (
    <p className={cn("mt-1.5 text-[12px] leading-relaxed", tone === "error" ? "text-red-600" : tone === "warn" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
      {children}
    </p>
  );
}

/** Every country's English name, for the countries field's suggestions. */
export function countryNames(): string[] {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const out: string[] = [];
  for (let a = 65; a <= 90; a++)
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      const name = names.of(code);
      if (name && name !== code && !/unknown/i.test(name)) out.push(name);
    }
  return [...new Set(out)].sort();
}

/** A list typed as chips: Enter or comma adds, × removes. */
export function ChipsInput({
  value,
  onChange,
  placeholder,
  tone = "brand",
  options,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  tone?: "brand" | "bad";
  /** Suggestions shown while typing; picking one adds it. */
  options?: string[];
}) {
  const listId = useId();
  const [draft, setDraft] = useState("");
  const add = () => {
    const items = draft.split(/[,،\n]/).map((s) => s.trim()).filter(Boolean);
    if (items.length) onChange([...value, ...items.filter((i) => !value.some((v) => v.toLowerCase() === i.toLowerCase()))]);
    setDraft("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add();
    } else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
  };
  return (
    <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-xl border border-input bg-background px-2 py-1.5 focus-within:border-[#400095]/50 focus-within:ring-[3px] focus-within:ring-[#400095]/15 dark:bg-input/30">
      {value.map((v) => (
        <span
          key={v}
          className={cn(
            "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold",
            tone === "bad" ? "bg-red-500/10 text-red-700 dark:text-red-400" : "bg-[#400095]/10 text-[#400095] dark:bg-violet-500/15 dark:text-violet-300"
          )}
        >
          {v}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} className="rounded hover:bg-black/10" aria-label={`Remove ${v}`}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => {
          const next = e.target.value;
          // Picking a suggestion adds it at once.
          if (options?.includes(next) && !value.includes(next)) {
            onChange([...value, next]);
            setDraft("");
          } else setDraft(next);
        }}
        onKeyDown={onKey}
        onBlur={add}
        list={options ? listId : undefined}
        placeholder={value.length ? "Add more…" : placeholder}
        className="h-7 min-w-32 flex-1 bg-transparent px-1 text-sm outline-none"
      />
      {options && (
        <datalist id={listId}>
          {options.filter((o) => !value.includes(o)).map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
    </div>
  );
}

function NumberInput({ value, onChange, suffix, placeholder }: { value: string; onChange: (v: string) => void; suffix: string; placeholder: string }) {
  return (
    <div className="relative">
      <input value={value} onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder={placeholder} className={cn(INPUT, "pr-16 text-base font-semibold tabular-nums")} />
      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">{suffix}</span>
    </div>
  );
}

/** A number read straight from the account, shown next to the question it helps answer. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-background/70 px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-black tabular-nums">{value}</p>
    </div>
  );
}

export function ProfileSetup({ workspaceId, onDone }: { workspaceId: string; onDone: (opts: { fillFromWebsite: boolean }) => void }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  const [businessName, setBusinessName] = useState("");
  const [website, setWebsite] = useState("");
  const [markets, setMarkets] = useState<string[]>([]);
  const [goal, setGoal] = useState("");
  const [judgeBy, setJudgeBy] = useState<"margin" | "roas">("margin");
  const [margin, setMargin] = useState("");
  const [roas, setRoas] = useState("");
  /** A target ROAS saved earlier comes first for Vera; switching to the margin asks whether to remove it. */
  const [dropOldRoas, setDropOldRoas] = useState(false);
  const [cap, setCap] = useState("");
  const [brandTerms, setBrandTerms] = useState<string[]>([]);
  const [neverAdvertise, setNeverAdvertise] = useState<string[]>([]);
  const [fillFromWebsite, setFillFromWebsite] = useState(true);
  const countries = useMemo(countryNames, []);

  useEffect(() => {
    let alive = true;
    call<Loaded & { show: boolean }>(`/api/business-profile/setup?${new URLSearchParams({ workspaceId, prefill: "1" })}`)
      .then((data) => {
        if (!alive) return;
        // What the owner already saved wins over what Google suggests.
        const v = data.values ?? {};
        const s = data.prefill?.suggestions ?? {};
        setLoaded({ prefill: data.prefill, values: v });
        setBusinessName(String(v.businessName ?? s.businessName ?? ""));
        setWebsite(String(v.website ?? s.website ?? ""));
        setMarkets((v.markets as string[] | undefined) ?? s.markets ?? []);
        setGoal(String(v.goal ?? ""));
        if (typeof v.margin === "number") setMargin(String(Math.round(v.margin * 1000) / 10));
        if (typeof v.targetRoas === "number") {
          setRoas(String(v.targetRoas));
          if (typeof v.margin !== "number") setJudgeBy("roas");
        }
        if (typeof v.monthlyBudgetCap === "number") setCap(String(v.monthlyBudgetCap));
        setBrandTerms((v.brandTerms as string[] | undefined) ?? s.brandTerms ?? []);
        setNeverAdvertise((v.neverAdvertise as string[] | undefined) ?? []);
      })
      .catch((e: Error) => alive && setLoadError(e.message));
    return () => {
      alive = false;
    };
  }, [workspaceId]);

  const ref = loaded?.prefill.reference;
  const currency = ref?.currency ?? "";
  const sources = loaded?.prefill.sources ?? {};
  const name = businessName.trim() || "your business";

  // Every field checked with the same rules the server applies, so errors show before saving.
  const checks = useMemo(
    () => ({
      businessName: check("businessName", businessName),
      website: check("website", website),
      margin: check("margin", margin ? `${margin}%` : ""),
      targetRoas: check("targetRoas", roas),
      monthlyBudgetCap: check("monthlyBudgetCap", cap),
    }),
    [businessName, website, margin, roas, cap]
  );
  const savedRoas = typeof loaded?.values.targetRoas === "number" ? loaded.values.targetRoas : null;
  const marginValue = checks.margin.ok && typeof checks.margin.value === "number" ? checks.margin.value : null;
  const roasValue = checks.targetRoas.ok && typeof checks.targetRoas.value === "number" ? checks.targetRoas.value : null;
  const capValue = checks.monthlyBudgetCap.ok && typeof checks.monthlyBudgetCap.value === "number" ? checks.monthlyBudgetCap.value : null;

  const missing: string[] =
    step === 0
      ? [!businessName.trim() && "business name", !(website.trim() && checks.website.ok) && "website", !markets.length && "at least one country"].filter((x): x is string => !!x)
      : step === 1
        ? [!goal && "your goal", !(judgeBy === "margin" ? marginValue : roasValue) && (judgeBy === "margin" ? "your margin" : "your target ROAS"), !capValue && "a monthly budget cap"].filter(
            (x): x is string => !!x
          )
        : [];

  const save = async (edits: { field: ProfileField; value: unknown }[]) => {
    if (!edits.length) return;
    await call("/api/business-profile", { method: "PATCH", body: JSON.stringify({ workspaceId, edits }) });
  };

  const next = async () => {
    setTried(true);
    if (missing.length) return;
    setSaving(true);
    setError(null);
    try {
      if (step === 0) {
        await save([
          { field: "businessName", value: businessName },
          { field: "website", value: website },
          { field: "markets", value: markets },
        ]);
      } else if (step === 1) {
        await save([
          { field: "goal", value: goal },
          ...(judgeBy === "margin"
            ? [{ field: "margin" as const, value: `${margin}%` }, ...(dropOldRoas && savedRoas !== null ? [{ field: "targetRoas" as const, value: null }] : [])]
            : [{ field: "targetRoas" as const, value: roas }]),
          { field: "monthlyBudgetCap", value: cap },
        ]);
      } else {
        await save([
          ...(brandTerms.length ? [{ field: "brandTerms" as const, value: brandTerms }] : []),
          ...(neverAdvertise.length ? [{ field: "neverAdvertise" as const, value: neverAdvertise }] : []),
        ]);
        const aov = loaded?.prefill.suggestions.averageOrderValue;
        await call("/api/business-profile/setup", {
          method: "POST",
          body: JSON.stringify({ workspaceId, status: "completed", suggestions: aov ? [{ field: "averageOrderValue", value: aov, source: "google_ads" }] : [] }),
        });
        onDone({ fillFromWebsite: fillFromWebsite && !!website });
        return;
      }
      setTried(false);
      setStep((s) => s + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const skip = async () => {
    setSaving(true);
    try {
      await call("/api/business-profile/setup", { method: "POST", body: JSON.stringify({ workspaceId, status: "skipped" }) });
    } catch {
      // Skipping must never trap anyone: the screen just shows again next time.
    }
    onDone({ fillFromWebsite: false });
  };

  return (
    <div className="relative min-h-[calc(100vh-48px)] overflow-hidden bg-gradient-to-br from-[#400095]/[0.06] via-background to-[#F76D01]/[0.06]">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#400095] text-lg font-black text-white shadow-[0_8px_24px_rgba(64,0,149,.3)]">V</span>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#400095] dark:text-violet-300">Set up Vera · about a minute</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-[28px]">Tell Vera about {businessName.trim() || "your business"}</h1>
              <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
                She reads this before every plan, report and change, so her advice fits your margins and your brand. We filled in what Google already knows; check it and add what only you know.
              </p>
            </div>
          </div>
          <button type="button" onClick={() => void skip()} disabled={saving} className="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60">
            Skip for now
          </button>
        </div>

        {/* Stepper */}
        <ol className="mt-8 grid grid-cols-3 gap-2">
          {STEPS.map((s, i) => (
            <li key={s.id}>
              <div className={cn("h-1.5 rounded-full transition-colors", i < step ? "bg-[#400095]" : i === step ? "bg-gradient-to-r from-[#400095] to-[#F76D01]" : "bg-muted")} />
              <div className="mt-2 flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black",
                    i < step ? "bg-[#400095] text-white" : i === step ? "bg-[#F76D01] text-white" : "bg-muted text-muted-foreground"
                  )}
                >
                  {i < step ? <Check className="h-3 w-3" /> : i + 1}
                </span>
                <div className="min-w-0">
                  <p className={cn("truncate text-xs font-bold", i > step && "text-muted-foreground")}>{s.title}</p>
                  <p className="hidden truncate text-[11px] text-muted-foreground sm:block">{s.hint}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>

        {/* Card */}
        <div className="mt-6 rounded-3xl border border-border/70 bg-background/90 p-5 shadow-[0_20px_60px_rgba(16,18,28,.08)] backdrop-blur sm:p-7">
          {!loaded && !loadError && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-[#400095]" />
              <p className="text-sm font-semibold">Reading your Google Ads account…</p>
              <p className="text-xs text-muted-foreground">Name, website, countries and last month&apos;s numbers, so you don&apos;t have to type them.</p>
            </div>
          )}
          {loadError && (
            <div className="py-10 text-center">
              <p className="text-sm font-semibold">Couldn&apos;t open the setup</p>
              <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
              <button type="button" onClick={() => onDone({ fillFromWebsite: false })} className="mt-4 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted">
                Continue to Vera
              </button>
            </div>
          )}

          {loaded && (
            <AnimatePresence mode="wait">
              <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }}>
                {step === 0 && (
                  <div className="space-y-5">
                    <div className="grid gap-5 sm:grid-cols-2">
                      <div>
                        <Label required tag={businessName === loaded.prefill.suggestions.businessName && <SourceTag source={sources.businessName} />}>
                          Business name
                        </Label>
                        <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Kalema" className={INPUT} />
                        {tried && !businessName.trim() && <Help tone="error">Enter the name customers know you by.</Help>}
                      </div>
                      <div>
                        <Label required tag={website === loaded.prefill.suggestions.website && <SourceTag source={sources.website} />}>
                          Website
                        </Label>
                        <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="yourstore.com" className={INPUT} />
                        {website.trim() && !checks.website.ok ? (
                          <Help tone="error">Enter your store&apos;s address, like yourstore.com.</Help>
                        ) : tried && !website.trim() ? (
                          <Help tone="error">Vera reads your site to write ads that match it.</Help>
                        ) : (
                          sources.website && website === loaded.prefill.suggestions.website && <Help>The site most of your ads send people to.</Help>
                        )}
                      </div>
                    </div>
                    <div>
                      <Label required tag={markets.length > 0 && markets === loaded.prefill.suggestions.markets && <SourceTag source={sources.markets} />}>
                        <Globe2 className="mr-1.5 inline h-4 w-4 text-[#400095] dark:text-violet-300" />
                        Countries you sell and ship to
                      </Label>
                      <ChipsInput value={markets} onChange={setMarkets} placeholder="Start typing a country…" options={countries} />
                      {tried && !markets.length ? (
                        <Help tone="error">Add at least one country.</Help>
                      ) : (
                        <Help>
                          {sources.markets && markets === loaded.prefill.suggestions.markets
                            ? "These are the countries your campaigns target today. Remove any you don't ship to: ads there waste money."
                            : "Vera warns you when a campaign shows ads outside these countries."}
                        </Help>
                      )}
                    </div>
                  </div>
                )}

                {step === 1 && (
                  <div className="space-y-6">
                    <div>
                      <Label required>What matters most right now?</Label>
                      <div className="grid gap-2.5 sm:grid-cols-3">
                        {GOALS.map((g) => (
                          <button
                            key={g.value}
                            type="button"
                            onClick={() => setGoal(g.value)}
                            className={cn(
                              "relative rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5",
                              goal === g.value ? "border-[#400095] bg-[#400095]/[0.05] shadow-[0_8px_24px_rgba(64,0,149,.12)] dark:border-violet-400" : "border-border/70 hover:border-[#400095]/40"
                            )}
                          >
                            {goal === g.value && (
                              <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[#400095] text-white">
                                <Check className="h-3 w-3" />
                              </span>
                            )}
                            <g.icon className="h-5 w-5 text-[#F76D01]" />
                            <p className="mt-2.5 text-sm font-bold">{g.title}</p>
                            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{g.body}</p>
                          </button>
                        ))}
                      </div>
                      {tried && !goal && <Help tone="error">Pick one. You can change it any time.</Help>}
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <div>
                        <Label required>
                          <Target className="mr-1.5 inline h-4 w-4 text-[#400095] dark:text-violet-300" />
                          How Vera judges profit
                        </Label>
                        <div className="mb-2 inline-flex rounded-lg bg-muted p-0.5 text-xs font-semibold">
                          {(["margin", "roas"] as const).map((k) => (
                            <button
                              key={k}
                              type="button"
                              onClick={() => setJudgeBy(k)}
                              className={cn("rounded-md px-3 py-1.5 transition-colors", judgeBy === k ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
                            >
                              {k === "margin" ? "I know my margin" : "I have a target ROAS"}
                            </button>
                          ))}
                        </div>
                        {judgeBy === "margin" ? (
                          <>
                            {savedRoas !== null && (
                              <label className="flex items-start gap-2 text-[12px] text-muted-foreground">
                                <input type="checkbox" checked={dropOldRoas} onChange={(e) => setDropOldRoas(e.target.checked)} className="mt-0.5" />
                                <span>
                                  Your saved target ROAS ({savedRoas}×) still comes first for Vera. Remove it so she judges by the margin.
                                </span>
                              </label>
                            )}
                            <NumberInput value={margin} onChange={setMargin} suffix="%" placeholder="40" />
                            {margin && !checks.margin.ok ? (
                              <Help tone="error">Between 1% and 95%: what&apos;s left of a sale after the product&apos;s cost, before ads.</Help>
                            ) : marginValue ? (
                              <Help>
                                Break-even ROAS: <b className="text-foreground">{(1 / marginValue).toFixed(2)}×</b>. Below it, every sale from ads loses money; Vera aims above it.
                              </Help>
                            ) : (
                              <Help>What&apos;s left of a sale after the product&apos;s cost, before ads. A rough number is fine.</Help>
                            )}
                          </>
                        ) : (
                          <>
                            {typeof loaded?.values.margin === "number" && (
                              <Help>Your saved margin ({Math.round(loaded.values.margin * 1000) / 10}%) stays in the profile; Vera judges by this target first.</Help>
                            )}
                            <NumberInput value={roas} onChange={setRoas} suffix="×" placeholder="4" />
                            {roas && !checks.targetRoas.ok ? (
                              <Help tone="error">Between 0.2 and 40 (4 means 400%).</Help>
                            ) : roasValue ? (
                              <Help>
                                For every <b className="text-foreground">1 {currency}</b> spent, Vera aims for <b className="text-foreground">{fmt(roasValue, currency)}</b> in sales.
                              </Help>
                            ) : (
                              <Help>Sales per 1 spent on ads. 4 means 400%.</Help>
                            )}
                          </>
                        )}
                        {tried && !(judgeBy === "margin" ? marginValue : roasValue) && <Help tone="error">Vera needs this to tell profitable campaigns from losing ones.</Help>}
                      </div>

                      <div>
                        <Label required>
                          <Wallet className="mr-1.5 inline h-4 w-4 text-[#400095] dark:text-violet-300" />
                          Monthly budget cap
                        </Label>
                        <div className="mb-2 h-[30px]" aria-hidden />
                        <NumberInput value={cap} onChange={setCap} suffix={currency || "/mo"} placeholder={ref?.monthlyBudgets ? String(ref.monthlyBudgets) : "1000"} />
                        {cap && !checks.monthlyBudgetCap.ok ? (
                          <Help tone="error">Enter an amount above zero.</Help>
                        ) : capValue && ref?.monthlyBudgets && capValue < ref.monthlyBudgets ? (
                          <Help tone="warn">
                            Lower than your campaigns&apos; budgets today (about {fmt(ref.monthlyBudgets, currency)} a month). Vera will suggest where to cut, and never raise.
                          </Help>
                        ) : (
                          <Help>The most you want to spend on Google Ads in a month. Vera warns you before any change that would go above it.</Help>
                        )}
                        {tried && !capValue && !cap && <Help tone="error">Vera never proposes spending above this.</Help>}
                      </div>
                    </div>

                    {/* A new or idle account has nothing worth showing (all zeros). */}
                    {ref && (!!ref.spend || !!ref.monthlyBudgets) && (
                      <div className="rounded-2xl border border-[#400095]/15 bg-[#400095]/[0.03] p-4">
                        <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold">
                          <Megaphone className="h-3.5 w-3.5 text-[#400095] dark:text-violet-300" /> Your Google Ads account, last 30 days
                        </p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <Fact label="Spent" value={ref.spend !== null ? fmt(ref.spend, currency) : "—"} />
                          <Fact label="ROAS" value={ref.roas !== null ? `${ref.roas}×` : "—"} />
                          <Fact label="Avg. order" value={ref.averageOrderValue !== null ? fmt(ref.averageOrderValue, currency) : "—"} />
                          <Fact label="Budgets / month" value={ref.monthlyBudgets !== null ? fmt(ref.monthlyBudgets, currency) : "—"} />
                        </div>
                        {marginValue && ref.roas !== null && (
                          <p className={cn("mt-2.5 text-[12px] font-medium", ref.roas >= 1 / marginValue ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400")}>
                            {ref.roas >= 1 / marginValue
                              ? `At ${ref.roas}× the account is above your break-even of ${(1 / marginValue).toFixed(2)}×: ads make money overall.`
                              : `At ${ref.roas}× the account is below your break-even of ${(1 / marginValue).toFixed(2)}×: ads lose money overall. Vera will show where.`}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-5">
                    <div>
                      <Label tag={brandTerms.length > 0 && brandTerms === loaded.prefill.suggestions.brandTerms && <SourceTag source={sources.brandTerms} />}>
                        Brand names
                      </Label>
                      <ChipsInput value={brandTerms} onChange={setBrandTerms} placeholder={`e.g. ${name}`} />
                      <Help>Every way people search for you, in every language and spelling. Vera uses them to separate brand searches from new customers.</Help>
                    </div>
                    <div>
                      <Label>
                        <ShieldBan className="mr-1.5 inline h-4 w-4 text-red-600" />
                        Never advertise
                      </Label>
                      <ChipsInput value={neverAdvertise} onChange={setNeverAdvertise} placeholder="Products, words or claims, e.g. clearance items" tone="bad" />
                      <Help>Vera never uses these in keywords, ads or product texts.</Help>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFillFromWebsite((v) => !v)}
                      disabled={!website}
                      className={cn(
                        "flex w-full items-start gap-3.5 rounded-2xl border p-4 text-left transition-colors",
                        fillFromWebsite && website ? "border-[#400095]/40 bg-[#400095]/[0.04]" : "border-border/70"
                      )}
                    >
                      <span className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border", fillFromWebsite && website ? "border-[#400095] bg-[#400095] text-white" : "border-border")}>
                        {fillFromWebsite && website && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span>
                        <span className="flex items-center gap-1.5 text-sm font-bold">
                          <Sparkles className="h-4 w-4 text-[#F76D01]" /> Let Vera fill in the rest from {website ? hostOf(website) : "your website"}
                        </span>
                        <span className="mt-1 block text-[12px] leading-relaxed text-muted-foreground">
                          Selling points, shipping and returns, brand voice, logo and colours. She saves them as suggestions; you confirm them on the Business profile page.
                        </span>
                      </span>
                    </button>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          )}

          {loaded && (
            <div className="mt-7 flex items-center justify-between gap-3 border-t border-border/60 pt-5">
              {step > 0 ? (
                <button type="button" onClick={() => (setStep((s) => s - 1), setTried(false))} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">
                  <ArrowLeft className="h-4 w-4" /> Back
                </button>
              ) : (
                <span className="text-[11px] text-muted-foreground">
                  <span className="text-[#F76D01]">*</span> required · everything can be changed later
                </span>
              )}
              <div className="flex items-center gap-3">
                {error && <span className="text-xs text-red-600">{error}</span>}
                {tried && missing.length > 0 && !error && <span className="hidden text-xs text-muted-foreground sm:inline">Still needed: {missing.join(", ")}</span>}
                <button
                  type="button"
                  onClick={() => void next()}
                  disabled={saving}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#400095] px-5 text-sm font-bold text-white shadow-[0_10px_30px_rgba(64,0,149,.25)] transition-all hover:-translate-y-0.5 hover:bg-[#340079] disabled:translate-y-0 disabled:opacity-60 dark:bg-violet-600"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {step < STEPS.length - 1 ? "Continue" : "Start working with Vera"}
                  {!saving && <ArrowRight className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}
        </div>
        <p className="mt-4 text-center text-[11px] text-muted-foreground">Saved to your workspace&apos;s Business profile, shared by every Autommerce agent. Only owners and admins can change it.</p>
      </div>
    </div>
  );
}

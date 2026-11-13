"use client";

import { useMemo, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ACCENT_BTN, Field, LimitedInput, Pill, SelectBox, Toggle } from "@/components/google-ads/ga-ui";
import { ADVANTAGE_STATES, AD_FORMATS, ALL_PLACEMENTS, BID_STRATEGIES, CONVERSION_EVENTS, CONVERSION_LOCATIONS, CTAS, GEO_TARGETS, LANGUAGES, LIMITS, OBJECTIVES, OPTIMIZATION_GOALS, PLACEMENTS, SPECIAL_AD_CATEGORIES } from "@/lib/meta-ads/constants";
import { learningBudget } from "@/lib/meta-ads/analytics";
import { accountBase, derive, money, rangeFor } from "@/lib/meta-ads/metrics";
import { emptyBundle, gid, partToOp } from "@/lib/meta-ads/mutations";
import { useAccountState, useMetaAds } from "@/lib/meta-ads/store";
import { validateOps } from "@/lib/meta-ads/validation";
import type { AdFormat, BidStrategy, CampaignBundle, ConversionEvent, ConversionLocation, CtaKey, MutateOp, NewAd, NewAdSet, Objective, PartDraft, OptimizationGoal, PlacementKey, SpecialAdCategory } from "@/lib/meta-ads/types";
import { AdPreviewPanel } from "./ma-ad-preview";

type StepId = "objective" | "campaign" | "adset" | "ads" | "budget" | "review";
const STEPS: StepId[] = ["objective", "campaign", "adset", "ads", "budget", "review"];
const STEP_LABEL: Record<StepId, string> = { objective: "Objective", campaign: "Campaign", adset: "Ad set", ads: "Ads", budget: "Budget", review: "Review & publish" };

type AdDraft = NewAd;

/** Full-screen editor. It only opens from a pending agent draft (or "Review draft"), and publishing applies that same change. A draft of just a new ad set or new ads opens the smaller PartEditor instead. */
export function MaCampaignEditor() {
  const editor = useMetaAds((s) => s.editor);
  if (!editor.open) return null;
  if (editor.part) return <PartEditor key={editor.changeId ?? "part"} initial={editor.part} changeId={editor.changeId} />;
  return <Editor initial={editor.draft} changeId={editor.changeId} />;
}

function Editor({ initial, changeId }: { initial?: CampaignBundle; changeId?: string }) {
  const acc = useAccountState()!;
  const { data } = acc;
  const closeEditor = useMetaAds((s) => s.closeEditor);
  const applyDirect = useMetaAds((s) => s.applyDirect);
  const reviseChange = useMetaAds((s) => s.reviseChange);
  const applyChange = useMetaAds((s) => s.applyChange);
  const cur = data.account.currency;

  const [bundle, setBundle] = useState<CampaignBundle>(() => initial ?? emptyBundle("SALES"));
  const [step, setStep] = useState<StepId>(initial ? "review" : "objective");
  const [setIdx, setSetIdx] = useState(0);
  const [publishLive, setPublishLive] = useState(false);

  const c = bundle.campaign;
  const o = OBJECTIVES[c.objective];
  const idx = STEPS.indexOf(step);
  const group = bundle.adSets[Math.min(setIdx, bundle.adSets.length - 1)]!;
  const s = group.adSet;
  const ap = c.advantageState === "ADVANTAGE_PLUS";

  const setCampaign = (patch: Partial<CampaignBundle["campaign"]>) => setBundle((b) => ({ ...b, campaign: { ...b.campaign, ...patch } }));
  const setAdSet = (patch: Partial<typeof s>) => setBundle((b) => ({ ...b, adSets: b.adSets.map((g, i) => (i === setIdx ? { ...g, adSet: { ...g.adSet, ...patch } } : g)) }));
  const setAds = (ads: AdDraft[]) => setBundle((b) => ({ ...b, adSets: b.adSets.map((g, i) => (i === setIdx ? { ...g, ads } : g)) }));

  const chooseObjective = (next: Objective) => {
    const fresh = emptyBundle(next);
    setBundle((b) => ({ campaign: { ...fresh.campaign, name: b.campaign.name, specialAdCategories: b.campaign.specialAdCategories }, adSets: fresh.adSets.map((g, i) => ({ ...g, ads: i === 0 ? b.adSets[0]?.ads ?? [] : [], adSet: { ...g.adSet, targeting: { ...g.adSet.targeting, locations: b.adSets[0]?.adSet.targeting.locations ?? g.adSet.targeting.locations } } })) }));
    setSetIdx(0);
  };
  const setAdvantage = (on: boolean) => {
    setCampaign({ advantageState: on ? "ADVANTAGE_PLUS" : "MANUAL", budget: on ? c.budget ?? { kind: "DAILY", amount: 50 } : c.budget, existingCustomerCap: on && c.objective === "SALES" ? c.existingCustomerCap ?? 0.1 : undefined });
    setBundle((b) => ({ ...b, adSets: b.adSets.map((g) => ({ ...g, adSet: { ...g.adSet, targeting: { ...g.adSet.targeting, advantageAudience: on }, placements: on ? { advantage: true, manual: [] } : g.adSet.placements } })) }));
  };

  const finalBundle = useMemo<CampaignBundle>(() => {
    const status = publishLive ? "ACTIVE" : "PAUSED";
    return {
      campaign: { ...c, status },
      adSets: bundle.adSets.map((g) => ({ adSet: { ...g.adSet, status }, ads: g.ads.map((a) => ({ ...a, status })) })),
    };
  }, [bundle, c, publishLive]);
  const op: MutateOp = useMemo(() => ({ kind: "campaign.create", bundle: finalBundle, tempId: gid("c") }), [finalBundle]);
  const errors = validateOps(data, [op]);

  const publish = () => {
    if (errors.length) {
      toast.error(errors[0]);
      return;
    }
    if (changeId) {
      reviseChange(changeId, [op], `Create campaign: ${c.name}`);
      applyChange(changeId);
      toast.success(`Published ${c.name}`);
      closeEditor();
      return;
    }
    const res = applyDirect(`Create campaign: ${c.name}`, [op]);
    if (res.ok) {
      toast.success(`Published ${c.name}`);
      closeEditor();
    } else toast.error(res.error);
  };

  const canNext = (() => {
    switch (step) {
      case "objective":
        return o.creatable;
      case "campaign":
        return c.name.trim().length > 0;
      case "adset":
        return s.name.trim().length > 0 && s.targeting.locations.some((l) => !l.excluded);
      default:
        return true;
    }
  })();

  // Budget sizing: cost per result of the account × 50 / 7, per ad set.
  const accountCpr = useMemo(() => derive(accountBase(data, rangeFor("LAST_30_DAYS"))).costPerResult, [data]);
  const needPerSet = accountCpr ? learningBudget(accountCpr) : 0;
  const totalBudget = c.budget ? c.budget.amount : bundle.adSets.reduce((a, g) => a + (g.adSet.budget?.amount ?? 0), 0);
  const perSet = totalBudget / Math.max(1, bundle.adSets.length);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background [font-family:var(--brand-font)]" data-testid="meta-campaign-editor">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border/60 px-4">
        <button type="button" onClick={closeEditor} className="rounded-lg p-1.5 hover:bg-muted" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <p className="text-sm font-bold">{changeId ? "Review agent draft" : "New campaign"}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {c.name || "Untitled"} · {o.label}
            {ap ? " · Advantage+" : ""}
          </p>
        </div>
        {changeId && <Pill tone="brand" className="ml-2">Drafted by agent</Pill>}
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[11px] text-muted-foreground sm:inline">{totalBudget ? `${money(totalBudget, cur)}${c.budget?.kind === "LIFETIME" ? " lifetime" : "/day"}` : "No budget"}</span>
          <button type="button" onClick={publish} disabled={errors.length > 0} className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-xs font-semibold", ACCENT_BTN)}>
            <Check className="h-3.5 w-3.5" /> Publish campaign
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-56 shrink-0 border-r border-border/60 bg-muted/20 p-3 md:block">
          {STEPS.map((st, i) => (
            <button key={st} type="button" onClick={() => setStep(st)} className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs", st === step ? "bg-background font-semibold shadow-sm" : "text-muted-foreground hover:bg-muted")}>
              <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold", i < idx ? "bg-emerald-500 text-white" : st === step ? "bg-[#400095] text-white dark:bg-violet-600" : "bg-muted")}>{i < idx ? <Check className="h-3 w-3" /> : i + 1}</span>
              {STEP_LABEL[st]}
            </button>
          ))}
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="mx-auto max-w-4xl px-6 py-8">
            {step === "objective" && (
              <Section title="What do you want from this campaign?" body="The objective decides where the result happens and what Meta optimizes for.">
                <div className="grid gap-3 sm:grid-cols-2">
                  {(Object.keys(OBJECTIVES) as Objective[]).map((k) => (
                    <Choice key={k} active={c.objective === k} disabled={!OBJECTIVES[k].creatable} onClick={() => chooseObjective(k)} title={OBJECTIVES[k].label} body={OBJECTIVES[k].blurb} footer={!OBJECTIVES[k].creatable ? <span className="text-[10px] text-muted-foreground">Managed in Ads Manager (needs an app)</span> : undefined} />
                  ))}
                </div>
                {(c.objective === "SALES" || c.objective === "LEADS") && (
                  <label className="mt-5 flex items-start gap-3 rounded-xl border border-border/60 p-4">
                    <Toggle checked={ap} onChange={setAdvantage} />
                    <span className="text-xs">
                      <span className="block font-semibold">Advantage+ {o.label}</span>
                      <span className="text-muted-foreground">{ADVANTAGE_STATES.ADVANTAGE_PLUS.blurb}. Recommended: Meta spreads budget and finds people better than manual rules.</span>
                    </span>
                  </label>
                )}
              </Section>
            )}

            {step === "campaign" && (
              <Section title="Campaign details">
                <div className="space-y-4">
                  <Field label="Campaign name" error={!c.name.trim() ? "Required" : undefined}>
                    <Input value={c.name} onChange={(e) => setCampaign({ name: e.target.value })} placeholder="Advantage+ Sales – Running Shoes KSA" />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Start date">
                      <Input type="date" value={c.startDate} onChange={(e) => setCampaign({ startDate: e.target.value })} />
                    </Field>
                    <Field label="End date (optional)">
                      <Input type="date" value={c.stopDate ?? ""} onChange={(e) => setCampaign({ stopDate: e.target.value || undefined })} />
                    </Field>
                  </div>
                  <Field label="Special ad categories" hint="Only if your ads are about housing, employment, credit, politics or gambling. These restrict targeting.">
                    <div className="flex flex-wrap gap-2">
                      {(Object.keys(SPECIAL_AD_CATEGORIES) as SpecialAdCategory[]).map((k) => {
                        const on = c.specialAdCategories.includes(k);
                        return (
                          <button key={k} type="button" onClick={() => setCampaign({ specialAdCategories: on ? c.specialAdCategories.filter((x) => x !== k) : [...c.specialAdCategories, k] })} className={cn("rounded-full border px-3 py-1.5 text-xs font-medium", on ? "border-[#400095] bg-[#400095]/10 text-[#400095] dark:text-violet-300" : "border-border/70 hover:bg-muted")}>
                            {SPECIAL_AD_CATEGORIES[k]}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                </div>
              </Section>
            )}

            {step === "adset" && (
              <Section title="Ad set" body="Who sees the ads, where, and what Meta optimizes for.">
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  {bundle.adSets.map((g, i) => (
                    <button key={i} type="button" onClick={() => setSetIdx(i)} className={cn("rounded-lg border px-3 py-1.5 text-xs font-medium", i === setIdx ? "border-[#400095] bg-[#400095]/10 text-[#400095] dark:text-violet-300" : "border-border/70 hover:bg-muted")}>
                      {g.adSet.name || `Ad set ${i + 1}`}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const b = emptyBundle(c.objective).adSets[0]!;
                      setBundle((cur2) => ({ ...cur2, adSets: [...cur2.adSets, { ...b, adSet: { ...b.adSet, name: `Ad set ${cur2.adSets.length + 1}`, targeting: { ...b.adSet.targeting, advantageAudience: ap }, promotedObject: cur2.adSets[0]?.adSet.promotedObject ?? b.adSet.promotedObject } }] }));
                      setSetIdx(bundle.adSets.length);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                  >
                    <Plus className="h-3 w-3" /> Add ad set
                  </button>
                  {bundle.adSets.length > 1 && (
                    <button type="button" onClick={() => { setBundle((b) => ({ ...b, adSets: b.adSets.filter((_, i) => i !== setIdx) })); setSetIdx(0); }} className="ml-auto inline-flex items-center gap-1 text-xs text-red-600 hover:underline">
                      <Trash2 className="h-3 w-3" /> Remove this ad set
                    </button>
                  )}
                </div>
                <AdSetFields s={s} setAdSet={setAdSet} objective={c.objective} />
              </Section>
            )}

            {step === "ads" && <AdsStep ads={group.ads} setAds={setAds} adSetName={s.name} objective={c.objective} defaultLink={group.ads[0]?.link ?? "https://"} />}

            {step === "budget" && (
              <Section title="Budget & bidding">
                <div className="space-y-5">
                  <div className="rounded-xl border border-border/60 p-4">
                    <label className="flex items-start gap-3">
                      <Toggle checked={!!c.budget} disabled={ap} onChange={(v) => setCampaign({ budget: v ? { kind: "DAILY", amount: Math.max(LIMITS.minDailyBudget, totalBudget || 50) } : undefined })} />
                      <span className="text-xs">
                        <span className="block font-semibold">Advantage+ campaign budget</span>
                        <span className="text-muted-foreground">{ap ? "Always on for Advantage+ campaigns." : "One budget Meta shares across ad sets. Off means each ad set has its own."}</span>
                      </span>
                    </label>
                  </div>
                  {c.budget ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Budget type">
                        <SelectBox value={c.budget.kind} onChange={(v) => setCampaign({ budget: { ...c.budget!, kind: v } })} options={[{ value: "DAILY", label: "Daily budget" }, { value: "LIFETIME", label: "Lifetime budget" }]} />
                      </Field>
                      <Field label={`Amount (${cur})`} error={c.budget.amount < LIMITS.minDailyBudget ? `At least ${LIMITS.minDailyBudget}` : undefined}>
                        <Input type="number" min={LIMITS.minDailyBudget} value={c.budget.amount} onChange={(e) => setCampaign({ budget: { ...c.budget!, amount: Number(e.target.value) } })} />
                      </Field>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {bundle.adSets.map((g, i) => (
                        <div key={i} className="grid items-end gap-3 sm:grid-cols-[1fr_140px_160px]">
                          <span className="truncate pb-2 text-xs font-semibold">{g.adSet.name}</span>
                          <Field label="Type">
                            <SelectBox value={g.adSet.budget?.kind ?? "DAILY"} onChange={(v) => setBundle((b) => ({ ...b, adSets: b.adSets.map((x, j) => (j === i ? { ...x, adSet: { ...x.adSet, budget: { kind: v, amount: x.adSet.budget?.amount ?? 20 } } } : x)) }))} options={[{ value: "DAILY", label: "Daily" }, { value: "LIFETIME", label: "Lifetime" }]} />
                          </Field>
                          <Field label={`Amount (${cur})`}>
                            <Input type="number" min={LIMITS.minDailyBudget} value={g.adSet.budget?.amount ?? ""} onChange={(e) => setBundle((b) => ({ ...b, adSets: b.adSets.map((x, j) => (j === i ? { ...x, adSet: { ...x.adSet, budget: { kind: x.adSet.budget?.kind ?? "DAILY", amount: Number(e.target.value) } } } : x)) }))} />
                          </Field>
                        </div>
                      ))}
                    </div>
                  )}
                  {needPerSet > 0 && (
                    <p className={cn("flex gap-2 rounded-lg px-3 py-2 text-[11px] leading-relaxed", perSet < needPerSet ? "border border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-300" : "bg-muted/50 text-muted-foreground")}>
                      {perSet < needPerSet && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                      At this account&apos;s cost per result ({money(accountCpr, cur, { decimals: 2 })}), an ad set needs about {money(needPerSet, cur)}/day to reach 50 results in 7 days. You are giving each about {money(perSet, cur)}/day.
                    </p>
                  )}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Bid strategy">
                      <SelectBox<BidStrategy> value={c.bidStrategy} onChange={(v) => setCampaign({ bidStrategy: v, bidValue: BID_STRATEGIES[v].needsValue ? c.bidValue : undefined })} options={(Object.keys(BID_STRATEGIES) as BidStrategy[]).map((b) => ({ value: b, label: BID_STRATEGIES[b].label }))} />
                    </Field>
                    {BID_STRATEGIES[c.bidStrategy].needsValue && (
                      <Field label={BID_STRATEGIES[c.bidStrategy].needsValue === "ROAS" ? "Minimum ROAS (x)" : `Amount (${cur})`}>
                        <Input type="number" step="0.1" value={c.bidValue ?? ""} onChange={(e) => setCampaign({ bidValue: Number(e.target.value) || undefined })} />
                      </Field>
                    )}
                  </div>
                  {c.objective === "SALES" && ap && (
                    <Field label={`Existing customer budget cap: ${Math.round((c.existingCustomerCap ?? 0) * 100)}%`} hint="The most budget that may go to people already in your existing customer audiences. Lower sends more to new buyers.">
                      <input type="range" min={0} max={50} step={5} value={Math.round((c.existingCustomerCap ?? 0) * 100)} onChange={(e) => setCampaign({ existingCustomerCap: Number(e.target.value) / 100 })} className="w-full accent-[#400095]" />
                    </Field>
                  )}
                </div>
              </Section>
            )}

            {step === "review" && (
              <Section title="Review & publish" body="Check everything, then publish. You can start it paused and turn it on later.">
                {errors.length > 0 ? (
                  <div className="mb-5 space-y-1.5 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                    <p className="flex items-center gap-2 text-xs font-semibold text-red-700 dark:text-red-400">
                      <AlertTriangle className="h-3.5 w-3.5" /> {errors.length} {errors.length === 1 ? "thing needs" : "things need"} fixing
                    </p>
                    <ul className="list-disc space-y-1 pl-5 text-xs text-red-700 dark:text-red-300">
                      {errors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    <Check className="h-4 w-4" /> Ready to publish
                  </div>
                )}
                <dl className="grid gap-3 rounded-xl border border-border/60 p-4 text-xs sm:grid-cols-2">
                  {[
                    ["Campaign", c.name || "—"],
                    ["Objective", `${o.label}${ap ? " · Advantage+" : ""}`],
                    ["Budget", c.budget ? `${money(c.budget.amount, cur)} ${c.budget.kind === "DAILY" ? "per day" : "lifetime"} (campaign)` : `${bundle.adSets.length} ad set budgets`],
                    ["Bid strategy", BID_STRATEGIES[c.bidStrategy].label],
                    ["Ad sets", bundle.adSets.map((g) => g.adSet.name).join(", ")],
                    ["Ads", String(bundle.adSets.reduce((a, g) => a + g.ads.length, 0))],
                    ["Locations", [...new Set(bundle.adSets.flatMap((g) => g.adSet.targeting.locations.filter((l) => !l.excluded).map((l) => l.name)))].join(", ")],
                    ["Start", `${c.startDate}${c.stopDate ? ` → ${c.stopDate}` : ""}`],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{k}</dt>
                      <dd className="mt-0.5 font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
                <label className="mt-5 flex items-start gap-3 rounded-xl border border-border/60 p-4">
                  <Toggle checked={publishLive} onChange={setPublishLive} />
                  <span className="text-xs">
                    <span className="block font-semibold">{publishLive ? "Publish and turn on" : "Publish paused"}</span>
                    <span className="text-muted-foreground">{publishLive ? "Ads go to Meta review and start delivering once approved." : "Everything is created but nothing delivers until you turn it on."}</span>
                  </span>
                </label>
              </Section>
            )}

            <div className="mt-8 flex items-center justify-between">
              <button type="button" onClick={() => setStep(STEPS[Math.max(0, idx - 1)]!)} disabled={idx === 0} className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-40">
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              {idx < STEPS.length - 1 && (
                <button type="button" onClick={() => setStep(STEPS[idx + 1]!)} disabled={!canNext} className={cn("inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold", ACCENT_BTN)}>
                  Next <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </motion.div>
        </main>
      </div>
    </div>
  );
}

type PartStep = "adset" | "ads" | "budget" | "review";
const PART_LABEL: Record<PartStep, string> = { adset: "Ad set", ads: "Ads", budget: "Budget", review: "Review & publish" };

/** Smaller editor for an agent draft of one new ad set (with its ads) or new ads in an existing ad set. The campaign is fixed. */
function PartEditor({ initial, changeId }: { initial: PartDraft; changeId?: string }) {
  const { data } = useAccountState()!;
  const closeEditor = useMetaAds((s) => s.closeEditor);
  const applyDirect = useMetaAds((s) => s.applyDirect);
  const reviseChange = useMetaAds((s) => s.reviseChange);
  const applyChange = useMetaAds((s) => s.applyChange);
  const cur = data.account.currency;

  const [part, setPart] = useState<PartDraft>(initial);
  const [step, setStep] = useState<PartStep>("review");
  const [publishLive, setPublishLive] = useState(false);

  const targetSet = part.kind === "ad" ? data.adSets.find((s) => s.id === part.adSetId) : undefined;
  const campaign = data.campaigns.find((c) => c.id === (part.kind === "adSet" ? part.campaignId : targetSet?.campaignId));
  const objective = campaign?.objective ?? "SALES";
  const steps: PartStep[] = part.kind === "adSet" ? ["adset", "ads", ...(campaign?.budget ? [] : (["budget"] as PartStep[])), "review"] : ["ads", "review"];
  const idx = steps.indexOf(step);

  // A campaign with an Advantage+ campaign budget keeps the budget; its ad sets carry none.
  const finalPart = useMemo<PartDraft>(() => (part.kind === "adSet" && campaign?.budget ? { ...part, adSet: { ...part.adSet, budget: undefined } } : part), [part, campaign?.budget]);
  const op = useMemo(() => partToOp(finalPart, publishLive ? "ACTIVE" : "PAUSED"), [finalPart, publishLive]);
  const errors = validateOps(data, [op]);

  const setAdSet = (patch: Partial<NewAdSet>) => setPart((p) => (p.kind === "adSet" ? { ...p, adSet: { ...p.adSet, ...patch } } : p));
  const setAds = (ads: AdDraft[]) => setPart((p) => ({ ...p, ads }));

  const title = part.kind === "adSet" ? `Add ad set: ${part.adSet.name}` : `Add ${part.ads.length} ad${part.ads.length === 1 ? "" : "s"} to ${targetSet?.name ?? "ad set"}`;
  const publish = () => {
    if (errors.length) {
      toast.error(errors[0]);
      return;
    }
    if (changeId) {
      reviseChange(changeId, [op], title);
      applyChange(changeId);
      toast.success("Published");
      closeEditor();
      return;
    }
    const res = applyDirect(title, [op]);
    if (res.ok) {
      toast.success("Published");
      closeEditor();
    } else toast.error(res.error);
  };

  const accountCpr = useMemo(() => derive(accountBase(data, rangeFor("LAST_30_DAYS"))).costPerResult, [data]);
  const needPerSet = accountCpr ? learningBudget(accountCpr) : 0;
  const budget = part.kind === "adSet" ? part.adSet.budget : undefined;
  const canNext = step === "adset" && part.kind === "adSet" ? part.adSet.name.trim().length > 0 && part.adSet.targeting.locations.some((l) => !l.excluded) : true;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background [font-family:var(--brand-font)]" data-testid="meta-part-editor">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border/60 px-4">
        <button type="button" onClick={closeEditor} className="rounded-lg p-1.5 hover:bg-muted" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <p className="text-sm font-bold">{part.kind === "adSet" ? "New ad set" : "New ads"}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {part.kind === "adSet" ? part.adSet.name || "Untitled" : `${part.ads.length} in ${targetSet?.name ?? "ad set"}`} · in {campaign?.name ?? "campaign"}
          </p>
        </div>
        {changeId && <Pill tone="brand" className="ml-2">Drafted by agent</Pill>}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={publish} disabled={errors.length > 0} className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-xs font-semibold", ACCENT_BTN)}>
            <Check className="h-3.5 w-3.5" /> {part.kind === "adSet" ? "Publish ad set" : "Publish ads"}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-56 shrink-0 border-r border-border/60 bg-muted/20 p-3 md:block">
          {steps.map((st, i) => (
            <button key={st} type="button" onClick={() => setStep(st)} className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs", st === step ? "bg-background font-semibold shadow-sm" : "text-muted-foreground hover:bg-muted")}>
              <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold", i < idx ? "bg-emerald-500 text-white" : st === step ? "bg-[#400095] text-white dark:bg-violet-600" : "bg-muted")}>{i < idx ? <Check className="h-3 w-3" /> : i + 1}</span>
              {PART_LABEL[st]}
            </button>
          ))}
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <motion.div key={step} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="mx-auto max-w-4xl px-6 py-8">
            {step === "adset" && part.kind === "adSet" && (
              <Section title="Ad set" body={`Who sees the ads, where, and what Meta optimizes for. It joins ${campaign?.name ?? "the campaign"}.`}>
                <AdSetFields s={part.adSet} setAdSet={setAdSet} objective={objective} />
              </Section>
            )}

            {step === "ads" && <AdsStep ads={part.ads} setAds={setAds} adSetName={part.kind === "adSet" ? part.adSet.name : targetSet?.name ?? "this ad set"} objective={objective} defaultLink={part.ads[0]?.link ?? "https://"} />}

            {step === "budget" && part.kind === "adSet" && (
              <Section title="Budget" body={`${campaign?.name ?? "This campaign"} has no campaign budget, so this ad set needs its own.`}>
                <div className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Budget type">
                      <SelectBox value={budget?.kind ?? "DAILY"} onChange={(v) => setAdSet({ budget: { kind: v, amount: budget?.amount ?? 20 } })} options={[{ value: "DAILY", label: "Daily budget" }, { value: "LIFETIME", label: "Lifetime budget" }]} />
                    </Field>
                    <Field label={`Amount (${cur})`} error={(budget?.amount ?? 0) < LIMITS.minDailyBudget ? `At least ${LIMITS.minDailyBudget}` : undefined}>
                      <Input type="number" min={LIMITS.minDailyBudget} value={budget?.amount ?? ""} onChange={(e) => setAdSet({ budget: { kind: budget?.kind ?? "DAILY", amount: Number(e.target.value) } })} />
                    </Field>
                  </div>
                  {needPerSet > 0 && (
                    <p className={cn("flex gap-2 rounded-lg px-3 py-2 text-[11px] leading-relaxed", (budget?.amount ?? 0) < needPerSet ? "border border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-300" : "bg-muted/50 text-muted-foreground")}>
                      {(budget?.amount ?? 0) < needPerSet && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                      At this account&apos;s cost per result ({money(accountCpr, cur, { decimals: 2 })}), an ad set needs about {money(needPerSet, cur)}/day to reach 50 results in 7 days. This one has {money(budget?.amount ?? 0, cur)}/day.
                    </p>
                  )}
                </div>
              </Section>
            )}

            {step === "review" && (
              <Section title="Review & publish" body="Check everything, then publish. You can start it paused and turn it on later.">
                {errors.length > 0 ? (
                  <div className="mb-5 space-y-1.5 rounded-xl border border-red-500/30 bg-red-500/5 p-4">
                    <p className="flex items-center gap-2 text-xs font-semibold text-red-700 dark:text-red-400">
                      <AlertTriangle className="h-3.5 w-3.5" /> {errors.length} {errors.length === 1 ? "thing needs" : "things need"} fixing
                    </p>
                    <ul className="list-disc space-y-1 pl-5 text-xs text-red-700 dark:text-red-300">
                      {errors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    <Check className="h-4 w-4" /> Ready to publish
                  </div>
                )}
                <dl className="grid gap-3 rounded-xl border border-border/60 p-4 text-xs sm:grid-cols-2">
                  {(
                    [
                      ["Campaign", campaign?.name ?? "-"],
                      ...(part.kind === "adSet"
                        ? [
                            ["Ad set", part.adSet.name || "-"],
                            ["Performance goal", OPTIMIZATION_GOALS[part.adSet.optimizationGoal].label],
                            ["Budget", campaign?.budget ? "Uses the campaign budget" : budget ? `${money(budget.amount, cur)} ${budget.kind === "DAILY" ? "per day" : "lifetime"}` : "-"],
                            ["Audience", part.adSet.targeting.advantageAudience ? "Advantage+ audience" : "Manual audience"],
                            ["Locations", part.adSet.targeting.locations.filter((l) => !l.excluded).map((l) => l.name).join(", ") || "-"],
                            ["Placements", part.adSet.placements.advantage ? "Advantage+ placements" : `${part.adSet.placements.manual.length} chosen`],
                          ]
                        : [["Ad set", targetSet?.name ?? "-"]]),
                      ["Ads", part.ads.map((a) => a.name).join(", ") || "-"],
                    ] as string[][]
                  ).map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{k}</dt>
                      <dd className="mt-0.5 font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
                <label className="mt-5 flex items-start gap-3 rounded-xl border border-border/60 p-4">
                  <Toggle checked={publishLive} onChange={setPublishLive} />
                  <span className="text-xs">
                    <span className="block font-semibold">{publishLive ? "Publish and turn on" : "Publish paused"}</span>
                    <span className="text-muted-foreground">{publishLive ? "Ads go to Meta review and start delivering once approved." : "Everything is created but nothing delivers until you turn it on."}</span>
                  </span>
                </label>
              </Section>
            )}

            <div className="mt-8 flex items-center justify-between">
              <button type="button" onClick={() => setStep(steps[Math.max(0, idx - 1)]!)} disabled={idx === 0} className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-40">
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </button>
              {idx < steps.length - 1 && (
                <button type="button" onClick={() => setStep(steps[idx + 1]!)} disabled={!canNext} className={cn("inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold", ACCENT_BTN)}>
                  Next <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </motion.div>
        </main>
      </div>
    </div>
  );
}
function AdSetFields({ s, setAdSet, objective }: { s: NewAdSet; setAdSet: (patch: Partial<NewAdSet>) => void; objective: Objective }) {
  const { data } = useAccountState()!;
  const o = OBJECTIVES[objective];
  return (
    <div className="space-y-5">
      <Field label="Ad set name">
        <Input value={s.name} onChange={(e) => setAdSet({ name: e.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Conversion location">
          <SelectBox<ConversionLocation> value={s.conversionLocation} onChange={(v) => setAdSet({ conversionLocation: v })} options={o.locations.map((l) => ({ value: l, label: CONVERSION_LOCATIONS[l] }))} />
        </Field>
        <Field label="Performance goal">
          <SelectBox<OptimizationGoal> value={s.optimizationGoal} onChange={(v) => setAdSet({ optimizationGoal: v })} options={o.goals.map((g) => ({ value: g, label: OPTIMIZATION_GOALS[g].label }))} />
        </Field>
      </div>
      {(s.optimizationGoal === "OFFSITE_CONVERSIONS" || s.optimizationGoal === "VALUE") && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dataset (Pixel)">
            <SelectBox value={s.promotedObject.datasetId ?? data.account.datasetId ?? ""} onChange={(v) => setAdSet({ promotedObject: { ...s.promotedObject, datasetId: v } })} options={data.datasets.map((d) => ({ value: d.id, label: d.name }))} />
          </Field>
          <Field label="Conversion event">
            <SelectBox<ConversionEvent> value={s.promotedObject.event ?? "PURCHASE"} onChange={(v) => setAdSet({ promotedObject: { ...s.promotedObject, event: v } })} options={(Object.keys(CONVERSION_EVENTS) as ConversionEvent[]).map((e) => ({ value: e, label: CONVERSION_EVENTS[e] }))} />
          </Field>
        </div>
      )}
      {s.conversionLocation === "INSTANT_FORMS" && (
        <Field label="Instant form">
          <SelectBox value={s.promotedObject.leadFormId ?? ""} onChange={(v) => setAdSet({ promotedObject: { ...s.promotedObject, leadFormId: v } })} options={[{ value: "", label: "Pick a form" }, ...data.leadForms.filter((f) => f.status === "ACTIVE").map((f) => ({ value: f.id, label: f.name }))]} />
        </Field>
      )}
      <Field label="Locations">
        <div className="flex flex-wrap gap-2">
          {GEO_TARGETS.map((g) => {
            const on = s.targeting.locations.some((l) => l.id === g.id && !l.excluded);
            return (
              <button key={g.id} type="button" onClick={() => setAdSet({ targeting: { ...s.targeting, locations: on ? s.targeting.locations.filter((l) => l.id !== g.id) : [...s.targeting.locations, g] } })} className={cn("rounded-full border px-3 py-1.5 text-xs font-medium", on ? "border-[#400095] bg-[#400095]/10 text-[#400095] dark:text-violet-300" : "border-border/70 hover:bg-muted")}>
                {g.name}
              </button>
            );
          })}
        </div>
      </Field>
      <div className="rounded-xl border border-border/60 p-4">
        <label className="flex items-start gap-3">
          <Toggle checked={s.targeting.advantageAudience} onChange={(v) => setAdSet({ targeting: { ...s.targeting, advantageAudience: v } })} />
          <span className="text-xs">
            <span className="block font-semibold">Advantage+ audience</span>
            <span className="text-muted-foreground">Meta finds people beyond your suggestions. Age and gender become suggestions; locations and exclusions stay hard limits.</span>
          </span>
        </label>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label={s.targeting.advantageAudience ? "Suggested min age" : "Min age"}>
            <Input type="number" min={13} max={65} value={s.targeting.ageMin} onChange={(e) => setAdSet({ targeting: { ...s.targeting, ageMin: Number(e.target.value) } })} />
          </Field>
          <Field label={s.targeting.advantageAudience ? "Suggested max age" : "Max age"}>
            <Input type="number" min={13} max={65} value={s.targeting.ageMax} onChange={(e) => setAdSet({ targeting: { ...s.targeting, ageMax: Number(e.target.value) } })} />
          </Field>
          <Field label="Gender">
            <SelectBox value={s.targeting.genders} onChange={(v) => setAdSet({ targeting: { ...s.targeting, genders: v } })} options={[{ value: "ALL", label: "All" }, { value: "MEN", label: "Men" }, { value: "WOMEN", label: "Women" }]} />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Languages">
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map((l) => {
                const on = s.targeting.languages.includes(l);
                return (
                  <button key={l} type="button" onClick={() => setAdSet({ targeting: { ...s.targeting, languages: on ? s.targeting.languages.filter((x) => x !== l) : [...s.targeting.languages, l] } })} className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium", on ? "border-[#400095] bg-[#400095]/10 text-[#400095] dark:text-violet-300" : "border-border/70 hover:bg-muted")}>
                    {l}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <AudiencePicker label={s.targeting.advantageAudience ? "Audience suggestions" : "Include audiences"} ids={s.targeting.includeAudienceIds} onChange={(ids) => setAdSet({ targeting: { ...s.targeting, includeAudienceIds: ids } })} />
          <AudiencePicker label="Exclude audiences" ids={s.targeting.excludeAudienceIds} onChange={(ids) => setAdSet({ targeting: { ...s.targeting, excludeAudienceIds: ids } })} />
        </div>
      </div>
      <div className="rounded-xl border border-border/60 p-4">
        <label className="flex items-start gap-3">
          <Toggle checked={s.placements.advantage} onChange={(v) => setAdSet({ placements: { advantage: v, manual: v ? [] : s.placements.manual.length ? s.placements.manual : ["FB_FEED", "IG_FEED"] } })} />
          <span className="text-xs">
            <span className="block font-semibold">Advantage+ placements</span>
            <span className="text-muted-foreground">Recommended. Turn it off only if you must keep ads out of specific places.</span>
          </span>
        </label>
        {!s.placements.advantage && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {ALL_PLACEMENTS.map((k) => {
              const on = s.placements.manual.includes(k);
              return (
                <button key={k} type="button" onClick={() => setAdSet({ placements: { advantage: false, manual: on ? s.placements.manual.filter((x) => x !== k) : [...s.placements.manual, k as PlacementKey] } })} className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium", on ? "border-[#400095] bg-[#400095]/10 text-[#400095] dark:text-violet-300" : "border-border/70 hover:bg-muted")}>
                  {PLACEMENTS[k].platform === "FACEBOOK" ? "FB" : PLACEMENTS[k].platform === "INSTAGRAM" ? "IG" : PLACEMENTS[k].platform === "MESSENGER" ? "Msgr" : PLACEMENTS[k].platform === "AUDIENCE_NETWORK" ? "AN" : "Threads"} · {PLACEMENTS[k].label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function AudiencePicker({ label, ids, onChange }: { label: string; ids: string[]; onChange: (ids: string[]) => void }) {
  const { data } = useAccountState()!;
  return (
    <Field label={label}>
      <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-border/60 p-1.5">
        {data.audiences.map((a) => (
          <label key={a.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted/50">
            <input type="checkbox" checked={ids.includes(a.id)} onChange={() => onChange(ids.includes(a.id) ? ids.filter((x) => x !== a.id) : [...ids, a.id])} className="h-3.5 w-3.5 accent-[#400095]" />
            <span className="truncate">{a.name}</span>
          </label>
        ))}
      </div>
    </Field>
  );
}

function AdsStep({ ads, setAds, adSetName, objective, defaultLink }: { ads: AdDraft[]; setAds: (ads: AdDraft[]) => void; adSetName: string; objective: Objective; defaultLink: string }) {
  const { data } = useAccountState()!;
  const [i, setI] = useState(0);
  const ad = ads[Math.min(i, ads.length - 1)];
  const patch = (p: Partial<AdDraft>) => setAds(ads.map((a, j) => (j === i ? { ...a, ...p } : a)));
  const addAd = () => {
    const base = ads[0];
    setAds([
      ...ads,
      {
        name: `Ad ${ads.length + 1}`,
        status: "PAUSED",
        format: "SINGLE_IMAGE",
        identity: base?.identity ?? { pageName: data.linkedAssets.find((a) => a.kind === "PAGE")?.name ?? data.account.name },
        primaryTexts: [""],
        headlines: [""],
        cta: objective === "LEADS" ? "SIGN_UP" : objective === "SALES" ? "SHOP_NOW" : "LEARN_MORE",
        link: defaultLink,
        mediaIds: [],
        enhancements: {},
      },
    ]);
    setI(ads.length);
  };
  const setList = (key: "primaryTexts" | "headlines", idx: number, v: string) => patch({ [key]: (ad![key] as string[]).map((t, k) => (k === idx ? v : t)) } as Partial<AdDraft>);

  return (
    <Section title="Ads" body={`Ads in ${adSetName}. Texts and headlines are variations: Meta tests combinations.`}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {ads.map((a, j) => (
          <button key={j} type="button" onClick={() => setI(j)} className={cn("rounded-lg border px-3 py-1.5 text-xs font-medium", j === i ? "border-[#400095] bg-[#400095]/10 text-[#400095] dark:text-violet-300" : "border-border/70 hover:bg-muted")}>
            {a.name || `Ad ${j + 1}`}
          </button>
        ))}
        <button type="button" onClick={addAd} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
          <Plus className="h-3 w-3" /> Add ad
        </button>
        {ad && ads.length > 1 && (
          <button type="button" onClick={() => { setAds(ads.filter((_, j) => j !== i)); setI(0); }} className="ml-auto inline-flex items-center gap-1 text-xs text-red-600 hover:underline">
            <Trash2 className="h-3 w-3" /> Remove
          </button>
        )}
      </div>
      {!ad ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">This ad set has no ad yet.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="space-y-4">
            <Field label="Ad name">
              <Input value={ad.name} onChange={(e) => patch({ name: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Format">
                <SelectBox<AdFormat> value={ad.format} onChange={(v) => patch({ format: v })} options={(["SINGLE_IMAGE", "SINGLE_VIDEO", "CAROUSEL", "CATALOG"] as AdFormat[]).map((f) => ({ value: f, label: AD_FORMATS[f].label }))} />
              </Field>
              <Field label="Button">
                <SelectBox<CtaKey> value={ad.cta} onChange={(v) => patch({ cta: v })} options={(Object.keys(CTAS) as CtaKey[]).map((k) => ({ value: k, label: CTAS[k] }))} />
              </Field>
            </div>
            {ad.format === "CATALOG" ? (
              <Field label="Product set">
                <SelectBox value={ad.productSetId ?? ""} onChange={(v) => patch({ productSetId: v || undefined })} options={[{ value: "", label: data.productSets.length ? "Pick a product set" : "Connect a catalog first" }, ...data.productSets.map((p) => ({ value: p.id, label: p.name }))]} />
              </Field>
            ) : (
              <Field label="Creative" hint="Pick from the Creative library. Videos and 9:16 work best for Reels and Stories.">
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {data.creatives.map((cr) => {
                    const on = ad.mediaIds.includes(cr.id);
                    return (
                      <button key={cr.id} type="button" onClick={() => patch({ mediaIds: ad.format === "CAROUSEL" ? (on ? ad.mediaIds.filter((x) => x !== cr.id) : [...ad.mediaIds, cr.id]) : [cr.id], cards: ad.format === "CAROUSEL" ? (on ? ad.mediaIds.filter((x) => x !== cr.id) : [...ad.mediaIds, cr.id]).map((m) => ({ mediaId: m, headline: ad.headlines[0] ?? "", link: ad.link })) : undefined })} className={cn("overflow-hidden rounded-lg border-2 p-0.5 text-left", on ? "border-[#400095]" : "border-transparent hover:border-border")} title={cr.name}>
                        <MiniTile name={cr.name} />
                      </button>
                    );
                  })}
                </div>
              </Field>
            )}
            <Field label={`Primary text (${ad.primaryTexts.length}/${LIMITS.variations})`}>
              <div className="space-y-2">
                {ad.primaryTexts.map((t, k) => (
                  <LimitedInput key={k} multiline value={t} max={LIMITS.primaryText} onChange={(v) => setList("primaryTexts", k, v)} placeholder="What do you want people to know?" />
                ))}
                {ad.primaryTexts.length < LIMITS.variations && (
                  <button type="button" onClick={() => patch({ primaryTexts: [...ad.primaryTexts, ""] })} className="text-xs font-medium text-[#400095] hover:underline dark:text-violet-300">
                    + Add variation
                  </button>
                )}
              </div>
            </Field>
            <Field label={`Headline (${ad.headlines.length}/${LIMITS.variations})`}>
              <div className="space-y-2">
                {ad.headlines.map((t, k) => (
                  <LimitedInput key={k} value={t} max={LIMITS.headline} onChange={(v) => setList("headlines", k, v)} placeholder="A short, clear headline" />
                ))}
                {ad.headlines.length < LIMITS.variations && (
                  <button type="button" onClick={() => patch({ headlines: [...ad.headlines, ""] })} className="text-xs font-medium text-[#400095] hover:underline dark:text-violet-300">
                    + Add variation
                  </button>
                )}
              </div>
            </Field>
            <Field label="Destination URL">
              <Input value={ad.link} onChange={(e) => patch({ link: e.target.value })} placeholder="https://" />
            </Field>
          </div>
          <div className="lg:sticky lg:top-4 lg:self-start">
            <p className="mb-2 text-xs font-semibold">Preview</p>
            <AdPreviewPanel ad={ad} creatives={data.creatives} />
          </div>
        </div>
      )}
    </Section>
  );
}

function MiniTile({ name }: { name: string }) {
  const hue = [...name].reduce((s, ch) => s + ch.charCodeAt(0), 0) % 360;
  return <span className="block aspect-square rounded-md" style={{ background: `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 50) % 360} 75% 30%))` }} />;
}

function Section({ title, body, children }: { title: string; body?: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-black tracking-tight">{title}</h2>
      {body && <p className="mt-1 text-sm text-muted-foreground">{body}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

function Choice({ active, onClick, title, body, footer, disabled }: { active: boolean; onClick: () => void; title: string; body: string; footer?: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cn("rounded-xl border p-4 text-left transition-colors", active ? "border-[#400095] bg-[#400095]/5" : "border-border/60 hover:bg-muted/40", disabled && "cursor-not-allowed opacity-50 hover:bg-transparent")}>
      <span className="block text-sm font-semibold">{title}</span>
      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{body}</span>
      {footer && <span className="mt-2 block">{footer}</span>}
    </button>
  );
}

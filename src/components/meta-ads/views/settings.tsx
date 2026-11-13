"use client";

import type { ReactNode } from "react";
import { Lock, Pencil } from "lucide-react";
import { Pill, ViewHeader } from "@/components/google-ads/ga-ui";
import { ADVANTAGE_STATES, ATTRIBUTION, BID_STRATEGIES, CONVERSION_EVENTS, CONVERSION_LOCATIONS, OBJECTIVES, OPTIMIZATION_GOALS, SPECIAL_AD_CATEGORIES } from "@/lib/meta-ads/constants";
import { money } from "@/lib/meta-ads/metrics";
import { isLocked, scheduleText } from "@/lib/meta-ads/mutations";
import { useMetaAds } from "@/lib/meta-ads/store";
import type { AdScheduleBlock, MetaBudget } from "@/lib/meta-ads/types";
import { AskButton, Note, Section } from "../ma-common";
import { AdvantageBadge, DeliveryPill, LearningBar } from "../ma-ui";
import { useMa } from "../use-ma";

function Grid({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-8 gap-y-3 p-4 text-xs sm:grid-cols-2 lg:grid-cols-3">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{k}</dt>
          <dd className="mt-0.5 font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const budgetText = (b: MetaBudget | undefined, currency: string) => (b ? `${money(b.amount, currency)} ${b.kind === "DAILY" ? "per day" : "lifetime"}` : "Not set at this level");

function EditButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 rounded-lg border border-border/70 bg-background px-2.5 py-1 text-[11px] font-semibold hover:bg-muted">
      <Pencil className="h-3 w-3" /> {children}
    </button>
  );
}

/** Campaign settings. What shows depends on the objective and on whether Advantage+ is on. */
export function SettingsView() {
  const { data, campaign, currency } = useMa();
  const openDialog = useMetaAds((s) => s.openDialog);
  if (!campaign) return null;
  const locked = isLocked(campaign);
  const ap = campaign.advantageState === "ADVANTAGE_PLUS";
  const rules = (campaign.valueRuleIds ?? []).map((id) => data.valueRules.find((r) => r.id === id)).filter(Boolean);
  const test = data.abTests.find((t) => t.id === campaign.abTestId);

  return (
    <div className="space-y-4">
      <ViewHeader
        title="Campaign settings"
        subtitle={campaign.name}
        actions={
          locked ? (
            <Pill tone="warn">
              <Lock className="h-3 w-3" /> View only
            </Pill>
          ) : (
            <AskButton prompt={`Change the settings of ${campaign.name}`}>Ask the agent to change</AskButton>
          )
        }
      />
      {locked && <Note tone="warn">{campaign.objective === "APP_PROMOTION" ? "App promotion campaigns are view only here." : "Legacy Advantage+ Shopping campaigns can no longer be edited, even in Meta. Create an Advantage+ Sales campaign to replace it."}</Note>}
      <Section title="General" actions={!locked && <EditButton onClick={() => openDialog({ kind: "rename", entity: "CAMPAIGN", id: campaign.id })}>Rename</EditButton>}>
        <Grid
          rows={[
            ["Name", campaign.name],
            ["Objective", OBJECTIVES[campaign.objective].label],
            ["Mode", <span key="m" className="flex items-center gap-1.5">{ADVANTAGE_STATES[campaign.advantageState].label} <AdvantageBadge state={campaign.advantageState} /></span>],
            ["Buying type", campaign.buyingType === "AUCTION" ? "Auction" : "Reservation"],
            ["Status", <DeliveryPill key="d" delivery={campaign.delivery} />],
            ["Special ad categories", campaign.specialAdCategories.length ? campaign.specialAdCategories.map((c) => SPECIAL_AD_CATEGORIES[c]).join(", ") : "None"],
            ["Start", campaign.startDate],
            ["End", campaign.stopDate ?? "No end date"],
            ["Labels", campaign.labels.length ? campaign.labels.join(", ") : "None"],
          ]}
        />
      </Section>
      <Section title="Budget & bidding" actions={!locked && campaign.budget && <EditButton onClick={() => openDialog({ kind: "budget", entity: "CAMPAIGN", id: campaign.id })}>Edit budget</EditButton>}>
        <Grid
          rows={[
            ["Budget", campaign.budget ? `${budgetText(campaign.budget, currency)} (Advantage+ campaign budget)` : "Each ad set has its own budget"],
            ["Bid strategy", BID_STRATEGIES[campaign.bidStrategy].label],
            ["Bid value", campaign.bidValue ? (campaign.bidStrategy === "LOWEST_COST_WITH_MIN_ROAS" ? `${campaign.bidValue}x ROAS` : money(campaign.bidValue, currency)) : "Not set"],
          ]}
        />
        <p className="border-t border-border/40 px-4 py-2.5 text-[11px] text-muted-foreground">Budget changes over 20% restart learning.</p>
      </Section>
      {campaign.objective === "SALES" && ap && (
        <Section title="Advantage+ Sales controls">
          <Grid
            rows={[
              ["Existing customer budget cap", campaign.existingCustomerCap !== undefined ? `${Math.round(campaign.existingCustomerCap * 100)}% of budget` : "No cap: Meta decides"],
              ["Value rules", rules.length ? rules.map((r) => `${r!.name} (${r!.adjustmentPct > 0 ? "+" : ""}${r!.adjustmentPct}%)`).join(", ") : "None applied"],
            ]}
          />
          <p className="border-t border-border/40 px-4 py-2.5 text-[11px] text-muted-foreground">The cap limits how much budget reaches people already in your existing customer audiences. Segments are set in Account settings.</p>
        </Section>
      )}
      {test && (
        <Section title="Experiment">
          <Grid rows={[["A/B test", test.name], ["Status", test.status.toLowerCase()], ["Variable", test.variable.toLowerCase()]]} />
        </Section>
      )}
    </div>
  );
}

/** Read-only 7 x 24 picture of when an ad set runs. Columns are hours, rows are days (Monday first). */
export function ScheduleGrid({ schedule }: { schedule: AdScheduleBlock[] | undefined }) {
  const days = [["Mon", 1], ["Tue", 2], ["Wed", 3], ["Thu", 4], ["Fri", 5], ["Sat", 6], ["Sun", 0]] as const;
  const on = (d: number, h: number) => !schedule?.length || schedule.some((b) => b.days.includes(d) && h >= b.startHour && h < b.endHour);
  return (
    <div className="overflow-x-auto" data-testid="meta-schedule-grid">
      <div className="inline-grid gap-px text-[9px] text-muted-foreground" style={{ gridTemplateColumns: "2rem repeat(24, 1rem)" }}>
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="text-center tabular-nums">{h % 3 === 0 ? h : ""}</span>
        ))}
        {days.map(([label, d]) => (
          <div key={label} className="contents">
            <span className="pr-1 leading-4">{label}</span>
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} title={`${label} ${String(h).padStart(2, "0")}:00`} className={on(d, h) ? "h-4 rounded-[2px] bg-[#400095]/80 dark:bg-violet-500/80" : "h-4 rounded-[2px] bg-muted"} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Ad set settings: optimization, conversion, budget, schedule, audience controls and attribution. */
export function AdSetSettingsView() {
  const { data, adSet, campaign, currency } = useMa();
  const openDialog = useMetaAds((s) => s.openDialog);
  if (!adSet) return null;
  const locked = isLocked(campaign);
  const lifetime = (adSet.budget ?? campaign?.budget)?.kind === "LIFETIME";
  const po = adSet.promotedObject;
  const dataset = data.datasets.find((d) => d.id === po.datasetId);
  return (
    <div className="space-y-4">
      <ViewHeader
        title="Ad set settings"
        subtitle={adSet.name}
        actions={locked ? <Pill tone="warn"><Lock className="h-3 w-3" /> View only</Pill> : <AskButton prompt={`Change the settings of ${adSet.name}`}>Ask the agent to change</AskButton>}
      />
      <Section title="General" actions={!locked && <EditButton onClick={() => openDialog({ kind: "rename", entity: "AD_SET", id: adSet.id })}>Rename</EditButton>}>
        <Grid rows={[["Name", adSet.name], ["Campaign", campaign?.name ?? "-"], ["Delivery", <DeliveryPill key="d" delivery={adSet.delivery} />], ["Start", adSet.startDate], ["End", adSet.endDate ?? "No end date"]]} />
      </Section>
      <Section title="Conversion & optimization">
        <Grid
          rows={[
            ["Conversion location", CONVERSION_LOCATIONS[adSet.conversionLocation]],
            ["Performance goal", OPTIMIZATION_GOALS[adSet.optimizationGoal].label],
            ["Dataset", dataset?.name ?? "—"],
            ["Conversion event", po.event ? CONVERSION_EVENTS[po.event] : "—"],
            ["Attribution setting", ATTRIBUTION[adSet.attribution].label],
            ["Bid strategy", adSet.bidStrategy ? BID_STRATEGIES[adSet.bidStrategy].label : "Inherited from campaign"],
          ]}
        />
      </Section>
      <Section title="Budget & schedule" actions={!locked && adSet.budget && <EditButton onClick={() => openDialog({ kind: "budget", entity: "AD_SET", id: adSet.id })}>Edit budget</EditButton>}>
        <Grid
          rows={[
            ["Budget", adSet.budget ? budgetText(adSet.budget, currency) : `Campaign budget (${budgetText(campaign?.budget, currency)})`],
            ["Frequency cap", adSet.frequencyCap ? `${adSet.frequencyCap.max} per ${adSet.frequencyCap.days} days` : "None"],
            ["Ad schedule", scheduleText(adSet.schedule)],
          ]}
        />
        <div className="space-y-2 border-t border-border/60 p-4">
          <ScheduleGrid schedule={adSet.schedule} />
          {lifetime ? (
            <p className="text-[11px] text-muted-foreground">Dark cells are the hours this ad set runs. Meta spreads the lifetime budget across them.</p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
              <span>Ad scheduling needs a lifetime budget in Meta. This ad set uses a daily budget, so it runs all day.</span>
              {!locked && <AskButton prompt={`Schedule the ads of ${adSet.name} for the best hours`}>Ask about a schedule</AskButton>}
            </div>
          )}
        </div>
      </Section>
      <Section title="Learning phase">
        <div className="p-4">
          <LearningBar learning={adSet.learning} />
          <p className="mt-2 text-[11px] text-muted-foreground">About 50 optimization events in 7 days are needed. Big edits (budget over 20%, audience, optimization goal, creative) restart it.</p>
        </div>
      </Section>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, Pill, Segmented, ViewHeader } from "@/components/google-ads/ga-ui";
import { GaTable, type GaColumn } from "@/components/google-ads/ga-table";
import { SEGMENTS, ageGenderMatrix, isRetargeting, landingPageRows, reachFrequency, segmentRows, type LandingRow, type SegmentRow } from "@/lib/meta-ads/analytics";
import { OBJECTIVES } from "@/lib/meta-ads/constants";
import { adSetBase, dailySeries, derive, formatMetric, money, num, pct } from "@/lib/meta-ads/metrics";
import type { BreakdownKey, MetricKey, Metrics } from "@/lib/meta-ads/types";
import { MaChart } from "../ma-chart";
import { metricColumns } from "../ma-columns";
import { AskButton, Note, Section, ShareBar } from "../ma-common";
import { scopedAdSets, scopedCampaignIds, useMa } from "../use-ma";

function useIds() {
  const ctx = useMa();
  const ids = useMemo(() => scopedCampaignIds(ctx.data, ctx.campaign), [ctx.data, ctx.campaign]);
  return { ...ctx, ids };
}

/** One breakdown as a table with a spend share bar. */
function BreakdownTable({ segment, ids, sort }: { segment: BreakdownKey; ids: string[]; sort?: { id: string; dir: "asc" | "desc" } }) {
  const { data, range, currency, campaign } = useMa();
  const rows = useMemo(() => segmentRows(data, range, segment, ids), [data, range, segment, ids]);
  const max = Math.max(1, ...rows.map((r) => r.base.spend));
  const objective = campaign?.objective;
  const columns: GaColumn<SegmentRow>[] = [
    { id: "label", header: SEGMENTS[segment].label, sticky: true, sortValue: (r) => r.label, render: (r) => <span className="whitespace-nowrap font-medium">{r.label}</span> },
    { id: "share", header: "Share of spend", render: (r) => <div className="w-28"><ShareBar value={r.base.spend} max={max} /></div> },
    ...metricColumns<SegmentRow>((r) => r.metrics, currency, { objective, resultLabel: objective ? OBJECTIVES[objective].resultLabel : undefined, keys: undefined }),
  ];
  return <GaTable rows={rows} columns={columns} rowKey={(r) => r.key} exportName={`breakdown-${segment}`} defaultSort={sort ?? (segment === "day" || segment === "week" || segment === "hour" || segment === "dayOfWeek" ? undefined : { id: "spend", dir: "desc" })} empty="No data for this period." />;
}

// ─── Placements & platforms ─────────────────────────────────────────────────

export function PlacementsView() {
  const { ids, campaign, data } = useIds();
  const [by, setBy] = useState<"platform" | "placement">("platform");
  const advantage = campaign ? campaign.advantageState === "ADVANTAGE_PLUS" : false;
  const manualSets = data.adSets.filter((s) => (!campaign || s.campaignId === campaign.id) && s.status === "ACTIVE" && !s.placements.advantage).length;
  return (
    <div>
      <ViewHeader
        title="Placements & platforms"
        subtitle="Where your ads delivered and what each place cost."
        actions={<AskButton prompt="Which placements waste spend and should I narrow them?">Ask about placements</AskButton>}
      >
        <Segmented value={by} onChange={setBy} size="xs" options={[{ value: "platform", label: "Platform" }, { value: "placement", label: "Placement" }]} />
      </ViewHeader>
      <Note>
        {advantage
          ? "This Advantage+ campaign uses Advantage+ placements: Meta moves budget to where results are cheapest. Numbers are for reading only here, there is nothing to switch."
          : manualSets
            ? `${manualSets} ${manualSets === 1 ? "ad set uses" : "ad sets use"} manual placements. Meta recommends Advantage+ placements unless you have a hard brand reason to exclude a place.`
            : "Ad sets use Advantage+ placements. Meta moves budget to where results are cheapest."}
      </Note>
      <BreakdownTable segment={by} ids={ids} />
    </div>
  );
}

// ─── Demographics ───────────────────────────────────────────────────────────

const HEAT_METRICS: { value: MetricKey; label: string }[] = [
  { value: "spend", label: "Spend" },
  { value: "results", label: "Results" },
  { value: "costPerResult", label: "Cost per result" },
  { value: "ctr", label: "CTR" },
];

export function DemographicsView() {
  const { data, range, currency, ids } = useIds();
  const [metric, setMetric] = useState<MetricKey>("spend");
  const matrix = useMemo(() => ageGenderMatrix(data, range, ids), [data, range, ids]);
  const all = matrix.flatMap((r) => [r.female[metric], r.male[metric]] as number[]);
  const max = Math.max(1e-9, ...all);
  const lowerIsBetter = metric === "costPerResult";
  const shade = (v: number) => {
    if (!v) return undefined;
    const t = v / max;
    const a = lowerIsBetter ? 1 - t * 0.85 : t;
    return `rgba(64,0,149,${(0.08 + a * 0.55).toFixed(2)})`;
  };
  return (
    <div className="space-y-4">
      <ViewHeader title="Demographics" subtitle="Who you reached and who responded. Advantage+ audiences ignore age and gender limits, so use this to learn, not to restrict." actions={<AskButton prompt="What do my demographics say about my audience?">Ask the agent</AskButton>}>
        <Segmented value={metric} onChange={setMetric} size="xs" options={HEAT_METRICS} />
      </ViewHeader>
      <Section title="Age and gender" subtitle={HEAT_METRICS.find((m) => m.value === metric)?.label}>
        <div className="overflow-x-auto p-4">
          <table className="w-full min-w-[420px] text-xs">
            <thead>
              <tr className="text-left text-[11px] text-muted-foreground">
                <th className="pb-2 font-semibold">Age</th>
                <th className="pb-2 font-semibold">Women</th>
                <th className="pb-2 font-semibold">Men</th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((r) => (
                <tr key={r.age}>
                  <td className="py-1 pr-3 font-medium">{r.age}</td>
                  {[r.female, r.male].map((m: Metrics, i) => (
                    <td key={i} className="p-1">
                      <div className="rounded-md px-3 py-2 font-semibold tabular-nums" style={{ background: shade(m[metric]) }}>
                        {m[metric] ? formatMetric(metric, m[metric], currency) : "—"}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="By age">
          <BreakdownTable segment="age" ids={ids} />
        </Section>
        <Section title="By gender">
          <BreakdownTable segment="gender" ids={ids} />
        </Section>
      </div>
    </div>
  );
}

// ─── Trends ─────────────────────────────────────────────────────────────────

export function TrendsView() {
  const { data, range, currency, ids } = useIds();
  const [by, setBy] = useState<"week" | "dayOfWeek" | "hour" | "device">("week");
  const points = useMemo(() => dailySeries(data, range, ids), [data, range, ids]);
  const [metrics, setMetrics] = useState<[MetricKey, MetricKey]>(["spend", "results"]);
  const options: MetricKey[] = ["spend", "results", "costPerResult", "ctr", "cpm", "frequency", "roas"];
  return (
    <div className="space-y-4">
      <ViewHeader title="Trends" subtitle="How results move over time, and when they are best." actions={<AskButton prompt="What trends do you see in my account this month?">Ask the agent</AskButton>} />
      <Card className="p-4">
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          {[0, 1].map((i) => (
            <select key={i} value={metrics[i]} onChange={(e) => setMetrics((m) => (i === 0 ? [e.target.value as MetricKey, m[1]] : [m[0], e.target.value as MetricKey]))} className="h-8 rounded-lg border border-border/70 bg-background px-2 text-xs">
              {options.map((k) => (
                <option key={k} value={k}>
                  {SEGMENT_LABEL(k)}
                </option>
              ))}
            </select>
          ))}
        </div>
        <MaChart points={points} primary={metrics[0]} secondary={metrics[1]} currency={currency} />
      </Card>
      <Segmented value={by} onChange={setBy} size="xs" options={[{ value: "week", label: "Week" }, { value: "dayOfWeek", label: "Day of week" }, { value: "hour", label: "Hour of day" }, { value: "device", label: "Device" }]} />
      {(by === "hour" || by === "dayOfWeek") && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span>Slow hours or days can be switched off with an ad schedule (ad sets with a lifetime budget only).</span>
          <AskButton prompt="Suggest an ad schedule based on my best hours and days">Suggest an ad schedule</AskButton>
        </div>
      )}
      <BreakdownTable segment={by} ids={ids} />
    </div>
  );
}

const SEGMENT_LABEL = (k: MetricKey) => ({ spend: "Amount spent", results: "Results", costPerResult: "Cost per result", ctr: "CTR (link)", cpm: "CPM", frequency: "Frequency", roas: "ROAS" } as Partial<Record<MetricKey, string>>)[k] ?? k;

// ─── Reach & frequency ──────────────────────────────────────────────────────

export function ReachFrequencyView() {
  const { data, range, ids, campaign, currency } = useIds();
  const [cap, setCap] = useState(3);
  const rf = useMemo(() => reachFrequency(data, range, ids, cap), [data, range, ids, cap]);
  const sets = scopedAdSets(data, { campaignId: campaign?.id });
  const chart = rf.curve.map((p) => ({ label: `${p.frequency}+`, share: Math.round(p.reachShare * 100) }));
  const rows = sets.map((s) => ({ s, m: derive(adSetBase(data, s.id, range)), retarget: isRetargeting(data, s) }));
  return (
    <div className="space-y-4">
      <ViewHeader title="Reach & frequency" subtitle="How many people you reached and how often they saw the ads." actions={<AskButton prompt="Is my frequency too high anywhere?">Ask the agent</AskButton>} />
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Reach", num(rf.reach, { compact: true })],
          ["Impressions", num(rf.impressions, { compact: true })],
          ["Frequency", rf.frequency.toFixed(2)],
          [`Impressions beyond ${cap}×`, pct(rf.overCapShare * 100, 0)],
        ].map(([l, v]) => (
          <Card key={l} className="p-4">
            <p className="text-[11px] font-semibold text-muted-foreground">{l}</p>
            <p className="text-2xl font-black tabular-nums">{v}</p>
          </Card>
        ))}
      </div>
      <Section
        title="Share of people reached N or more times"
        actions={
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
            Frequency cap
            <select value={cap} onChange={(e) => setCap(Number(e.target.value))} className="h-7 rounded-md border border-border/70 bg-background px-1.5 text-xs">
              {[2, 3, 4, 5, 7].map((c) => (
                <option key={c} value={c}>
                  {c}×
                </option>
              ))}
            </select>
          </label>
        }
      >
        <div className="p-4" style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(128,128,128,0.2)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis unit="%" tickLine={false} axisLine={false} fontSize={11} width={36} />
              <Tooltip formatter={(v) => `${v}% of people`} />
              <Bar dataKey="share" fill="#400095" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>
      {rf.overCapShare > 0.35 && (
        <Note tone="warn">
          About {pct(rf.overCapShare * 100, 0)} of impressions go to people who already saw the ad {cap}+ times. For prospecting that is waste. For retargeting a higher frequency is normal.
        </Note>
      )}
      <Section title="Frequency by ad set" subtitle={`Spend ${money(rows.reduce((a, r) => a + r.m.spend, 0), currency)}`}>
        <div className="divide-y divide-border/40">
          {rows.map(({ s, m, retarget }) => (
            <div key={s.id} className="grid items-center gap-3 px-4 py-2.5 text-xs md:grid-cols-[minmax(0,1.4fr)_90px_90px_120px]">
              <span className="truncate font-semibold">{s.name}</span>
              <span className="tabular-nums">{m.frequency.toFixed(2)}×</span>
              <span className="tabular-nums text-muted-foreground">{num(m.reach, { compact: true })} reach</span>
              <Pill tone={retarget ? "info" : m.frequency > 3 ? "warn" : "good"}>{retarget ? "Retargeting" : m.frequency > 3 ? "High for prospecting" : "Healthy"}</Pill>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ─── Landing pages ──────────────────────────────────────────────────────────

export function LandingPagesView() {
  const { data, range, currency, scope, campaign } = useIds();
  const rows = useMemo(() => landingPageRows(data, range, scope.adSetId ? [scope.adSetId] : undefined, scope.campaignId), [data, range, scope.adSetId, scope.campaignId]);
  const columns: GaColumn<LandingRow>[] = [
    { id: "url", header: "Destination", sticky: true, sortValue: (r) => r.url, render: (r) => <span className="block max-w-80 truncate font-medium">{r.url}</span> },
    { id: "ads", header: "Ads", align: "right", sortValue: (r) => r.ads, render: (r) => r.ads },
    {
      id: "drop",
      header: "Clicks lost before load",
      align: "right",
      sortValue: (r) => r.dropOff,
      render: (r) => <span className={r.dropOff > 0.3 ? "font-semibold text-red-600" : r.dropOff > 0.2 ? "text-amber-600" : "text-muted-foreground"}>{pct(r.dropOff * 100, 0)}</span>,
    },
    ...metricColumns<LandingRow>((r) => r.metrics as Metrics, currency, { keys: ["spend", "linkClicks", "landingPageViews", "costPerLpv", "results", "costPerResult"], resultLabel: campaign ? OBJECTIVES[campaign.objective].resultLabel : undefined }),
  ];
  const slow = rows.filter((r) => r.dropOff > 0.3);
  return (
    <div>
      <ViewHeader title="Landing pages" subtitle="Where your ads send people. A big gap between clicks and page views usually means a slow or broken page." actions={<AskButton prompt="Which landing pages lose the most clicks?">Ask the agent</AskButton>} />
      {slow.length > 0 && <Note tone="warn">{slow.length} {slow.length === 1 ? "page loses" : "pages lose"} over 30% of clicks before the page loads. Check load speed on mobile.</Note>}
      <GaTable rows={rows} columns={columns} rowKey={(r) => r.url} exportName="landing-pages" defaultSort={{ id: "spend", dir: "desc" }} empty="No destinations yet." />
    </div>
  );
}

// ─── Breakdowns ─────────────────────────────────────────────────────────────

const BREAKDOWNS: BreakdownKey[] = ["day", "week", "dayOfWeek", "hour", "device", "country", "age", "gender", "ageGender", "platform", "placement", "objective"];

/** Free breakdown picker: the one place for any dimension at any scope, including inside an ad set. */
export function BreakdownsView() {
  const { ids, scope, data, range, currency } = useIds();
  const [by, setBy] = useState<BreakdownKey>(scope.adSetId ? "placement" : "day");
  const set = data.adSets.find((s) => s.id === scope.adSetId);
  const available = scope.campaignId ? BREAKDOWNS.filter((b) => b !== "objective") : BREAKDOWNS;
  const total = set ? derive(adSetBase(data, set.id, range)) : null;
  return (
    <div>
      <ViewHeader
        title="Breakdowns"
        subtitle={set ? `${set.name}: splits for the whole campaign this ad set belongs to.` : "Split any result by time, place, device or people."}
        actions={
          <select value={by} onChange={(e) => setBy(e.target.value as BreakdownKey)} className="h-8 rounded-lg border border-border/70 bg-background px-2 text-xs">
            {available.map((b) => (
              <option key={b} value={b}>
                {SEGMENTS[b].label}
              </option>
            ))}
          </select>
        }
      >
        <p className="text-[11px] text-muted-foreground">{SEGMENTS[by].hint}</p>
      </ViewHeader>
      {total && <p className="mb-3 text-xs text-muted-foreground">Ad set total: {money(total.spend, currency)} spent · {num(total.results, { compact: true })} results</p>}
      <BreakdownTable segment={by} ids={ids} />
    </div>
  );
}

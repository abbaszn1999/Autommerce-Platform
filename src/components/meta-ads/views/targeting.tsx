"use client";

import { useMemo, useState } from "react";
import { Check, Globe, Minus, Pencil } from "lucide-react";
import { Card, Pill, Segmented, ViewHeader } from "@/components/google-ads/ga-ui";
import { GaTable, type GaColumn } from "@/components/google-ads/ga-table";
import { adPlacementRowsForSet, segmentRows, placementsOf, type SegmentRow } from "@/lib/meta-ads/analytics";
import { ALL_PLACEMENTS, AUDIENCE_KINDS, OBJECTIVES, PLACEMENTS, PLATFORMS } from "@/lib/meta-ads/constants";
import { num } from "@/lib/meta-ads/metrics";
import { isLocked } from "@/lib/meta-ads/mutations";
import { useMetaAds } from "@/lib/meta-ads/store";
import type { MetaAudience, PlatformKey } from "@/lib/meta-ads/types";
import { metricColumns } from "../ma-columns";
import { AskButton, Note, Section, Stat, SummaryStrip, ShareBar } from "../ma-common";
import { scopedAdSets, scopedCampaignIds, useMa } from "../use-ma";

const STATUS_TONE = { READY: "good", POPULATING: "info", TOO_SMALL: "warn" } as const;

// ─── Audiences ──────────────────────────────────────────────────────────────

export function AudiencesView() {
  const { data, campaign } = useMa();
  const sets = scopedAdSets(data, { campaignId: campaign?.id });
  const advantagePlus = campaign?.advantageState === "ADVANTAGE_PLUS";
  const usage = (a: MetaAudience) => {
    const inc = sets.filter((s) => s.targeting.includeAudienceIds.includes(a.id)).length;
    const exc = sets.filter((s) => s.targeting.excludeAudienceIds.includes(a.id)).length;
    return { inc, exc };
  };
  const rows = campaign ? data.audiences.filter((a) => usage(a).inc + usage(a).exc > 0) : data.audiences;

  const columns: GaColumn<MetaAudience>[] = [
    { id: "name", header: "Audience", sticky: true, sortValue: (a) => a.name, render: (a) => <span className="font-semibold">{a.name}</span>, total: <span>{rows.length} audiences</span> },
    { id: "kind", header: "Type", sortValue: (a) => a.kind, render: (a) => <span className="whitespace-nowrap text-muted-foreground">{AUDIENCE_KINDS[a.kind].label}{a.lookalikePct ? ` · ${a.lookalikePct}%` : ""}</span> },
    { id: "size", header: "Size", align: "right", sortValue: (a) => a.size, render: (a) => <span>{num(a.size, { compact: true })}</span> },
    { id: "status", header: "Status", render: (a) => <Pill tone={STATUS_TONE[a.status]}>{a.status === "READY" ? "Ready" : a.status === "POPULATING" ? "Populating" : "Too small"}</Pill> },
    { id: "source", header: "Source", render: (a) => <span className="block max-w-56 truncate text-muted-foreground">{a.source}</span> },
    {
      id: "used",
      header: advantagePlus ? "Used as" : "Used in",
      render: (a) => {
        const u = usage(a);
        if (!u.inc && !u.exc) return <span className="text-muted-foreground/60">Not used</span>;
        return (
          <span className="flex gap-1">
            {u.inc > 0 && <Pill tone="good">{advantagePlus ? "Suggestion" : "Include"} · {u.inc}</Pill>}
            {u.exc > 0 && <Pill tone="bad">Exclude · {u.exc}</Pill>}
          </span>
        );
      },
    },
  ];

  return (
    <div>
      <ViewHeader
        title="Audiences"
        subtitle={campaign ? `Audiences used by ${campaign.name}.` : "Custom, lookalike and saved audiences in this ad account."}
        actions={<AskButton primary prompt="Create a lookalike audience from my best customers">Create audience</AskButton>}
      />
      {advantagePlus && (
        <Note>
          This is an Advantage+ campaign. <b>Audience suggestions</b> only give Meta a starting point; they are not limits. Exclusions still apply. {campaign?.existingCustomerCap !== undefined && <>Existing customers can take up to {Math.round(campaign.existingCustomerCap * 100)}% of budget.</>}
        </Note>
      )}
      <GaTable rows={rows} columns={columns} rowKey={(a) => a.id} exportName="audiences" empty={campaign ? "This campaign uses broad targeting with no custom audiences." : "No audiences yet."} />
    </div>
  );
}

// ─── Locations & languages ──────────────────────────────────────────────────

export function LocationsView() {
  const { data, range, currency, campaign } = useMa();
  const ids = useMemo(() => scopedCampaignIds(data, campaign), [data, campaign]);
  const rows = useMemo(() => segmentRows(data, range, "country", ids), [data, range, ids]);
  const sets = scopedAdSets(data, { campaignId: campaign?.id });
  const max = Math.max(1, ...rows.map((r) => r.base.spend));
  const columns: GaColumn<SegmentRow>[] = [
    { id: "label", header: "Country", sticky: true, sortValue: (r) => r.label, render: (r) => <span className="whitespace-nowrap font-medium">{r.label}</span> },
    { id: "share", header: "Share of spend", render: (r) => <div className="w-28"><ShareBar value={r.base.spend} max={max} /></div> },
    ...metricColumns<SegmentRow>((r) => r.metrics, currency, { objective: campaign?.objective, resultLabel: campaign ? OBJECTIVES[campaign.objective].resultLabel : undefined }),
  ];
  return (
    <div className="space-y-4">
      <ViewHeader title="Locations & languages" subtitle="Where ads can show, where they delivered, and the languages targeted." actions={<AskButton prompt="Which countries should I add or exclude?">Ask the agent</AskButton>} />
      <Section title="Delivery by country">
        <GaTable rows={rows} columns={columns} rowKey={(r) => r.key} exportName="locations" defaultSort={{ id: "spend", dir: "desc" }} empty="No data for this period." />
      </Section>
      <Section title="Targeting by ad set">
        <div className="divide-y divide-border/40">
          {sets.map((s) => (
            <div key={s.id} className="grid gap-2 px-4 py-3 text-xs md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(0,1fr)]">
              <span className="truncate font-semibold">{s.name}</span>
              <span className="flex flex-wrap gap-1">
                {s.targeting.locations.map((l) => (
                  <Pill key={l.id} tone={l.excluded ? "bad" : "neutral"}>
                    <Globe className="h-2.5 w-2.5" /> {l.excluded ? "Not " : ""}
                    {l.name}
                  </Pill>
                ))}
              </span>
              <span className="text-muted-foreground">{s.targeting.languages.length ? s.targeting.languages.join(", ") : "All languages"}</span>
            </div>
          ))}
          {!sets.length && <p className="px-4 py-6 text-center text-xs text-muted-foreground">No ad sets yet.</p>}
        </div>
      </Section>
    </div>
  );
}

// ─── Ad set: audience ───────────────────────────────────────────────────────

export function AdSetAudienceView() {
  const { data, adSet, campaign } = useMa();
  const openDialog = useMetaAds((s) => s.openDialog);
  if (!adSet) return null;
  const t = adSet.targeting;
  const locked = isLocked(campaign);
  const name = (id: string) => data.audiences.find((a) => a.id === id)?.name ?? id;
  return (
    <div className="space-y-4">
      <ViewHeader
        title="Audience"
        subtitle={`${adSet.name}: who this ad set can reach.`}
        actions={
          <>
            {!locked && (
              <button type="button" onClick={() => openDialog({ kind: "exclusions", adSetId: adSet.id })} className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted">
                <Pencil className="h-3 w-3" /> Edit exclusions
              </button>
            )}
            <AskButton prompt={`Review the audience of ${adSet.name}`}>Ask the agent</AskButton>
          </>
        }
      />
      <SummaryStrip>
        <Stat label="Audience control">{t.advantageAudience ? <Pill tone="brand">Advantage+ audience</Pill> : <Pill>Manual targeting</Pill>}</Stat>
        <Stat label="Age">{t.advantageAudience ? `${t.ageMin}–${t.ageMax} as a suggestion` : `${t.ageMin}–${t.ageMax}`}</Stat>
        <Stat label="Gender">{t.genders === "ALL" ? "All" : t.genders === "MEN" ? "Men" : "Women"}</Stat>
        <Stat label="Languages">{t.languages.length ? t.languages.join(", ") : "All"}</Stat>
      </SummaryStrip>
      {t.advantageAudience && <Note>Advantage+ audience lets Meta find people beyond these suggestions. Only locations, a minimum age and exclusions are hard limits.</Note>}
      <div className="grid gap-4 md:grid-cols-2">
        <Section title={t.advantageAudience ? "Audience suggestions" : "Included audiences"}>
          <ul className="space-y-1.5 p-4 text-xs">
            {t.includeAudienceIds.map((id) => (
              <li key={id} className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-emerald-600" /> {name(id)}
              </li>
            ))}
            {t.detailed.map((d) => (
              <li key={d} className="flex items-center gap-2 text-muted-foreground">
                <Minus className="h-3.5 w-3.5" /> Interest: {d}
              </li>
            ))}
            {!t.includeAudienceIds.length && !t.detailed.length && <li className="text-muted-foreground">Broad: no audience limits.</li>}
          </ul>
        </Section>
        <Section title="Excluded audiences">
          <ul className="space-y-1.5 p-4 text-xs">
            {t.excludeAudienceIds.map((id) => (
              <li key={id} className="flex items-center gap-2">
                <Minus className="h-3.5 w-3.5 text-red-600" /> {name(id)}
              </li>
            ))}
            {!t.excludeAudienceIds.length && <li className="text-muted-foreground">Nobody excluded.</li>}
          </ul>
        </Section>
      </div>
      <Section title="Locations">
        <div className="flex flex-wrap gap-1.5 p-4">
          {t.locations.map((l) => (
            <Pill key={l.id} tone={l.excluded ? "bad" : "neutral"}>
              {l.excluded ? "Not " : ""}
              {l.name} <span className="opacity-60">({l.kind})</span>
            </Pill>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ─── Ad set: placements ─────────────────────────────────────────────────────

export function AdSetPlacementsView() {
  const { data, range, currency, adSet, campaign } = useMa();
  const [by, setBy] = useState<"overview" | "results">("overview");
  const rows = useMemo(() => (adSet ? adPlacementRowsForSet(data, adSet, range) : []), [data, adSet, range]);
  if (!adSet) return null;
  const selected = new Set(placementsOf(adSet));
  const platforms = Object.keys(PLATFORMS) as PlatformKey[];
  const columns: GaColumn<SegmentRow>[] = [
    { id: "label", header: "Placement", sticky: true, sortValue: (r) => r.label, render: (r) => <span className="whitespace-nowrap font-medium">{r.label}</span> },
    ...metricColumns<SegmentRow>((r) => r.metrics, currency, { keys: ["spend", "impressions", "ctr", "cpm", "results", "costPerResult"], resultLabel: campaign ? OBJECTIVES[campaign.objective].resultLabel : undefined }),
  ];
  return (
    <div className="space-y-4">
      <ViewHeader title="Placements" subtitle={`${adSet.name}: where its ads can show.`} actions={<AskButton prompt={`Should ${adSet.name} use manual placements?`}>Ask the agent</AskButton>}>
        <Segmented value={by} onChange={setBy} size="xs" options={[{ value: "overview", label: "Setup" }, { value: "results", label: "Results" }]} />
      </ViewHeader>
      {by === "overview" ? (
        <>
          <Note>
            {adSet.placements.advantage
              ? "Advantage+ placements: ads can show in every available place and Meta moves budget to where it works. Recommended."
              : "Manual placements: ads only show in the places ticked below. Fewer places means fewer chances to find cheap results."}
          </Note>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {platforms.map((p) => {
              const keys = ALL_PLACEMENTS.filter((k) => PLACEMENTS[k].platform === p);
              return (
                <Card key={p} className="p-4">
                  <p className="mb-2 flex items-center gap-2 text-sm font-bold">
                    <span className="h-2 w-2 rounded-full" style={{ background: PLATFORMS[p].color }} />
                    {PLATFORMS[p].label}
                  </p>
                  <ul className="space-y-1.5">
                    {keys.map((k) => (
                      <li key={k} className="flex items-center gap-2 text-xs">
                        {selected.has(k) ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Minus className="h-3.5 w-3.5 text-muted-foreground/50" />}
                        <span className={selected.has(k) ? "" : "text-muted-foreground/60"}>{PLACEMENTS[k].label}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>
        </>
      ) : (
        <GaTable rows={rows} columns={columns} rowKey={(r) => r.key} defaultSort={{ id: "spend", dir: "desc" }} empty="No placement data yet." />
      )}
    </div>
  );
}

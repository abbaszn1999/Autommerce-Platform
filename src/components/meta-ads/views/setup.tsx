"use client";

import { Activity, AlertTriangle, CalendarClock, CheckCircle2, ExternalLink, Lock, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, Pill, ViewHeader } from "@/components/google-ads/ga-ui";
import { GaTable, type GaColumn } from "@/components/google-ads/ga-table";
import { AUDIENCE_KINDS, CONTENT_EXCLUSIONS, INVENTORY_FILTERS } from "@/lib/meta-ads/constants";
import { money, num } from "@/lib/meta-ads/metrics";
import type { BlockList, ContentExclusion, CustomConversion, Dataset, DatasetEvent, InventoryFilter, LinkedAsset, PolicyIssue, ValueRule } from "@/lib/meta-ads/types";
import { runAgentTurn } from "@/lib/meta-ads/agent-runner";
import { AskButton, Note, Section, Stat, SummaryStrip, timeAgo } from "../ma-common";
import { useMa } from "../use-ma";

// ─── Events Manager ─────────────────────────────────────────────────────────

const EVENT_TONE = { ACTIVE: "good", WARNING: "warn", INACTIVE: "bad" } as const;

function Emq({ value }: { value: number }) {
  const tone = value >= 8 ? "bg-emerald-500" : value >= 6 ? "bg-amber-500" : "bg-red-500";
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
        <span className={cn("block h-full rounded-full", tone)} style={{ width: `${value * 10}%` }} />
      </span>
      <span className="tabular-nums font-semibold">{value.toFixed(1)}</span>
    </span>
  );
}

export function EventsManagerView() {
  const { data } = useMa();
  const eventColumns = (): GaColumn<DatasetEvent>[] => [
    { id: "name", header: "Event", sticky: true, sortValue: (e) => e.name, render: (e) => <span className="font-semibold">{e.name}</span> },
    { id: "count", header: "Last 7 days", align: "right", sortValue: (e) => e.count7d, render: (e) => num(e.count7d) },
    { id: "emq", header: "Match quality (0–10)", sortValue: (e) => e.emq, render: (e) => <Emq value={e.emq} /> },
    { id: "browser", header: "Browser", align: "right", render: (e) => `${Math.round(e.browserShare * 100)}%` },
    { id: "server", header: "Server (CAPI)", align: "right", render: (e) => `${Math.round(e.serverShare * 100)}%` },
    { id: "dedup", header: "Deduplicated", align: "right", sortValue: (e) => e.dedup, render: (e) => <span className={e.dedup < 0.8 && e.serverShare > 0 ? "font-semibold text-amber-600" : ""}>{Math.round(e.dedup * 100)}%</span> },
    { id: "status", header: "Status", render: (e) => <Pill tone={EVENT_TONE[e.status]}>{e.status.toLowerCase()}</Pill> },
    { id: "issue", header: "Issue", render: (e) => <span className="block max-w-72 truncate text-muted-foreground">{e.issue ?? "—"}</span> },
  ];
  const conversionColumns: GaColumn<CustomConversion>[] = [
    { id: "name", header: "Custom conversion", sticky: true, render: (c) => <span className="font-semibold">{c.name}</span> },
    { id: "rule", header: "Rule", render: (c) => <span className="text-muted-foreground">{c.rule}</span> },
    { id: "base", header: "Base event", render: (c) => c.baseEvent },
    { id: "count", header: "Last 7 days", align: "right", sortValue: (c) => c.count7d, render: (c) => num(c.count7d) },
    { id: "status", header: "Status", render: (c) => <Pill tone={c.status === "ACTIVE" ? "good" : "neutral"}>{c.status.toLowerCase()}</Pill> },
  ];
  const weak = data.datasets.flatMap((d) => d.events.filter((e) => e.emq < 6));
  return (
    <div className="space-y-4">
      <ViewHeader title="Events Manager" subtitle="The data Meta learns from: Pixel, Conversions API and how well events match people." actions={<AskButton primary prompt="Check my Pixel, Conversions API and Event Match Quality">Run a check</AskButton>} />
      {weak.length > 0 && (
        <Note tone="warn" icon={<AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-amber-600" />}>
          {weak.length} {weak.length === 1 ? "event has" : "events have"} match quality under 6 ({weak.map((e) => e.name).join(", ")}). Sending email, phone and the browser ID through the Conversions API usually lifts it.
        </Note>
      )}
      {data.datasets.map((d: Dataset) => (
        <Section
          key={d.id}
          title={d.name}
          subtitle={`Pixel ${d.pixelId} · last event ${timeAgo(d.lastReceived)}`}
          actions={
            <span className="flex gap-1.5">
              <Pill tone="good">
                <Activity className="h-3 w-3" /> Pixel
              </Pill>
              <Pill tone={d.capiConnected ? "good" : "bad"}>{d.capiConnected ? `CAPI · ${d.capiSource}` : "CAPI not connected"}</Pill>
            </span>
          }
        >
          <GaTable rows={d.events} columns={eventColumns()} rowKey={(e) => e.name} empty="No events received." />
        </Section>
      ))}
      <Section title="Custom conversions">
        <GaTable rows={data.customConversions} columns={conversionColumns} rowKey={(c) => c.id} empty="No custom conversions." />
      </Section>
    </div>
  );
}

// ─── Linked assets ──────────────────────────────────────────────────────────

const ASSET_LABEL: Record<LinkedAsset["kind"], string> = { PAGE: "Facebook Page", INSTAGRAM: "Instagram account", WHATSAPP: "WhatsApp", CATALOG: "Catalog", DATASET: "Dataset", APP: "App", DOMAIN: "Domain" };

export function LinkedAssetsView() {
  const { data } = useMa();
  const columns: GaColumn<LinkedAsset>[] = [
    { id: "kind", header: "Type", sortValue: (a) => a.kind, render: (a) => <span className="whitespace-nowrap font-medium">{ASSET_LABEL[a.kind]}</span> },
    { id: "name", header: "Name", sticky: true, sortValue: (a) => a.name, render: (a) => <span className="font-semibold">{a.name}</span> },
    { id: "id", header: "ID", render: (a) => <span className="font-mono text-[11px] text-muted-foreground">{a.externalId}</span> },
    { id: "status", header: "Status", sortValue: (a) => a.status, render: (a) => <Pill tone={a.status === "CONNECTED" ? "good" : a.status === "NEEDS_ACTION" ? "warn" : "neutral"}>{a.status === "CONNECTED" ? "Connected" : a.status === "NEEDS_ACTION" ? "Needs action" : "Unverified"}</Pill> },
    { id: "detail", header: "Detail", render: (a) => <span className="block max-w-96 truncate text-muted-foreground">{a.detail}</span> },
  ];
  return (
    <div>
      <ViewHeader title="Linked assets" subtitle="Pages, Instagram accounts, catalogs, datasets and domains this ad account is connected to." actions={<AskButton prompt="Are all my linked assets set up correctly?">Check assets</AskButton>} />
      <Note>Linking and unlinking happens in Meta Business Settings, because it needs your permission as an admin. The agent reads this list and tells you what is missing.</Note>
      <GaTable rows={data.linkedAssets} columns={columns} rowKey={(a) => a.id} empty="Nothing linked yet." />
    </div>
  );
}

// ─── Account quality ────────────────────────────────────────────────────────

const POLICY_TONE = { REJECTED: "bad", LIMITED: "warn", RESTRICTED: "bad", IN_REVIEW: "info", RESOLVED: "good" } as const;

export function AccountQualityView() {
  const { data } = useMa();
  const open = data.policyIssues.filter((p) => p.status !== "RESOLVED");
  const columns: GaColumn<PolicyIssue>[] = [
    { id: "level", header: "Level", sortValue: (p) => p.level, render: (p) => <Pill>{p.level.toLowerCase()}</Pill> },
    { id: "entity", header: "Affected", sticky: true, sortValue: (p) => p.entityName, render: (p) => <span className="block max-w-56 truncate font-semibold">{p.entityName}</span> },
    { id: "policy", header: "Policy", render: (p) => <span className="whitespace-nowrap">{p.policy}</span> },
    { id: "reason", header: "Why", render: (p) => <span className="block max-w-96 text-muted-foreground">{p.reason}</span> },
    { id: "status", header: "Status", sortValue: (p) => p.status, render: (p) => <Pill tone={POLICY_TONE[p.status]}>{p.reviewRequested && p.status !== "RESOLVED" ? "Review requested" : p.status.toLowerCase().replace("_", " ")}</Pill> },
    { id: "at", header: "Detected", sortValue: (p) => p.detectedAt, render: (p) => <span className="whitespace-nowrap text-muted-foreground">{timeAgo(p.detectedAt)}</span> },
    {
      id: "action",
      header: "",
      render: (p) =>
        p.status === "RESOLVED" || p.reviewRequested || p.status === "IN_REVIEW" ? null : (
          <button
            type="button"
            onClick={() => runAgentTurn(`Request a review for "${p.entityName}"`)}
            className="whitespace-nowrap rounded-lg border border-border/70 px-2.5 py-1 text-[11px] font-semibold hover:bg-muted"
          >
            Request review
          </button>
        ),
    },
  ];
  return (
    <div className="space-y-4">
      <ViewHeader title="Account quality" subtitle="Policy status of the account, Page and every ad. Fix the cause before asking for a review." actions={<AskButton primary prompt="Why were my ads rejected and how do I fix them?">Explain issues</AskButton>} />
      <SummaryStrip>
        <Stat label="Ad account">
          <Pill tone={data.billing.accountStatus === "ACTIVE" ? "good" : "bad"}>{data.billing.accountStatus.toLowerCase()}</Pill>
        </Stat>
        <Stat label="Open issues">{open.length}</Stat>
        <Stat label="Ads rejected">{data.ads.filter((a) => a.review === "REJECTED").length}</Stat>
        <Stat label="Ads limited">{data.ads.filter((a) => a.review === "LIMITED").length}</Stat>
        <Stat label="Special ad categories">{data.campaigns.some((c) => c.specialAdCategories.length) ? "In use" : "None"}</Stat>
      </SummaryStrip>
      {open.length === 0 && (
        <Note tone="good" icon={<CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald-600" />}>
          Nothing needs attention. Your account is in good standing.
        </Note>
      )}
      <Note>Asking for a review goes through the agent, and you approve it first. Repeated reviews without a fix can hurt account standing.</Note>
      <GaTable rows={data.policyIssues} columns={columns} rowKey={(p) => p.id} defaultSort={{ id: "at", dir: "desc" }} empty="No policy issues." />
    </div>
  );
}

// ─── Brand safety ───────────────────────────────────────────────────────────

/** Block lists: publishers, apps and sites the ads never appear on, whoever is watching. */
const BLOCK_LIST_COLUMNS: GaColumn<BlockList>[] = [
  { id: "name", header: "Block list", sticky: true, sortValue: (b) => b.name, render: (b) => <span className="font-semibold">{b.name}</span> },
  { id: "kind", header: "Type", render: (b) => <Pill>{b.kind.toLowerCase()}</Pill> },
  { id: "entries", header: "Entries", align: "right", sortValue: (b) => b.entries.length, render: (b) => b.entries.length },
  { id: "list", header: "Blocked", render: (b) => <span className="block max-w-96 truncate text-muted-foreground">{b.entries.join(", ")}</span> },
  { id: "applies", header: "Applies to", render: (b) => <Pill tone={b.appliesTo === "ACCOUNT" ? "brand" : "neutral"}>{b.appliesTo === "ACCOUNT" ? "Whole account" : "Some campaigns"}</Pill> },
];

export function BrandSafetyView() {
  const { data } = useMa();
  const bs = data.brandSafety;
  const setFilter = (f: InventoryFilter) => {
    if (f !== bs.inventoryFilter) runAgentTurn(`Set my brand safety inventory filter to "${INVENTORY_FILTERS[f].label}"`);
  };
  const toggle = (c: ContentExclusion) => runAgentTurn(`${bs.excluded.includes(c) ? "Allow" : "Exclude"} "${CONTENT_EXCLUSIONS[c]}" in my brand safety settings`);
  return (
    <div className="space-y-4">
      <ViewHeader title="Brand safety" subtitle="Control the content your ads can appear next to." actions={<AskButton prompt="Review my brand safety settings">Ask the agent</AskButton>} />
      <Note>Click an option and the agent prepares the change for your approval. Stricter settings reduce reach and usually raise CPM.</Note>
      <Section title="Inventory filter">
        <div className="grid gap-3 p-4 md:grid-cols-3">
          {(Object.keys(INVENTORY_FILTERS) as InventoryFilter[]).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)} className={cn("rounded-xl border p-3 text-left transition-colors", bs.inventoryFilter === f ? "border-[#400095] bg-[#400095]/5" : "border-border/60 hover:bg-muted/40")}>
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <ShieldCheck className={cn("h-4 w-4", bs.inventoryFilter === f ? "text-[#400095]" : "text-muted-foreground")} />
                {INVENTORY_FILTERS[f].label}
              </span>
              <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">{INVENTORY_FILTERS[f].blurb}</span>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Topic exclusions" subtitle="Where ads should not show">
        <div className="flex flex-wrap gap-2 p-4">
          {(Object.keys(CONTENT_EXCLUSIONS) as ContentExclusion[]).map((c) => {
            const on = bs.excluded.includes(c);
            return (
              <button key={c} type="button" onClick={() => toggle(c)} className={cn("rounded-full border px-3 py-1.5 text-xs font-medium", on ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400" : "border-border/70 hover:bg-muted")}>
                {on ? "Excluded: " : ""}
                {CONTENT_EXCLUSIONS[c]}
              </button>
            );
          })}
        </div>
      </Section>
      <Section
        title="Block lists"
        subtitle="Publishers, apps and sites your ads never appear on (Audience Network and in-stream), whoever is watching"
        actions={<AskButton prompt="Add the publishers and apps that waste spend to a block list">Update block lists</AskButton>}
      >
        <GaTable rows={data.blockLists} columns={BLOCK_LIST_COLUMNS} rowKey={(b) => b.id} empty="No block lists yet." />
      </Section>
    </div>
  );
}

// ─── Billing & spending limit (view only) ───────────────────────────────────

const META_BILLING = "https://business.facebook.com/billing_hub";

export function BillingView() {
  const { data, currency } = useMa();
  const b = data.billing;
  const used = b.spendLimit > 0 ? b.amountSpent / b.spendLimit : 0;
  return (
    <div className="space-y-4">
      <ViewHeader title="Billing & spending limit" subtitle="View only. Payment methods and limits are controlled in Meta Billing." actions={
        <a href={META_BILLING} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted">
          Open Meta Billing <ExternalLink className="h-3 w-3" />
        </a>
      } />
      <Note tone="warn" icon={<Lock className="mt-0.5 h-3.5 w-3.5 text-amber-600" />}>
        <b>The agent can never change billing.</b> It cannot add or remove a payment method, change the spending limit or pay a balance. If you ask, it explains the numbers below and points you to Meta Billing.
      </Note>
      <SummaryStrip>
        <Stat label="Account status">
          <Pill tone={b.accountStatus === "ACTIVE" ? "good" : "bad"}>{b.accountStatus.toLowerCase()}</Pill>
        </Stat>
        <Stat label="Payment method">
          {b.paymentLabel ?? (
            <a href={META_BILLING} target="_blank" rel="noreferrer" title="Meta only shares the payment method with people who can manage this ad account" className="inline-flex items-center gap-1 text-[#400095] hover:underline dark:text-violet-300">
              See Meta Billing <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </Stat>
        <Stat label="Balance due">{money(b.balanceDue, currency, { decimals: 2 })}</Stat>
      </SummaryStrip>
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">Next charge and billing threshold</p>
          <p className="text-[11px] text-muted-foreground">Meta doesn&apos;t share when you&apos;ll be charged next or your billing threshold with apps. Check them in Meta Billing.</p>
        </div>
        <a href={META_BILLING} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted">
          Check your next charge <ExternalLink className="h-3 w-3" />
        </a>
      </Card>
      <Card className="p-4">
        <div className="mb-2 flex items-end justify-between">
          <div>
            <p className="text-sm font-bold">Account spending limit</p>
            <p className="text-[11px] text-muted-foreground">Ads stop for good when the total spent reaches the limit.</p>
          </div>
          <p className="text-sm font-black tabular-nums">
            {money(b.amountSpent, currency)} <span className="font-medium text-muted-foreground">of {b.spendLimit ? money(b.spendLimit, currency) : "no limit"}</span>
          </p>
        </div>
        {b.spendLimit > 0 && (
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", used > 0.9 ? "bg-red-500" : used > 0.75 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${Math.min(100, used * 100)}%` }} />
          </div>
        )}
        {used > 0.85 && <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400">{Math.round(used * 100)}% used. Raise the limit in Meta Billing before delivery stops.</p>}
      </Card>
      <AskButton prompt="Explain my billing and spending limit">Ask the agent to explain</AskButton>
    </div>
  );
}

// ─── Account settings (segments, value rules) ───────────────────────────────

export function AccountSettingsView() {
  const { data } = useMa();
  const seg = data.audienceSegments;
  const toggleSeg = (key: "existingCustomerAudienceIds" | "engagedAudienceIds", id: string) => {
    const name = data.audiences.find((a) => a.id === id)?.name ?? id;
    const group = key === "existingCustomerAudienceIds" ? "existing customer" : "engaged";
    runAgentTurn(seg[key].includes(id) ? `Remove the audience "${name}" from my ${group} audiences` : `Add the audience "${name}" to my ${group} audiences`);
  };
  const toggleRule = (r: ValueRule) => runAgentTurn(`${r.status === "ACTIVE" ? "Pause" : "Activate"} the value rule "${r.name}"`);
  const rules: GaColumn<ValueRule>[] = [
    { id: "name", header: "Rule", sticky: true, render: (r) => <span className="font-semibold">{r.name}</span> },
    { id: "dim", header: "Dimension", render: (r) => <Pill>{r.dimension.toLowerCase()}</Pill> },
    { id: "match", header: "When", render: (r) => <span className="text-muted-foreground">{r.match}</span> },
    { id: "adj", header: "Bid adjustment", align: "right", sortValue: (r) => r.adjustmentPct, render: (r) => <span className={cn("font-semibold", r.adjustmentPct > 0 ? "text-emerald-600" : "text-red-600")}>{r.adjustmentPct > 0 ? "+" : ""}{r.adjustmentPct}%</span> },
    { id: "status", header: "Status", render: (r) => <Pill tone={r.status === "ACTIVE" ? "good" : "neutral"}>{r.status.toLowerCase()}</Pill> },
    { id: "act", header: "", render: (r) => <button type="button" onClick={() => toggleRule(r)} className="rounded-lg border border-border/70 px-2.5 py-1 text-[11px] font-semibold hover:bg-muted">{r.status === "ACTIVE" ? "Pause" : "Activate"}</button> },
  ];
  const audienceList = (k: "existingCustomerAudienceIds" | "engagedAudienceIds") => (
    <ul className="max-h-56 space-y-1 overflow-y-auto p-3">
      {data.audiences.map((a) => (
        <li key={a.id}>
          <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs hover:bg-muted/50">
            <input type="checkbox" checked={seg[k].includes(a.id)} onChange={() => toggleSeg(k, a.id)} className="h-3.5 w-3.5 accent-[#400095]" />
            <span className="flex-1 truncate font-medium">{a.name}</span>
            <span className="text-[10px] text-muted-foreground">{AUDIENCE_KINDS[a.kind].label}</span>
          </label>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="space-y-4">
      <ViewHeader title="Account settings" subtitle="Identity, audience segments and value rules for this ad account." />
      <Section title="Account">
        <dl className="grid gap-3 p-4 text-xs sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Name", data.account.name],
            ["Ad account ID", data.account.accountId],
            ["Currency", data.account.currency],
            ["Time zone", data.account.timeZone],
            ["Business portfolio", data.portfolio.name],
            ["Page", data.linkedAssets.find((a) => a.kind === "PAGE")?.name ?? "-"],
            ["Instagram", data.linkedAssets.find((a) => a.kind === "INSTAGRAM")?.name ?? "-"],
            ["Dataset", data.datasets[0]?.name ?? "-"],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{k}</dt>
              <dd className="mt-0.5 font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>
      <Note>Click an audience or a rule and the agent prepares the change for your approval.</Note>
      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Existing customers" subtitle="Advantage+ Sales caps spend on these people (existing customer budget cap)">
          {audienceList("existingCustomerAudienceIds")}
        </Section>
        <Section title="Engaged audiences" subtitle="People who already know you, so Advantage+ can treat them as engaged">
          {audienceList("engagedAudienceIds")}
        </Section>
      </div>
      <Section title="Value rules" subtitle="Bid more for people worth more, less for people worth less" actions={<AskButton prompt="Suggest value rules for my account">Suggest rules</AskButton>}>
        <GaTable rows={data.valueRules} columns={rules} rowKey={(r) => r.id} empty="No value rules yet." />
      </Section>
    </div>
  );
}

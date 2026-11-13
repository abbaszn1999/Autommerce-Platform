"use client";

import { Bell, Bot, User } from "lucide-react";
import { Pill, ViewHeader } from "@/components/google-ads/ga-ui";
import { Toggle } from "@/components/google-ads/ga-ui";
import { GaTable, type GaColumn } from "@/components/google-ads/ga-table";
import { runAgentTurn } from "@/lib/meta-ads/agent-runner";
import { useMetaAds } from "@/lib/meta-ads/store";
import type { MetaRule, RuleMetric } from "@/lib/meta-ads/types";
import { AskButton, Section, timeAgo } from "../ma-common";
import { useMa } from "../use-ma";

const METRIC_LABEL: Record<RuleMetric, string> = { spend: "Amount spent", costPerResult: "Cost per result", roas: "ROAS", ctr: "CTR", frequency: "Frequency", cpm: "CPM", results: "Results" };
const WINDOW: Record<MetaRule["condition"]["window"], string> = { LAST_3_DAYS: "last 3 days", LAST_7_DAYS: "last 7 days", LIFETIME: "lifetime" };
const ACTION: Record<MetaRule["action"], string> = { NOTIFY: "Notify me", PAUSE: "Pause", INCREASE_BUDGET: "Raise budget", DECREASE_BUDGET: "Lower budget" };

/** Automated rules and the alerts they raise. Switching a rule is a request to the agent, like every other change. */
export function RulesView() {
  const { data } = useMa();
  const markRead = useMetaAds((s) => s.markAlertsRead);

  const toggle = (r: MetaRule) => runAgentTurn(`Turn ${r.enabled ? "off" : "on"} the rule "${r.name}"`);

  const columns: GaColumn<MetaRule>[] = [
    { id: "name", header: "Rule", sticky: true, sortValue: (r) => r.name, render: (r) => <span className="block max-w-56 truncate font-semibold">{r.name}</span> },
    { id: "scope", header: "Applies to", render: (r) => <span className="whitespace-nowrap text-muted-foreground">{r.scope === "ACCOUNT" ? "Whole account" : `${r.scope.replace("_", " ").toLowerCase()}${r.campaignId ? `: ${data.campaigns.find((c) => c.id === r.campaignId)?.name ?? ""}` : "s"}`}</span> },
    { id: "cond", header: "When", render: (r) => <span className="whitespace-nowrap">{METRIC_LABEL[r.condition.metric]} {r.condition.op} {r.condition.value} ({WINDOW[r.condition.window]})</span> },
    { id: "action", header: "Then", render: (r) => <span className="whitespace-nowrap">{ACTION[r.action]}{r.amountPct ? ` ${r.amountPct}%` : ""}</span> },
    { id: "schedule", header: "Checks", render: (r) => <Pill>{r.schedule === "CONTINUOUS" ? "Continuously" : "Daily"}</Pill> },
    { id: "by", header: "By", render: (r) => (r.createdBy === "AGENT" ? <Pill tone="brand"><Bot className="h-3 w-3" /> Agent</Pill> : <Pill><User className="h-3 w-3" /> You</Pill>) },
    { id: "last", header: "Last run", render: (r) => <span className="text-muted-foreground">{r.lastRun ? `${timeAgo(r.lastRun)}${r.lastResult ? ` · ${r.lastResult}` : ""}` : "Never"}</span> },
    { id: "on", header: "On", render: (r) => <Toggle checked={r.enabled} onChange={() => toggle(r)} label={`Toggle ${r.name}`} /> },
  ];

  const unread = data.alerts.filter((a) => !a.read).length;
  return (
    <div className="space-y-4">
      <ViewHeader title="Rules & alerts" subtitle="Rules watch a metric and notify, pause or adjust budgets. Alerts show what they found." actions={<AskButton primary prompt="Set up rules to pause ads that fatigue and warn me when cost per result jumps">Create rules</AskButton>} />
      <Section title="Rules">
        <GaTable rows={data.rules} columns={columns} rowKey={(r) => r.id} empty="No rules yet. Ask the agent to create some." />
      </Section>
      <Section
        title="Alerts"
        subtitle={unread ? `${unread} unread` : "All read"}
        actions={unread > 0 && <button type="button" onClick={() => markRead()} className="text-[11px] font-medium text-muted-foreground hover:text-foreground">Mark all read</button>}
      >
        <ul className="divide-y divide-border/40">
          {data.alerts.map((a) => (
            <li key={a.id} className="flex gap-3 px-4 py-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                <Bell className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1 text-xs">
                <p className="flex flex-wrap items-center gap-2 font-semibold">
                  {a.title}
                  <Pill tone={a.severity === "CRITICAL" ? "bad" : a.severity === "WARNING" ? "warn" : "info"}>{a.severity.toLowerCase()}</Pill>
                  {!a.read && <span className="h-1.5 w-1.5 rounded-full bg-[#F76D01]" />}
                </p>
                <p className="text-muted-foreground">{a.body}</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{timeAgo(a.at)}</p>
              </div>
              {a.prompt && (
                <button type="button" onClick={() => runAgentTurn(a.prompt!)} className="shrink-0 self-center rounded-lg border border-border/70 px-2.5 py-1 text-[11px] font-semibold hover:bg-muted">
                  Ask the agent
                </button>
              )}
            </li>
          ))}
          {!data.alerts.length && <li className="px-4 py-6 text-center text-xs text-muted-foreground">No alerts.</li>}
        </ul>
      </Section>
    </div>
  );
}

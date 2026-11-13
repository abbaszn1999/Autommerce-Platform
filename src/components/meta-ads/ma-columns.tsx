"use client";

import { METRICS, formatMetric } from "@/lib/meta-ads/metrics";
import type { MetricKey, Metrics, Objective } from "@/lib/meta-ads/types";
import type { GaColumn } from "@/components/google-ads/ga-table";

/** Metric columns follow the objective: leads campaigns show cost per lead, awareness hides purchases and ROAS. */
export function metricKeysFor(objective?: Objective): MetricKey[] {
  switch (objective) {
    case "LEADS":
      return ["spend", "results", "costPerResult", "impressions", "reach", "cpm", "linkClicks", "ctr", "cpc", "leads", "cpl"];
    case "TRAFFIC":
      return ["spend", "results", "costPerResult", "impressions", "reach", "cpm", "linkClicks", "landingPageViews", "costPerLpv", "ctr", "cpc"];
    case "AWARENESS":
      return ["spend", "reach", "impressions", "frequency", "cpm", "results", "costPerResult", "thruPlays"];
    case "ENGAGEMENT":
      return ["spend", "results", "costPerResult", "impressions", "reach", "cpm", "engagements", "video3s", "thruPlays"];
    default:
      return ["spend", "results", "costPerResult", "impressions", "reach", "frequency", "cpm", "linkClicks", "ctr", "cpc", "purchases", "purchaseValue", "roas"];
  }
}

/** "Purchases" becomes "purchase" for "Per purchase"; words like "Reach" stay as they are. */
const singular = (label: string) => label.toLowerCase().replace(/(?<!s)s$/, "");

/** Extra metrics users can switch on from the column picker. */
const OPTIONAL_METRICS: MetricKey[] = ["frequency", "cpc", "addToCart", "landingPageViews", "hookRate", "holdRate"];

export function metricColumns<T>(
  get: (row: T) => Metrics,
  currency: string,
  opts: { keys?: MetricKey[]; objective?: Objective; totals?: Metrics; resultLabel?: string; resultLabelOf?: (row: T) => string } = {}
): GaColumn<T>[] {
  const base = opts.keys ?? metricKeysFor(opts.objective);
  const keys = opts.keys ? base : [...base, ...OPTIONAL_METRICS.filter((k) => !base.includes(k))];
  return keys.map((key) => {
    const header = key === "results" ? opts.resultLabel ?? "Results" : key === "costPerResult" ? "Cost/result" : METRICS[key].short;
    return {
      label: key === "results" ? opts.resultLabel ?? METRICS[key].label : METRICS[key].label,
      hideable: true,
      defaultHidden: OPTIONAL_METRICS.includes(key) && !opts.keys && !base.includes(key),
      csv: (row: T) => Math.round(get(row)[key] * 100) / 100,
      id: key,
      header,
      align: "right" as const,
      sortValue: (row: T) => get(row)[key],
      render: (row: T) => {
        const value = get(row)[key];
        if (!value) return <span className="text-muted-foreground/60">{key === "spend" ? formatMetric(key, 0, currency) : "—"}</span>;
        // Like Ads Manager, results and cost per result say what a "result" is for that row.
        const unit = (key === "results" || key === "costPerResult") && opts.resultLabelOf ? opts.resultLabelOf(row) : undefined;
        if (!unit) return formatMetric(key, value, currency);
        return (
          <span className="inline-block leading-tight">
            <span className="block">{formatMetric(key, value, currency)}</span>
            <span className="block whitespace-nowrap text-[10px] font-normal text-muted-foreground">{key === "results" ? unit : `Per ${singular(unit)}`}</span>
          </span>
        );
      },
      total: opts.totals ? formatMetric(key, opts.totals[key], currency) : undefined,
    };
  });
}

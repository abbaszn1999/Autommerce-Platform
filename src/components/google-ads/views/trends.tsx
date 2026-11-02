"use client";

import { useMemo, useState } from "react";
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { segmentRows, type SegmentRow } from "@/lib/google-ads/analytics";
import { formatMetric } from "@/lib/google-ads/metrics";
import { runAgentTurn } from "@/lib/google-ads/agent-runner";
import type { MetricKey } from "@/lib/google-ads/types";
import { Card, Segmented, ViewHeader } from "../ga-ui";
import { useGa } from "../use-ga";

const METRIC_OPTIONS: { value: MetricKey; label: string }[] = [
  { value: "conversions", label: "Conversions" },
  { value: "cost", label: "Cost" },
  { value: "roas", label: "ROAS" },
];

/** Horizontal bars for one segment, scaled to its best row. */
function Bars({ rows, metric, currency, compact }: { rows: SegmentRow[]; metric: MetricKey; currency: string; compact?: boolean }) {
  const max = Math.max(...rows.map((r) => r.metrics[metric]), 0.0001);
  const best = rows.reduce((b, r) => (r.metrics[metric] > (b?.metrics[metric] ?? -1) ? r : b), rows[0]);
  return (
    <div className={cn("space-y-1", compact && "grid grid-cols-2 gap-x-6 gap-y-1 space-y-0 sm:grid-cols-3 lg:grid-cols-4")}>
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-2 text-[11px]">
          <span className={cn("shrink-0 text-muted-foreground", compact ? "w-10" : "w-24")}>{r.label}</span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <span className={cn("block h-full rounded-full", r === best ? "bg-[#400095] dark:bg-violet-500" : "bg-[#400095]/45 dark:bg-violet-500/45")} style={{ width: `${(r.metrics[metric] / max) * 100}%` }} />
          </span>
          <span className="w-16 text-right tabular-nums">{formatMetric(metric, r.metrics[metric], currency)}</span>
        </div>
      ))}
    </div>
  );
}

/** Account level: when and on what device the account performs best. */
export function TrendsView() {
  const { data, range, currency } = useGa();
  const [metric, setMetric] = useState<MetricKey>("conversions");
  const weekdays = useMemo(() => segmentRows(data, range, "dayOfWeek"), [data, range]);
  const hours = useMemo(() => segmentRows(data, range, "hour"), [data, range]);
  const devices = useMemo(() => segmentRows(data, range, "device"), [data, range]);
  const networks = useMemo(() => segmentRows(data, range, "network"), [data, range]);
  const bestOf = (rows: SegmentRow[]) => rows.reduce((b, r) => (r.metrics[metric] > (b?.metrics[metric] ?? -1) ? r : b), rows[0]);

  return (
    <div className="space-y-4">
      <ViewHeader
        title="Trends"
        subtitle="When, and on what, the whole account performs best. Use it to decide where bids and budget should go."
        actions={
          <button type="button" onClick={() => runAgentTurn("When do my ads perform best? Adjust my ad schedule and device bids")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 px-3 text-xs font-semibold hover:bg-muted">
            <Bot className="h-3.5 w-3.5" /> Act on this with the agent
          </button>
        }
      >
        <Segmented value={metric} onChange={setMetric} options={METRIC_OPTIONS} size="xs" />
      </ViewHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        {[
          { label: "Best day", row: bestOf(weekdays) },
          { label: "Best hour", row: bestOf(hours) },
          { label: "Best device", row: bestOf(devices) },
        ].map(({ label, row }) => (
          <Card key={label} className="p-4">
            <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-black tracking-tight">{row?.label ?? "—"}</p>
            <p className="text-[11px] text-muted-foreground">{row ? formatMetric(metric, row.metrics[metric], currency) : ""}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-4">
          <p className="text-sm font-bold">Day of week</p>
          <Bars rows={weekdays} metric={metric} currency={currency} />
        </Card>
        <Card className="space-y-3 p-4">
          <p className="text-sm font-bold">Device</p>
          <Bars rows={devices} metric={metric} currency={currency} />
          <p className="pt-2 text-sm font-bold">Network</p>
          <Bars rows={networks} metric={metric} currency={currency} />
        </Card>
      </div>

      <Card className="space-y-3 p-4">
        <p className="text-sm font-bold">Hour of day</p>
        <Bars rows={hours} metric={metric} currency={currency} compact />
      </Card>
    </div>
  );
}

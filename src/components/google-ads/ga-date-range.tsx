"use client";

// The date range picker in the top bar: presets on the left, and two months to
// pick any start and end date on the right, like Google Ads.

import { useState } from "react";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DATE_PRESETS, MAX_RANGE_DAYS } from "@/lib/google-ads/constants";
import { addDays, customRange, formatRange, isoDay, rangeDays, rangeFor, rangeLabel, todayIn } from "@/lib/google-ads/metrics";
import { useGoogleAds, useAccountData } from "@/lib/google-ads/store";
import type { DateRangePreset } from "@/lib/google-ads/types";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

/** "2026-11" → the month after or before. */
function shiftMonth(month: string, by: number): string {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return isoDay(d).slice(0, 7);
}

const monthTitle = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

const longDay = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** The days of a month laid out in weeks starting on Sunday; null fills the gaps. */
function monthCells(month: string): (string | null)[] {
  const first = `${month}-01`;
  const lead = new Date(`${first}T00:00:00Z`).getUTCDay();
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = first; d.startsWith(month); d = addDays(d, 1)) cells.push(d);
  while (cells.length % 7) cells.push(null);
  return cells;
}

function Month({
  month,
  today,
  from,
  to,
  onPick,
  onHover,
}: {
  month: string;
  today: string;
  from: string | null;
  to: string | null;
  onPick: (day: string) => void;
  onHover: (day: string | null) => void;
}) {
  return (
    <div className="w-[224px]">
      <div className="grid grid-cols-7 text-center">
        {WEEKDAYS.map((w) => (
          <span key={w} className="pb-1.5 text-[10px] font-semibold text-muted-foreground">
            {w}
          </span>
        ))}
        {monthCells(month).map((day, i) => {
          if (!day) return <span key={`e${i}`} className="h-8" />;
          const future = day > today;
          const isStart = day === from;
          const isEnd = day === to;
          const inside = !!from && !!to && day > from && day < to;
          return (
            <span key={day} className={cn("relative h-8", inside && "bg-[#400095]/[0.08] dark:bg-violet-500/15", isStart && to && to !== from && "rounded-l-full bg-[#400095]/[0.08] dark:bg-violet-500/15", isEnd && from !== to && "rounded-r-full bg-[#400095]/[0.08] dark:bg-violet-500/15")}>
              <button
                type="button"
                disabled={future}
                onClick={() => onPick(day)}
                onMouseEnter={() => onHover(day)}
                className={cn(
                  "relative z-10 mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs tabular-nums transition-colors",
                  future ? "cursor-not-allowed text-muted-foreground/35" : "hover:bg-muted",
                  (isStart || isEnd) && "bg-[#400095] font-bold text-white hover:bg-[#400095] dark:bg-violet-600",
                  day === today && !isStart && !isEnd && "font-bold text-[#F76D01]"
                )}
              >
                {Number(day.slice(8))}
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function GaDateRange() {
  const range = useGoogleAds((s) => s.range);
  const setRange = useGoogleAds((s) => s.setRange);
  const [open, setOpen] = useState(false);
  const timeZone = useAccountData()?.account.timeZone;
  const today = todayIn(timeZone);
  // What is being picked: a start, then an end. Starts from the current range.
  const [start, setStart] = useState<string | null>(range.start);
  const [end, setEnd] = useState<string | null>(range.end);
  const [hover, setHover] = useState<string | null>(null);
  const [month, setMonth] = useState(range.end.slice(0, 7));

  const onOpenChange = (next: boolean) => {
    if (next) {
      setStart(range.start);
      setEnd(range.end);
      setHover(null);
      setMonth(range.end.slice(0, 7));
    }
    setOpen(next);
  };

  const pick = (day: string) => {
    if (!start || end) {
      setStart(day);
      setEnd(null);
    } else {
      const r = customRange(start, day);
      setStart(r.start);
      setEnd(r.end);
    }
  };

  // While the end is being chosen, the hovered day previews it.
  const preview = start && !end && hover ? customRange(start, hover) : null;
  const shownFrom = preview?.start ?? start;
  const shownTo = preview?.end ?? end;
  const days = start && end ? rangeDays({ start, end }) : null;
  const tooLong = days !== null && days > MAX_RANGE_DAYS;
  const apply = () => {
    if (!start || !end || tooLong) return;
    setRange({ start, end });
    setOpen(false);
  };
  const choosePreset = (p: DateRangePreset) => {
    setRange(p);
    setOpen(false);
  };

  const left = shiftMonth(month, -1);
  const atLatest = month >= today.slice(0, 7);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/70 px-2.5 text-xs hover:bg-muted data-[state=open]:bg-muted">
        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="hidden font-medium lg:inline">{rangeLabel(range)}</span>
        <span className="text-muted-foreground">{formatRange(range)}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto overflow-hidden p-0">
        <div className="flex flex-col sm:flex-row">
          {/* Presets */}
          <div className="flex shrink-0 flex-row flex-wrap gap-1 border-b border-border/60 p-2 sm:w-40 sm:flex-col sm:flex-nowrap sm:border-b-0 sm:border-r">
            {(Object.keys(DATE_PRESETS) as DateRangePreset[]).map((p) => {
              const r = rangeFor(p, today);
              const active = range.preset === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => choosePreset(p)}
                  title={formatRange(r)}
                  className={cn(
                    "flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors",
                    active ? "bg-[#400095]/10 font-semibold text-[#400095] dark:bg-violet-500/15 dark:text-violet-300" : "hover:bg-muted"
                  )}
                >
                  {DATE_PRESETS[p].label}
                  {active && <Check className="h-3.5 w-3.5" />}
                </button>
              );
            })}
            <span
              className={cn(
                "flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs",
                range.preset === "CUSTOM" ? "bg-[#400095]/10 font-semibold text-[#400095] dark:bg-violet-500/15 dark:text-violet-300" : "text-muted-foreground"
              )}
            >
              Custom
              {range.preset === "CUSTOM" && <Check className="h-3.5 w-3.5" />}
            </span>
          </div>

          {/* Calendar */}
          <div className="p-4" onMouseLeave={() => setHover(null)}>
            <div className="mb-3 grid grid-cols-2 gap-2">
              {(["Start date", "End date"] as const).map((label, i) => {
                const value = i === 0 ? start : end;
                const waiting = i === 1 && start && !end;
                return (
                  <div key={label} className={cn("rounded-lg border px-3 py-1.5", waiting ? "border-[#400095] ring-2 ring-[#400095]/15 dark:border-violet-400" : "border-border/70")}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                    <p className={cn("text-xs font-semibold tabular-nums", !value && "text-muted-foreground")}>{value ? longDay(value) : "Pick a day"}</p>
                  </div>
                );
              })}
            </div>

            <div className="relative flex gap-6">
              <button
                type="button"
                onClick={() => setMonth(shiftMonth(month, -1))}
                className="absolute -top-0.5 left-0 flex h-6 w-6 items-center justify-center rounded-md hover:bg-muted"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setMonth(shiftMonth(month, 1))}
                disabled={atLatest}
                className="absolute -top-0.5 right-0 flex h-6 w-6 items-center justify-center rounded-md hover:bg-muted disabled:opacity-30"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              {[left, month].map((m, i) => (
                <div key={m} className={cn(i === 0 && "hidden sm:block")}>
                  <p className="mb-2 text-center text-xs font-bold">{monthTitle(m)}</p>
                  <Month month={m} today={today} from={shownFrom} to={shownTo} onPick={pick} onHover={setHover} />
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
              <p className={cn("text-[11px]", tooLong ? "text-red-600" : "text-muted-foreground")}>
                {tooLong
                  ? `At most ${MAX_RANGE_DAYS} days at once.`
                  : start && !end
                    ? "Now pick the end date."
                    : days !== null
                      ? `${days} day${days > 1 ? "s" : ""}${end === today ? " · today's numbers are still coming in" : ""}`
                      : ""}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={apply}
                  disabled={!start || !end || tooLong}
                  className="rounded-lg bg-[#400095] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#33007a] disabled:opacity-50 dark:bg-violet-600"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

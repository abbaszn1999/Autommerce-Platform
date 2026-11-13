"use client";

import { useTheme } from "next-themes";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { Markdown } from "@/components/store-agent/markdown";
import { ReportHtmlFrame } from "./report-html-frame";
import { cn } from "@/lib/utils";
import { money, num } from "@/lib/google-ads/metrics";
import type { ReportBlock, ValueFormat } from "@/lib/google-ads/live-docs";

const PALETTE = ["#400095", "#F76D01", "#0d9488", "#2563eb", "#c026d3", "#ea580c", "#16a34a", "#64748b"];

export function formatValue(v: number, f: ValueFormat, currency: string) {
  if (f === "money") return currency ? money(v, currency, { compact: true }) : num(v, { compact: true });
  if (f === "percent") return `${(v * 100).toFixed(1)}%`;
  if (f === "ratio") return `${v.toFixed(2)}×`;
  return num(v, { compact: true });
}

/** Short texts (verdicts, callouts, findings) with **bold** shown as bold, not as asterisks. */
export function Inline({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((p, i) => (i % 2 ? <strong key={i} className="font-semibold text-foreground">{p}</strong> : p))}
    </>
  );
}

const TONES = {
  info: { cls: "border-sky-500/30 bg-sky-500/[0.06]", icon: Info, ic: "text-sky-600" },
  good: { cls: "border-emerald-500/30 bg-emerald-500/[0.06]", icon: CheckCircle2, ic: "text-emerald-600" },
  warn: { cls: "border-amber-500/30 bg-amber-500/[0.07]", icon: AlertTriangle, ic: "text-amber-600" },
  bad: { cls: "border-red-500/30 bg-red-500/[0.06]", icon: XCircle, ic: "text-red-600" },
};

export function ReportBlockView({ block, currency }: { block: ReportBlock; currency: string }) {
  switch (block.kind) {
    case "html":
      return <ReportHtmlFrame html={block.html} title={block.title} />;
    case "text":
      return <Markdown text={block.md} />;
    case "callout": {
      const tone = TONES[block.tone];
      return (
        <div dir="auto" className={cn("flex gap-2.5 rounded-xl border p-3 text-[13px] leading-relaxed", tone.cls)}>
          <tone.icon className={cn("mt-0.5 h-4 w-4 shrink-0", tone.ic)} />
          <p>
            {block.title && <span className="font-semibold">{block.title} </span>}
            <Inline text={block.text} />
          </p>
        </div>
      );
    }
    case "table":
      return (
        <div className="overflow-x-auto rounded-xl border border-border/60">
          <table dir="auto" className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-muted/40">
                {block.columns.map((c, i) => (
                  <th key={i} className={cn("whitespace-nowrap px-3 py-2 font-semibold text-muted-foreground", block.align?.[i] === "right" ? "text-end" : "text-start")}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r, ri) => (
                <tr key={ri} className="border-t border-border/50 even:bg-muted/[0.15]">
                  {block.columns.map((_, ci) => (
                    <td key={ci} className={cn("px-3 py-2 align-top", block.align?.[ci] === "right" ? "text-end tabular-nums" : "text-start", ci === 0 && "font-medium")}>
                      {typeof r[ci] === "string" ? <Inline text={r[ci] as string} /> : (r[ci] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "chart":
      return <ChartBlock block={block} currency={currency} />;
    case "score":
      return <ScoreBlock block={block} />;
  }
}

function ChartBlock({ block, currency }: { block: Extract<ReportBlock, { kind: "chart" }>; currency: string }) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  const axis = dark ? "#a1a1aa" : "#71717a";
  const grid = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const fmt = (v: unknown) => formatValue(Number(v), block.format, currency);
  const total = block.data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <figure className="rounded-xl border border-border/60 bg-background p-4 print:break-inside-avoid">
      {block.title && <figcaption dir="auto" className="mb-3 text-[12.5px] font-semibold">{block.title}</figcaption>}
      {block.variant === "donut" ? (
        <div className="flex flex-wrap items-center gap-6">
          <div style={{ width: 190, height: 190 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={block.data} dataKey="value" nameKey="label" innerRadius={55} outerRadius={88} paddingAngle={2} stroke="none" isAnimationActive={false}>
                  {block.data.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={fmt} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="min-w-48 flex-1 space-y-1.5">
            {block.data.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-[12px]">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: PALETTE[i % PALETTE.length] }} />
                <span dir="auto" className="flex-1 truncate">{d.label}</span>
                <span className="tabular-nums text-muted-foreground">{((d.value / total) * 100).toFixed(0)}%</span>
                <span className="w-20 text-end font-semibold tabular-nums">{fmt(d.value)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ height: 230 }}>
          <ResponsiveContainer>
            {block.variant === "line" ? (
              <LineChart data={block.data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke={grid} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: axis }} tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis tick={{ fontSize: 10, fill: axis }} tickLine={false} axisLine={false} width={60} tickFormatter={fmt} />
                <Tooltip formatter={fmt} />
                <Line type="monotone" dataKey="value" stroke={dark ? "#a78bfa" : "#400095"} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            ) : (
              <BarChart data={block.data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} stroke={grid} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: axis }} tickLine={false} axisLine={false} interval={0} angle={block.data.length > 8 ? -25 : 0} textAnchor={block.data.length > 8 ? "end" : "middle"} height={block.data.length > 8 ? 54 : 24} />
                <YAxis tick={{ fontSize: 10, fill: axis }} tickLine={false} axisLine={false} width={60} tickFormatter={fmt} />
                <Tooltip formatter={fmt} cursor={{ fill: "rgba(64,0,149,0.06)" }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                  {block.data.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}

const scoreColor = (s: number) => (s >= 80 ? "#16a34a" : s >= 60 ? "#f59e0b" : "#dc2626");

function ScoreBlock({ block }: { block: Extract<ReportBlock, { kind: "score" }> }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const color = scoreColor(block.score);
  return (
    <div className="flex flex-wrap items-center gap-6 rounded-xl border border-border/60 p-4 print:break-inside-avoid">
      <div className="relative h-24 w-24 shrink-0">
        <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90">
          <circle cx="40" cy="40" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-muted" />
          <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(c * block.score) / 100} ${c}`} />
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black">{block.score}</span>
          <span className="text-[9px] text-muted-foreground">/ 100</span>
        </span>
      </div>
      <div className="min-w-56 flex-1 space-y-1.5">
        {block.label && <p dir="auto" className="text-sm font-bold" style={{ color }}>{block.label}</p>}
        {block.parts.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-[11.5px]">
            <span dir="auto" className="w-40 truncate text-muted-foreground">{p.label}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full" style={{ width: `${p.score}%`, background: scoreColor(p.score) }} />
            </span>
            <span className="w-8 text-end tabular-nums">{p.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

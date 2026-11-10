// Exports of a report or plan: a standalone printable page (printed, or saved
// as PDF from the print dialog) and an Excel workbook. Pure: the page is built
// as a string and the workbook from the exceljs module passed in, so both are
// tested without a browser.
//
// Everything the agent wrote is escaped; its html blocks run only inside
// sandboxed frames (see report-sandbox), never in the exported page itself.

import type { PlanContent, ReportBlock, ReportContent, ValueFormat } from "./live-docs";
import { REPORT_SANDBOX, sandboxedReport } from "./report-sandbox";

export type ExportDoc = { kind: "plan" | "report"; title: string; summary: string; content: PlanContent | ReportContent; updatedAt?: string };
export type ExportOptions = { currency: string; accountName: string; generatedAt?: Date };

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿ]/;
export const isRtl = (doc: ExportDoc) => ARABIC.test(`${doc.title} ${doc.summary}`) || (doc.kind === "report" && ARABIC.test((doc.content as ReportContent).verdict.join(" ")));

export function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** A number with its sign and unit ("+12.0%", "4.2×", "1,240 USD") reads left to right, even inside Arabic. */
const NUMBER = /(?<![\p{L}\p{N}_.])(?:[A-Z]{3}\s)?[-+]?\d[\d,]*(?:\.\d+)?(?:\s?(?:%|×|[A-Z]{3}\b))?(?![\p{L}\p{N}_])/gu;
const ltrNumbers = (escaped: string) => escaped.replace(NUMBER, (m) => (/\d/.test(m) ? `<bdi dir="ltr">${m}</bdi>` : m));

/** **bold** in short texts. */
const inline = (s: string) => ltrNumbers(esc(s)).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
const value = (s: unknown) => `<bdi dir="ltr">${esc(s)}</bdi>`;

/** The Markdown the agent writes: headings, lists, bold, tables and paragraphs. */
export function markdownHtml(md: string): string {
  const out: string[] = [];
  const lines = md.replace(/\r/g, "").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) continue;
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      out.push(`<h${heading[1]!.length + 2} dir="auto">${inline(heading[2]!)}</h${heading[1]!.length + 2}>`);
      continue;
    }
    if (/^\s*\|/.test(line) && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? "")) {
      const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i]!)) rows.push(cells(lines[i++]!));
      i--;
      out.push(`<table dir="auto"><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      continue;
    }
    const item = /^\s*([-*]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      const ordered = /\d/.test(item[1]!);
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^\s*([-*]|\d+[.)])\s+(.*)$/.exec(lines[i]!);
        if (!m) break;
        items.push(`<li>${inline(m[2]!)}</li>`);
        i++;
      }
      i--;
      out.push(`<${ordered ? "ol" : "ul"} dir="auto">${items.join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }
    const para: string[] = [line];
    while (i + 1 < lines.length && lines[i + 1]!.trim() && !/^(#{1,4}\s|\s*([-*]|\d+[.)])\s|\s*\|)/.test(lines[i + 1]!)) para.push(lines[++i]!);
    out.push(`<p dir="auto">${para.map(inline).join("<br>")}</p>`);
  }
  return out.join("\n");
}

export function formatValue(v: number, f: ValueFormat, currency: string): string {
  if (f === "percent") return `${(v * 100).toFixed(1)}%`;
  if (f === "ratio") return `${v.toFixed(2)}×`;
  const n = new Intl.NumberFormat("en", { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 }).format(v);
  return f === "money" && currency ? `${n} ${currency}` : n;
}

const PALETTE = ["#400095", "#F76D01", "#0d9488", "#2563eb", "#c026d3", "#ea580c", "#16a34a", "#64748b"];

/** Charts as plain SVG: they print sharply and need no script. */
export function chartSvg(block: Extract<ReportBlock, { kind: "chart" }>, currency: string): string {
  const data = block.data;
  const fmt = (v: number) => `<bdi dir="ltr">${esc(formatValue(v, block.format, currency))}</bdi>`;
  const svgFmt = (v: number) => esc(formatValue(v, block.format, currency));
  if (block.variant === "donut") {
    const total = data.reduce((s, d) => s + Math.max(0, d.value), 0) || 1;
    let angle = -Math.PI / 2;
    const arcs = data.map((d, i) => {
      const a = (Math.max(0, d.value) / total) * Math.PI * 2;
      const large = a > Math.PI ? 1 : 0;
      const [x1, y1, x2, y2] = [Math.cos(angle), Math.sin(angle), Math.cos(angle + a), Math.sin(angle + a)].map((v) => 80 + 70 * v);
      angle += a;
      return a >= Math.PI * 2 - 1e-6
        ? `<circle cx="80" cy="80" r="70" fill="none" stroke="${PALETTE[i % 8]}" stroke-width="22"/>`
        : `<path d="M${x1} ${y1} A70 70 0 ${large} 1 ${x2} ${y2}" fill="none" stroke="${PALETTE[i % 8]}" stroke-width="22"/>`;
    });
    const legend = data.map((d, i) => `<div class="legend"><span style="background:${PALETTE[i % 8]}"></span><bdi>${esc(d.label)}</bdi> · ${fmt(d.value)} (${((Math.max(0, d.value) / total) * 100).toFixed(1)}%)</div>`);
    return `<div class="donut"><svg width="160" height="160" viewBox="0 0 160 160" role="img" aria-label="${esc(block.title)}">${arcs.join("")}</svg><div>${legend.join("")}</div></div>`;
  }
  const max = block.format === "percent" && data.every((d) => d.value <= 1) ? 1 : Math.max(...data.map((d) => d.value), 0) || 1;
  const min = Math.min(...data.map((d) => d.value), 0);
  if (block.variant === "line") {
    const w = 640;
    const h = 200;
    const x = (i: number) => (data.length === 1 ? w / 2 : 60 + (i * (w - 80)) / (data.length - 1));
    const y = (v: number) => h - 24 - ((v - min) / (max - min || 1)) * (h - 48);
    const points = data.map((d, i) => `${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
    const labels = data.map((d, i) => (data.length <= 12 || i % Math.ceil(data.length / 12) === 0 ? `<text x="${x(i).toFixed(1)}" y="${h - 6}" text-anchor="middle">${esc(d.label)}</text>` : "")).join("");
    return `<svg class="chart" direction="ltr" style="direction:ltr" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(block.title)}"><polyline points="${points}" fill="none" stroke="${PALETTE[0]}" stroke-width="2.5"/>${data.map((d, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(d.value).toFixed(1)}" r="3" fill="${PALETTE[0]}"><title>${esc(d.label)}: ${svgFmt(d.value)}</title></circle>`).join("")}${labels}<text x="2" y="12" text-anchor="start">${svgFmt(max)}</text><text x="2" y="${h - 26}" text-anchor="start">${svgFmt(min)}</text></svg>`;
  }
  return `<div class="bars">${data
    .map((d) => `<div class="bar-row"><bdi class="bar-label">${esc(d.label)}</bdi><div class="bar-track"><div class="bar" style="width:${Math.max(0, (d.value / max) * 100).toFixed(1)}%"></div></div><span class="bar-value">${fmt(d.value)}</span></div>`)
    .join("")}</div>`;
}

function blockHtml(block: ReportBlock, currency: string, n: number): string {
  switch (block.kind) {
    case "text":
      return markdownHtml(block.md);
    case "callout":
      return `<div class="callout ${block.tone}" dir="auto">${block.title ? `<strong>${esc(block.title)}</strong> ` : ""}${inline(block.text)}</div>`;
    case "table":
      return `<table dir="auto"><thead><tr>${block.columns.map((c, i) => `<th class="${block.align?.[i] === "right" ? "num" : ""}">${esc(c)}</th>`).join("")}</tr></thead><tbody>${block.rows
        .map((r) => `<tr>${r.map((c, i) => `<td class="${block.align?.[i] === "right" || typeof c === "number" ? "num" : ""}">${typeof c === "number" ? value(c.toLocaleString("en")) : ltrNumbers(esc(c))}</td>`).join("")}</tr>`)
        .join("")}</tbody></table>`;
    case "chart":
      return `<figure>${block.title ? `<figcaption dir="auto">${esc(block.title)}</figcaption>` : ""}${chartSvg(block, currency)}</figure>`;
    case "score":
      return `<div class="score"><div class="score-big">${block.score}<small>/100</small></div><div dir="auto"><strong>${esc(block.label)}</strong>${block.parts
        .map((p) => `<div class="bar-row"><bdi class="bar-label">${esc(p.label)}</bdi><div class="bar-track"><div class="bar" style="width:${p.score}%"></div></div><span class="bar-value">${p.score}</span></div>`)
        .join("")}</div></div>`;
    case "html":
      // The agent's page runs only in a sandboxed frame; it tells the frame its height (see sandboxedReport).
      return `<figure class="html-block">${block.title ? `<figcaption dir="auto">${esc(block.title)}</figcaption>` : ""}<iframe id="html-${n}" title="${esc(block.title || "Report")}" sandbox="${REPORT_SANDBOX}" referrerpolicy="no-referrer" srcdoc="${esc(sandboxedReport(block.html, false))}"></iframe></figure>`;
  }
}

const SEVERITY = { high: "High", medium: "Medium", low: "Low" } as const;

const WORDS = {
  en: { verdict: "Verdict", labels: ["Health", "Biggest problem", "First fix"], findings: "Findings", evidence: "Evidence", fix: "Fix", severity: SEVERITY, overview: "Overview", steps: "Steps", step: "Step", risk: "risk", expected: "Expected", notes: "Notes", item: "Item", field: "Field", before: "Before", after: "After", report: "Google Ads report", plan: "Google Ads plan", footer: ["Exported from Autommerce on", ". Numbers are as of the report's period."] },
  ar: { verdict: "الخلاصة", labels: ["الصحة", "أكبر مشكلة", "أول إصلاح"], findings: "النتائج", evidence: "الدليل", fix: "الإصلاح", severity: { high: "عالية", medium: "متوسطة", low: "منخفضة" }, overview: "نظرة عامة", steps: "الخطوات", step: "الخطوة", risk: "الخطورة", expected: "المتوقع", notes: "ملاحظات", item: "العنصر", field: "الحقل", before: "قبل", after: "بعد", report: "تقرير Google Ads", plan: "خطة Google Ads", footer: ["صُدّر من Autommerce بتاريخ", ". الأرقام كما في فترة التقرير."] },
} as const;

const STYLE = `
*{box-sizing:border-box}body{margin:0;font:13px/1.55 "Segoe UI","Noto Naskh Arabic","Noto Sans Arabic",Tahoma,Arial,sans-serif;color:#18181b;background:#fff}
main{max-width:960px;margin:0 auto;padding:32px 28px}header{border-bottom:3px solid #400095;padding-bottom:14px;margin-bottom:18px}
.brand{color:#400095;font-weight:800;letter-spacing:.08em;font-size:11px;text-transform:uppercase}h1{font-size:24px;margin:6px 0 4px}
.meta{color:#71717a;font-size:12px}h2{font-size:16px;margin:26px 0 10px;color:#400095;break-after:avoid}h3,h4,h5,h6{margin:14px 0 6px}
.verdict{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.verdict div,.kpi{border:1px solid #e4e4e7;border-radius:10px;padding:10px;break-inside:avoid}
.label{font-size:10px;color:#71717a;text-transform:uppercase;letter-spacing:.06em;font-weight:600}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:12px}
.kpi b{display:block;font-size:19px}.up{color:#16a34a}.down{color:#dc2626}
.finding,.step{border:1px solid #e4e4e7;border-radius:10px;padding:10px 12px;margin:8px 0;break-inside:avoid}.finding.high{border-inline-start:4px solid #dc2626}
.finding.medium{border-inline-start:4px solid #d97706}.finding.low{border-inline-start:4px solid #64748b}.cols{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px}
table{width:100%;border-collapse:collapse;margin:8px 0;font-size:12px;break-inside:auto}th,td{border-bottom:1px solid #e4e4e7;padding:5px 8px;text-align:start;vertical-align:top}
th{background:#f4f4f5;font-weight:600}tr{break-inside:avoid}.num{text-align:end;font-variant-numeric:tabular-nums}
.callout{border:1px solid #bae6fd;background:#f0f9ff;border-radius:10px;padding:10px;margin:8px 0}.callout.good{border-color:#bbf7d0;background:#f0fdf4}
.callout.warn{border-color:#fde68a;background:#fffbeb}.callout.bad{border-color:#fecaca;background:#fef2f2}
figure{margin:10px 0;break-inside:avoid}figcaption{font-weight:600;margin-bottom:6px}.chart{width:100%;height:auto}.chart text{font-size:10px;fill:#71717a}
.bars{display:grid;gap:5px}.bar-row{display:grid;grid-template-columns:minmax(90px,30%) 1fr auto;gap:8px;align-items:center}.bar-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar-track{height:10px;background:#f4f4f5;border-radius:5px;overflow:hidden}.bar{height:100%;background:#400095;border-radius:5px}.bar-value{font-variant-numeric:tabular-nums;font-size:12px}
.donut{display:flex;gap:16px;align-items:center}.legend{display:flex;gap:6px;align-items:center;font-size:12px}.legend span{width:10px;height:10px;border-radius:2px;display:inline-block}
.score{display:flex;gap:16px;align-items:center}.score-big{font-size:34px;font-weight:800;color:#400095}.score-big small{font-size:13px;color:#71717a}
.html-block iframe{width:100%;height:420px;border:1px solid #e4e4e7;border-radius:10px}.risk{font-size:11px;font-weight:600;text-transform:uppercase}
footer{margin-top:28px;color:#a1a1aa;font-size:11px;border-top:1px solid #e4e4e7;padding-top:8px}
@page{size:A4;margin:14mm}@media print{main{padding:0;max-width:none}a{color:inherit;text-decoration:none}}
`;

/** Frames report their height; the page sizes them, and prints once everything has had a moment to draw. */
const SCRIPT = `<script>
addEventListener("message",function(e){var f=[].slice.call(document.querySelectorAll("iframe")).find(function(x){return x.contentWindow===e.source});var h=e.data&&e.data.autommerceReportHeight;if(f&&typeof h==="number"){f.style.height=Math.max(120,Math.min(4000,Math.ceil(h)))+"px";}});
if(location.hash==="#print"){addEventListener("load",function(){setTimeout(function(){print();},700);});}
</script>`;

export function exportHtml(doc: ExportDoc, opts: ExportOptions): string {
  const rtl = isRtl(doc);
  const W = WORDS[rtl ? "ar" : "en"];
  const when = (opts.generatedAt ?? new Date()).toISOString().slice(0, 10);
  const parts: string[] = [];
  if (doc.kind === "report") {
    const c = doc.content as ReportContent;
    const labels = W.labels;
    parts.push(`<h2>${W.verdict}</h2><div class="verdict">${c.verdict.map((v, i) => `<div dir="auto"><div class="label">${labels[i] ?? ""}</div>${inline(v.replace(/^\s*\*\*[^*]{1,40}:\*\*\s*/, ""))}</div>`).join("")}</div>`);
    if (c.kpis.length)
      parts.push(
        `<div class="kpis">${c.kpis
          .map((k) => {
            const good = k.delta === undefined ? "" : (k.delta >= 0) === (k.higherIsBetter ?? true) ? "up" : "down";
            return `<div class="kpi" dir="auto"><div class="label">${esc(k.label)}</div><b>${value(k.value)}</b>${k.delta !== undefined ? `<span class="${good}">${value(`${k.delta >= 0 ? "+" : ""}${(k.delta * 100).toFixed(1)}%`)}</span>` : ""}${k.hint ? `<div class="meta">${esc(k.hint)}</div>` : ""}</div>`;
          })
          .join("")}</div>`
      );
    if (c.findings.length)
      parts.push(
        `<h2>${W.findings} (${c.findings.length})</h2>${c.findings
          .map((f) => `<div class="finding ${f.severity}" dir="auto"><div class="label">${W.severity[f.severity]}${f.impact ? ` · ${inline(f.impact)}` : ""}</div><strong>${inline(f.title)}</strong><div class="cols"><div><div class="label">${W.evidence}</div>${inline(f.evidence)}</div><div><div class="label">${W.fix}</div>${inline(f.fix)}</div></div></div>`)
          .join("")}`
      );
    let n = 0;
    for (const s of c.sections) parts.push(`<h2 dir="auto">${esc(s.title)}</h2>${s.blocks.map((b) => blockHtml(b, opts.currency, n++)).join("\n")}`);
  } else {
    const c = doc.content as PlanContent;
    if (c.overview) parts.push(`<h2>${W.overview}</h2>${markdownHtml(c.overview)}`);
    parts.push(
      `<h2>${W.steps} (${c.steps.length})</h2>${c.steps
        .map(
          (s, i) =>
            `<div class="step" dir="auto"><div class="label">${W.step} ${i + 1} · <span class="risk">${W.risk}: ${esc(W.severity[s.risk])}</span> · ${s.target === "merchant" ? "Merchant Center" : "Google Ads"}</div><strong>${esc(s.title)}</strong><p>${inline(s.why)}</p>${s.expected ? `<p><span class="label">${W.expected}</span> ${inline(s.expected)}</p>` : ""}${
              s.preview.length
                ? `<table><thead><tr><th>${W.item}</th><th>${W.field}</th><th>${W.before}</th><th>${W.after}</th></tr></thead><tbody>${s.preview
                    .flatMap((p) => p.changes.map((ch) => `<tr><td>${esc(p.label)}</td><td>${esc(ch.field)}</td><td>${esc(ch.before ?? "—")}</td><td>${esc(ch.after ?? "—")}</td></tr>`))
                    .join("")}</tbody></table>`
                : ""
            }</div>`
        )
        .join("")}`
    );
    if (c.notes) parts.push(`<h2>${W.notes}</h2>${markdownHtml(c.notes)}`);
  }
  const period = doc.kind === "report" ? (doc.content as ReportContent).period : (doc.content as PlanContent).period;
  return `<!doctype html><html lang="${rtl ? "ar" : "en"}" dir="${rtl ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(doc.title)}</title><style>${STYLE}</style></head><body><main>
<header><div class="brand">Autommerce · ${doc.kind === "plan" ? W.plan : W.report}</div><h1 dir="auto">${esc(doc.title)}</h1><div class="meta" dir="auto">${esc(opts.accountName)}${period ? ` · ${inline(period)}` : ""} · <bdi dir="ltr">${when}</bdi></div>${doc.summary ? `<p dir="auto">${esc(doc.summary)}</p>` : ""}</header>
${parts.join("\n")}
<footer dir="auto">${esc(W.footer[0])} <bdi dir="ltr">${when}</bdi>${esc(W.footer[1])}</footer></main>${SCRIPT}</body></html>`;
}

// ─── Excel ──────────────────────────────────────────────────────────────────

type ExcelModule = typeof import("exceljs");

/** "1,234.5 USD", "$1,234", "12.5%", "3.2×" as numbers; anything else stays text. */
export function cellValue(v: string | number): { value: string | number; format?: string } {
  if (typeof v === "number") return { value: v };
  const t = v.trim();
  const pct = /^([-+]?\d[\d,]*(?:\.\d+)?)\s*%$/.exec(t);
  if (pct) return { value: Number(pct[1]!.replace(/,/g, "")) / 100, format: "0.0%" };
  const plain = /^(?:[A-Z]{3}\s*|[$€£])?\s*([-+]?\d[\d,]*(?:\.\d+)?)\s*(?:[A-Z]{3}|×|x)?$/.exec(t);
  if (plain && /\d/.test(plain[1]!) && !/^0\d/.test(plain[1]!)) return { value: Number(plain[1]!.replace(/,/g, "")), format: /\.\d/.test(plain[1]!) ? "#,##0.00" : "#,##0" };
  return { value: t };
}

/** Sheet names: at most 31 characters, none of []:*?/\, each different. */
function sheetName(wanted: string, used: Set<string>): string {
  const base = (wanted.replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim() || "Sheet").slice(0, 28);
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 26)} ${i}`;
  used.add(name.toLowerCase());
  return name;
}

export function exportWorkbook(ExcelJS: ExcelModule, doc: ExportDoc, opts: ExportOptions) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Autommerce";
  wb.created = opts.generatedAt ?? new Date();
  const rtl = isRtl(doc);
  const used = new Set<string>();
  const sheet = (name: string) => wb.addWorksheet(sheetName(name, used), { views: [{ rightToLeft: rtl, state: "frozen", ySplit: 1 }] });
  const header = (ws: ReturnType<typeof sheet>, columns: string[]) => {
    const row = ws.addRow(columns);
    row.font = { bold: true, color: { argb: "FFFFFFFF" } };
    row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF400095" } };
  };
  const put = (ws: ReturnType<typeof sheet>, values: (string | number)[]) => {
    const row = ws.addRow(values.map((v) => cellValue(v).value));
    values.forEach((v, i) => {
      const f = cellValue(v).format;
      if (f) row.getCell(i + 1).numFmt = f;
    });
  };
  const widths = (ws: ReturnType<typeof sheet>) =>
    ws.columns.forEach((c) => {
      let w = 10;
      c.eachCell?.({ includeEmpty: false }, (cell) => (w = Math.max(w, Math.min(60, String(cell.value ?? "").length + 2))));
      c.width = w;
    });

  const summary = sheet("Summary");
  header(summary, ["Field", "Value"]);
  const period = doc.kind === "report" ? (doc.content as ReportContent).period : (doc.content as PlanContent).period;
  for (const [k, v] of [["Title", doc.title], ["Account", opts.accountName], ["Period", period], ["Summary", doc.summary]] as const) if (v) summary.addRow([k, v]);

  if (doc.kind === "report") {
    const c = doc.content as ReportContent;
    c.verdict.forEach((v, i) => summary.addRow([["Health", "Biggest problem", "First fix"][i] ?? "Verdict", v.replace(/\*\*/g, "")]));
    if (c.kpis.length) {
      const ws = sheet("KPIs");
      header(ws, ["KPI", "Value", "Change vs previous period"]);
      for (const k of c.kpis) {
        put(ws, [k.label, k.value]);
        if (k.delta !== undefined) {
          const cell = ws.lastRow!.getCell(3);
          cell.value = k.delta;
          cell.numFmt = "+0.0%;-0.0%";
        }
      }
      widths(ws);
    }
    if (c.findings.length) {
      const ws = sheet("Findings");
      header(ws, ["Severity", "Finding", "At stake", "Evidence", "Fix"]);
      for (const f of c.findings) ws.addRow([SEVERITY[f.severity], f.title.replace(/\*\*/g, ""), f.impact, f.evidence.replace(/\*\*/g, ""), f.fix.replace(/\*\*/g, "")]);
      widths(ws);
    }
    for (const s of c.sections) {
      s.blocks.forEach((b, i) => {
        if (b.kind === "table") {
          const ws = sheet(s.blocks.filter((x) => x.kind === "table").length > 1 ? `${s.title} ${i + 1}` : s.title);
          header(ws, b.columns);
          for (const r of b.rows) put(ws, r);
          widths(ws);
        } else if (b.kind === "chart") {
          const ws = sheet(b.title || `${s.title} chart`);
          header(ws, ["Label", "Value"]);
          const format = b.format === "percent" ? "0.0%" : b.format === "ratio" ? "0.00" : "#,##0.00";
          for (const d of b.data) {
            const row = ws.addRow([d.label, d.value]);
            row.getCell(2).numFmt = format;
          }
          widths(ws);
        }
      });
    }
  } else {
    const c = doc.content as PlanContent;
    const ws = sheet("Steps");
    header(ws, ["#", "Step", "Why", "Risk", "Expected", "Item", "Field", "Before", "After"]);
    c.steps.forEach((s, i) => {
      const changes = s.preview.flatMap((p) => p.changes.map((ch) => [p.label, ch.field, ch.before ?? "", ch.after ?? ""]));
      if (!changes.length) ws.addRow([i + 1, s.title, s.why, s.risk, s.expected]);
      for (const ch of changes) ws.addRow([i + 1, s.title, s.why, s.risk, s.expected, ...ch]);
    });
    widths(ws);
  }
  widths(summary);
  return wb;
}

/** A file name from the title, safe on every system. */
export function exportFileName(doc: ExportDoc, ext: string): string {
  const base = doc.title.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || (doc.kind === "plan" ? "Plan" : "Report");
  return `${base}.${ext}`;
}

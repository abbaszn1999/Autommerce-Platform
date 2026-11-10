import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { cellValue, exportFileName, exportHtml, exportWorkbook, markdownHtml, type ExportDoc } from "./report-export";
import { CHART_JS_URL, REPORT_CSP, REPORT_SANDBOX, reportDocument, sandboxedReport } from "./report-sandbox";
import type { ReportContent } from "./live-docs";

const content = (extra: Partial<ReportContent> = {}): ReportContent => ({
  period: "Last 30 days",
  verdict: ["**Health:** Good, ROAS 4.2×", "Tracking counts twice", "Fix the tag"],
  kpis: [{ label: "Cost", value: "4,210 USD", delta: 0.12, higherIsBetter: false }],
  findings: [{ id: "f1", title: "Double counting", severity: "high", impact: "1,240 USD a month", evidence: "Two purchase tags", fix: "Make GA4 secondary" }],
  sections: [
    {
      id: "s1",
      title: "Campaigns",
      blocks: [
        { kind: "table", columns: ["Campaign", "Cost", "Conv. rate"], rows: [["Search <b>LB</b>", "1,820.50 USD", "3.5%"], ["PMax", 2389.5, "2%"]] },
        { kind: "chart", title: "Spend", variant: "bar", format: "money", data: [{ label: "A", value: 10 }, { label: "B", value: 5 }] },
        { kind: "html", title: "Hours", html: '<div id="x">hi</div><script>document.title="t"</script>' },
      ],
    },
  ],
  ...extra,
});
const report = (c = content(), title = "October report"): ExportDoc => ({ kind: "report", title, summary: "Profitable", content: c });
const opts = { currency: "USD", accountName: "Kalema", generatedAt: new Date("2026-11-10T00:00:00Z") };

describe("the report's sandbox", () => {
  it("puts our policy before anything the report wrote, so it can't be weakened", () => {
    const doc = reportDocument('<!doctype html><html><head><meta name="x"></head><body><img src="https://evil.example/x"></body></html>', true);
    expect(doc.startsWith('<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy"')).toBe(true);
    expect(doc.indexOf("Content-Security-Policy")).toBeLessThan(doc.indexOf("evil.example"));
    expect(doc.match(/<!doctype/gi)).toHaveLength(1);
    expect(doc).toContain('data-theme="dark"');
  });

  it("allows no requests at all except the one chart library", () => {
    expect(REPORT_CSP).toContain("default-src 'none'");
    expect(REPORT_CSP).toContain("connect-src 'none'");
    expect(REPORT_CSP).toContain("img-src data: blob:");
    expect(REPORT_CSP).toContain(`script-src 'unsafe-inline' ${CHART_JS_URL}`);
    expect(REPORT_SANDBOX).toBe("allow-scripts");
  });

  it("holds the report in a wrapper that allows no frame navigation", () => {
    const wrapped = sandboxedReport("<p>x</p>", false);
    expect(wrapped).toContain("frame-src 'none'");
    expect(wrapped).toMatch(/<iframe sandbox="allow-scripts" referrerpolicy="no-referrer" srcdoc="&lt;!doctype html&gt;/);
    // The report's own text is escaped inside the attribute: it can't close the frame tag.
    expect(sandboxedReport('"><script>alert(1)</script>', false)).not.toContain('"><script>alert(1)');
  });
});

describe("the printable page", () => {
  it("escapes everything the agent wrote, and runs its html only inside sandboxed frames", () => {
    const html = exportHtml(report(content(), 'Report <img src=x onerror="steal()">'), opts);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("Report &lt;img src=x onerror=&quot;steal()&quot;&gt;");
    expect(html).toContain("Search &lt;b&gt;LB&lt;/b&gt;");
    // The block's script is only in a frame's srcdoc, never live on the page.
    expect(html).not.toContain('<script>document.title="t"</script>');
    expect(html).toMatch(/<iframe id="html-2" title="Hours" sandbox="allow-scripts"/);
  });

  it("reads right to left for an Arabic report, with its own headings, and keeps numbers in order", () => {
    const html = exportHtml(report(content({ verdict: ["جيدة، العائد 4.2× و GA4 ثانوياً و 37 كلمة"] }), "تقرير أكتوبر"), opts);
    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect(html).toContain("<h2>الخلاصة</h2>");
    expect(html).toContain('<bdi dir="ltr">4.2×</bdi>');
    expect(html).toContain("GA4 ثانوياً");
    expect(html).toContain('<bdi dir="ltr">37</bdi> كلمة');
  });

  it("prints by itself when opened for printing", () => {
    expect(exportHtml(report(), opts)).toContain('location.hash==="#print"');
  });

  it("draws charts as SVG or bars, with shares measured against 100%", () => {
    const html = exportHtml(report(content({ sections: [{ id: "s", title: "Devices", blocks: [{ kind: "chart", title: "Share", variant: "bar", format: "percent", data: [{ label: "Mobile", value: 0.5 }] }] }] })), opts);
    expect(html).toContain('style="width:50.0%"');
  });

  it("turns the agent's Markdown into headings, lists, tables and paragraphs", () => {
    const html = markdownHtml("## Title\nSome **bold** text\n- one\n- two\n\n| A | B |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain('<h4 dir="auto">Title</h4>');
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<li>one</li><li>two</li>");
    expect(html).toContain("<th>A</th><th>B</th>");
  });
});

describe("the Excel file", () => {
  it("has a sheet per table and chart, with numbers as numbers", async () => {
    const wb = exportWorkbook(ExcelJS, report(), opts);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Summary", "KPIs", "Findings", "Campaigns", "Spend"]);
    const table = wb.getWorksheet("Campaigns")!;
    expect(table.getRow(2).getCell(2).value).toBe(1820.5);
    expect(table.getRow(2).getCell(3).value).toBe(0.035);
    expect(table.getRow(2).getCell(3).numFmt).toBe("0.0%");
    expect(table.getRow(3).getCell(2).value).toBe(2389.5);
    expect(wb.getWorksheet("KPIs")!.getRow(2).getCell(3).value).toBe(0.12);
    // It is a real file Excel opens.
    const buffer = await wb.xlsx.writeBuffer();
    const back = new ExcelJS.Workbook();
    await back.xlsx.load(buffer as ArrayBuffer);
    expect(back.worksheets).toHaveLength(5);
  });

  it("reads right to left for Arabic, with sheet names Excel accepts", () => {
    const c = content({ sections: [{ id: "s", title: "الحملات: [الأداء]/الشهر", blocks: [{ kind: "table", columns: ["a"], rows: [["1"]] }] }] });
    const wb = exportWorkbook(ExcelJS, report(c, "تقرير"), opts);
    expect(wb.worksheets[0]!.views[0]).toMatchObject({ rightToLeft: true });
    expect(wb.worksheets.at(-1)!.name).toBe("الحملات الأداء الشهر");
  });

  it("only turns clear numbers into numbers", () => {
    expect(cellValue("1,240 USD")).toEqual({ value: 1240, format: "#,##0" });
    expect(cellValue("12.5%")).toEqual({ value: 0.125, format: "0.0%" });
    expect(cellValue("4.2×")).toEqual({ value: 4.2, format: "#,##0.00" });
    expect(cellValue("0123")).toEqual({ value: "0123" });
    expect(cellValue("Search LB")).toEqual({ value: "Search LB" });
    expect(cellValue("2026-11-10")).toEqual({ value: "2026-11-10" });
  });

  it("names the file after the report, safely", () => {
    expect(exportFileName(report(content(), 'Q4: "best"/worst?'), "xlsx")).toBe("Q4 best worst .xlsx".replace(" .", "."));
  });
});

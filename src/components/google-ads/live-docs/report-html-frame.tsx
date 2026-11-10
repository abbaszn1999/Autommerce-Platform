"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { REPORT_SANDBOX, sandboxedReport } from "@/lib/google-ads/report-sandbox";

const MIN = 120;
const MAX = 4000;

/**
 * An html block of a report, in a frame that can run its scripts but can't
 * reach the network, the app or the page around it (see report-sandbox). The
 * frame tells us its height, so the report reads as one page.
 */
export function ReportHtmlFrame({ html, title }: { html: string; title: string }) {
  const { resolvedTheme } = useTheme();
  const doc = useMemo(() => sandboxedReport(html, resolvedTheme === "dark"), [html, resolvedTheme]);
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(360);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      // Only our own frame's message counts; its origin is opaque ("null"), so match the window itself.
      if (e.source !== ref.current?.contentWindow) return;
      const h = Number((e.data as { autommerceReportHeight?: unknown } | null)?.autommerceReportHeight);
      if (Number.isFinite(h)) setHeight(Math.max(MIN, Math.min(MAX, Math.ceil(h))));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <figure className="overflow-hidden rounded-xl border border-border/60 print:break-inside-avoid">
      {title && <figcaption dir="auto" className="border-b border-border/60 bg-muted/30 px-3 py-2 text-[12px] font-semibold">{title}</figcaption>}
      <iframe ref={ref} title={title || "Report"} srcDoc={doc} sandbox={REPORT_SANDBOX} referrerPolicy="no-referrer" loading="lazy" style={{ height }} className="block w-full border-0 bg-white dark:bg-background" />
    </figure>
  );
}

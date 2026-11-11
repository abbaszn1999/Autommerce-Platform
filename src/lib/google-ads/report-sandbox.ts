// An HTML block in a report runs the agent's own page (charts, layouts, any
// JavaScript) inside a sandboxed frame. The report holds the account's data,
// so the frame must never send it anywhere:
// - the sandbox gives it an opaque origin with no popups and no top navigation;
// - a Content-Security-Policy, placed before anything the report wrote, blocks
//   every request: fetch, images, fonts, frames, forms, media. Scripts may only be
//   inline, plus one pinned charting library;
// - the report's frame sits inside a wrapper frame whose policy allows no frame
//   URLs at all (frame-src 'none'): browsers check every navigation of a frame
//   against its parent's policy, so the report can't navigate itself away
//   (a link, location = "https://…?data") — a script inside it can't prevent that;
// - tags that navigate or embed on their own are refused when the report is saved.

/** The one library a report may load: Chart.js, at a fixed version. */
export const CHART_JS_URL = "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";

export const REPORT_CSP = [
  "default-src 'none'",
  `script-src 'unsafe-inline' ${CHART_JS_URL}`,
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "connect-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "worker-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

/**
 * The store assistant's reports (files in the panel) may use the usual chart libraries, web fonts
 * and product images by URL, but still can't send anything: no fetch, forms, frames or navigation.
 * An image URL is the one way out left, which product photos need.
 */
const REPORT_CDNS = "https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com";
export const STORE_REPORT_CSP = [
  "default-src 'none'",
  `script-src 'unsafe-inline' 'unsafe-eval' ${REPORT_CDNS}`,
  `style-src 'unsafe-inline' ${REPORT_CDNS} https://fonts.googleapis.com`,
  "img-src https: data: blob:",
  `font-src data: ${REPORT_CDNS} https://fonts.gstatic.com`,
  "media-src https: data: blob:",
  "connect-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "worker-src 'none'",
  "object-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join("; ");

/** The sandbox attribute for report frames: scripts, nothing else. */
export const REPORT_SANDBOX = "allow-scripts";

/** Tags that could navigate, embed or submit by themselves. */
const FORBIDDEN = [
  { re: /<meta\b[^>]*http-equiv/i, what: "a <meta http-equiv> tag" },
  { re: /<(iframe|frame|frameset|object|embed|portal)\b/i, what: "an embedded frame or object" },
  { re: /<form\b/i, what: "a form" },
  { re: /<base\b/i, what: "a <base> tag" },
  { re: /<link\b[^>]*rel\s*=\s*["']?(prefetch|preconnect|dns-prefetch|prerender|preload|modulepreload|stylesheet)/i, what: "a <link> to another resource" },
];

export const REPORT_HTML_MAX = 200_000;

/** Why an HTML block can't be saved, or null when it can. */
export function reportHtmlProblem(html: string): string | null {
  if (!html.trim()) return "is empty";
  if (html.length > REPORT_HTML_MAX) return `is longer than ${REPORT_HTML_MAX.toLocaleString("en")} characters`;
  for (const f of FORBIDDEN) if (f.re.test(html)) return `contains ${f.what}, which reports can't use`;
  for (const m of html.matchAll(/<script\b[^>]*?\bsrc\s*=\s*(["']?)([^"'\s>]*)\1/gi))
    if (m[2] !== CHART_JS_URL) return "contains a script from another address, which reports can't use (only Chart.js 4.4.1 from jsDelivr may be loaded)";
  return null;
}

/**
 * Runs before the report's own scripts: no navigation, no popups, and the page's height for the frame around it.
 * Height rules (FILL_SLACK px of tolerance for paddings):
 * - content clearly shorter than the window: that is its natural height, remembered and reported;
 * - content reaching the window: it either overflows (report its height) or is laid out to fill the
 *   window (height: 100%), which measures the window itself: it never shrinks then, and a small window
 *   is grown to FILL_HEIGHT. A remembered natural height wins while the content hasn't grown past it,
 *   so the frame never swings between two heights.
 */
export const FILL_HEIGHT = 480;
const FILL_SLACK = 12;
const GUARD = `<script>(function(){
var stop=function(e){try{e.preventDefault();}catch(_){}};
try{if(window.navigation){navigation.addEventListener("navigate",stop);}}catch(_){}
document.addEventListener("click",function(e){var a=e.target&&e.target.closest&&e.target.closest("a[href]");if(a){e.preventDefault();try{var u=new URL(a.getAttribute("href"),location.href);if(/^https?:$/.test(u.protocol)){parent.postMessage({autommerceOpenLink:u.href},"*");}}catch(_){}}},true);
document.addEventListener("submit",stop,true);
try{window.open=function(){return null;};}catch(_){}
var last=0;var natural=0;var send=function(){var b=document.body;var cs=b?getComputedStyle(b):null;var h=b?Math.ceil(b.scrollHeight+parseFloat(cs.marginTop||0)+parseFloat(cs.marginBottom||0)):0;if(h<innerHeight-${FILL_SLACK}){natural=h;}else if(natural&&h<=natural+${FILL_SLACK}){h=natural;}else{natural=0;h=Math.max(h,innerHeight<${FILL_HEIGHT}?${FILL_HEIGHT}:innerHeight);}if(h!==last){last=h;parent.postMessage({autommerceReportHeight:h},"*");}};
addEventListener("load",send);if(window.ResizeObserver){new ResizeObserver(send).observe(document.documentElement);addEventListener("DOMContentLoaded",function(){new ResizeObserver(send).observe(document.body);});}setTimeout(send,50);setTimeout(send,600);
})();</script>`;

const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The wrapper frame: no URL may load in any frame it holds, and it passes the report's height on. */
// The report frame inherits this policy too (srcdoc frames do), so the one library is allowed here as well.
const WRAPPER_CSP = `default-src 'none'; frame-src 'none'; child-src 'none'; script-src 'unsafe-inline' ${CHART_JS_URL}; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'`;

export type ReportPolicy = {
  /** The report's own policy. */
  csp: string;
  /** The wrapper's policy: the report frame inherits it, so it must allow what the report may load. */
  wrapperCsp: string;
  /** Tell the page the app's theme (Google Ads reports always; store files only when written for it). */
  theme: boolean;
};
const GOOGLE_ADS_POLICY: ReportPolicy = { csp: REPORT_CSP, wrapperCsp: WRAPPER_CSP, theme: true };
/** A store file: the report's policy is also the wrapper's (it already forbids every frame URL). */
export const STORE_POLICY: ReportPolicy = { csp: STORE_REPORT_CSP, wrapperCsp: STORE_REPORT_CSP, theme: true };

/**
 * What goes in the frame on the page: a wrapper that holds the report's own frame.
 * Use with sandbox={REPORT_SANDBOX}.
 */
export function sandboxedReport(html: string, dark: boolean, policy: ReportPolicy = GOOGLE_ADS_POLICY): string {
  return (
    `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy.wrapperCsp}"><meta name="referrer" content="no-referrer">` +
    `<style>html,body{margin:0;padding:0;background:transparent}iframe{display:block;width:100%;height:100vh;border:0}</style>` +
    `<iframe sandbox="${REPORT_SANDBOX}" referrerpolicy="no-referrer" srcdoc="${attr(reportDocument(html, dark, policy))}"></iframe>` +
    `<script>addEventListener("message",function(e){var f=document.querySelector("iframe");var d=e.data;if(!f||e.source!==f.contentWindow||!d)return;if(typeof d.autommerceReportHeight==="number"){parent.postMessage({autommerceReportHeight:d.autommerceReportHeight},"*");}else if(typeof d.autommerceOpenLink==="string"){parent.postMessage({autommerceOpenLink:d.autommerceOpenLink},"*");}});</script>`
  );
}

/** The report's own document: our policy and guard first, then the report, told the app's theme. */
export function reportDocument(html: string, dark: boolean, policy: ReportPolicy = GOOGLE_ADS_POLICY): string {
  const body = html.replace(/^\s*<!doctype[^>]*>/i, "");
  const theme = dark ? "dark" : "light";
  const withTheme = policy.theme && /<html(\s[^>]*)?>/i.test(body)
    ? body.replace(/<html(\s[^>]*)?>/i, (_m, rest = "") => `<html${String(rest).replace(/\sdata-theme\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, "")} data-theme="${theme}">`)
    : body;
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${policy.csp}"><meta name="referrer" content="no-referrer"><style>*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style>${GUARD}${withTheme}`;
}

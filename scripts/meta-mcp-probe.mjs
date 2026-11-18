// Stage A check: can our Meta app's user token reach Meta's official Ads MCP server?
//
// Run it yourself; the token never leaves your machine except to Meta:
//   PowerShell:  $env:META_TEST_TOKEN="<token from Graph API Explorer>"; node scripts/meta-mcp-probe.mjs
//
// It connects to https://mcp.facebook.com/ads, lists the tools with their input formats,
// calls four read-only tools (ad accounts, businesses, pages, catalogs) and writes the
// result to meta-ads/mcp-probe-result.json.
// The token itself is never printed or saved. Nothing is created, changed or spent.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const URL_MCP = "https://mcp.facebook.com/ads";
const token = process.env.META_TEST_TOKEN?.trim();
if (!token) {
  console.error("Set META_TEST_TOKEN first (see the comment at the top of this file).");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outFile = path.join(root, "meta-ads", "mcp-probe-result.json");
const redact = (s) => String(s).split(token).join("<token>");

let sessionId = null;
let nextId = 1;

/** One JSON-RPC message over MCP's HTTP transport. Accepts a JSON or an SSE reply. */
async function rpc(method, params, { notify = false } = {}) {
  const body = notify ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id: nextId++, method, params };
  const res = await fetch(URL_MCP, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-06-18",
      ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
    },
    body: JSON.stringify(body),
  });
  sessionId = res.headers.get("mcp-session-id") ?? sessionId;
  const text = await res.text();
  if (notify) return { status: res.status };
  let msg = null;
  if ((res.headers.get("content-type") ?? "").includes("text/event-stream")) {
    for (const line of text.split("\n")) {
      if (!line.startsWith("data:")) continue;
      try {
        const m = JSON.parse(line.slice(5).trim());
        if (m.id === body.id) msg = m;
      } catch {}
    }
  } else {
    try { msg = JSON.parse(text); } catch {}
  }
  return {
    status: res.status,
    contentType: res.headers.get("content-type"),
    usage: res.headers.get("x-business-use-case-usage") ?? res.headers.get("x-app-usage"),
    msg,
    raw: msg ? undefined : redact(text.slice(0, 2000)),
  };
}

const result = { at: new Date().toISOString(), server: URL_MCP, steps: {} };

try {
  const init = await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "autommerce-probe", version: "0.1" },
  });
  result.steps.initialize = {
    status: init.status,
    contentType: init.contentType,
    sessionId: Boolean(sessionId),
    server: init.msg?.result?.serverInfo,
    protocolVersion: init.msg?.result?.protocolVersion,
    error: init.msg?.error ?? init.raw,
  };
  if (init.status === 200 && init.msg?.result) {
    await rpc("notifications/initialized", {}, { notify: true });

    const list = await rpc("tools/list", {});
    const tools = list.msg?.result?.tools ?? [];
    result.steps.toolsList = {
      status: list.status,
      count: tools.length,
      tools: tools.map((t) => ({
        name: t.name,
        description: (t.description ?? "").split("\n")[0].slice(0, 200),
        readOnly: t.annotations?.readOnlyHint,
        destructive: t.annotations?.destructiveHint,
        inputSchema: t.inputSchema,
      })),
      error: list.msg?.error ?? list.raw,
    };

    // Read-only calls only: the shape of each answer is what the live panel parses.
    const read = async (name, args = {}) => {
      const call = await rpc("tools/call", { name, arguments: args });
      const content = call.msg?.result?.content ?? [];
      return {
        tool: name,
        arguments: args,
        status: call.status,
        isError: call.msg?.result?.isError ?? null,
        usageHeader: call.usage,
        preview: redact(content.map((c) => c.text ?? `[${c.type}]`).join("\n").slice(0, 3000)),
        error: call.msg?.error ?? call.raw,
      };
    };
    result.steps.readCall = await read("ads_get_ad_accounts");
    result.steps.samples = [
      await read("ads_catalog_get_businesses"),
      await read("ads_get_user_pages"),
      await read("ads_catalog_list_catalogs"),
    ];
  }
} catch (e) {
  result.error = redact(e?.message ?? e);
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
console.log(`initialize: ${result.steps.initialize?.status ?? "failed"}`);
console.log(`tools/list: ${result.steps.toolsList?.count ?? "-"} tools`);
console.log(`ads_get_ad_accounts: ${result.steps.readCall ? (result.steps.readCall.isError ? "error" : "ok") : "-"}`);
console.log(`Saved to ${path.relative(root, outFile)} (no token inside).`);

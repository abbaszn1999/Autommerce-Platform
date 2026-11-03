// Requests from the agent service to the site (the reverse of /store-agent/*):
// signed with the same shared secret and scheme, so only our agent service can
// call the Google Ads agent endpoints, for the user its run belongs to.

import { timingSafeEqual } from "node:crypto";
import { signServiceRequest } from "@/lib/assistant/service-client";

/** Requests older (or newer) than this are refused, which bounds replays. */
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export type AgentCaller = { ok: true; userId: string } | { ok: false; reason: string };

export function verifyAgentRequest(params: {
  method: string;
  path: string;
  body: string;
  headers: Headers;
  now?: number;
}): AgentCaller {
  const secret = process.env.ASSISTANT_SERVICE_SECRET ?? "";
  if (secret.length < 32) return { ok: false, reason: "not configured" };
  const signature = params.headers.get("x-assistant-signature") ?? "";
  const timestamp = Number(params.headers.get("x-assistant-timestamp"));
  const userId = params.headers.get("x-assistant-user") ?? "";
  if (!signature || !userId || !Number.isFinite(timestamp)) return { ok: false, reason: "missing auth headers" };
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return { ok: false, reason: "bad user" };
  if (Math.abs((params.now ?? Date.now()) - timestamp) > MAX_CLOCK_SKEW_MS) return { ok: false, reason: "stale timestamp" };
  const expected = Buffer.from(signServiceRequest({ secret, timestamp, userId, method: params.method, path: params.path, body: params.body }), "hex");
  const given = Buffer.from(signature, "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "bad signature" };
  return { ok: true, userId };
}

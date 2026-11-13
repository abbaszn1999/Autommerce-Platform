// Competitor ads on the server: SE Ranking's paid keyword list for a site in a
// country, through the platform's own key. Only that one report is requested
// (domain/keywords, type=adv); nothing else of SE Ranking's API is reachable
// from here.
//
// Each page of a site's list is bought once a month and shared by every
// workspace (SE Ranking refreshes the data monthly). A workspace pays our cost
// for the pages bought for it, no margin, and nothing for pages already here.

import type { SupabaseClient } from "@supabase/supabase-js";
import { isInsufficientCredits, settleProviderUsage } from "@/lib/jobs/credits";
import { getWorkspaceContext, isContextSubscriptionActive } from "@/lib/workspace-context";
import { loadConnection } from "./connection.server";
import { accountTerms } from "./keyword-planner.server";
import {
  CompetitorInputError,
  KEYWORDS_PAGE_SIZE,
  MAX_PAGES,
  UNITS_PER_PAGE,
  cleanKeywords,
  dataMonth,
  markAccount,
  sourceFor,
  totalsOf,
  unitsToCredits,
  type CompetitorAnalysis,
  type CompetitorTarget,
} from "./competitor-ads";

const API = "https://api.seranking.com/v1";
/** Paid lookups a workspace can make in an hour (abuse guard; each one is paid at cost). */
const HOURLY_LIMIT = 30;

/** SE Ranking cannot answer (our key, our balance, their service): not the customer's fault. */
export class CompetitorUnavailableError extends Error {}

/** The workspace's credits do not cover the pages still to buy. */
export class CompetitorCreditsError extends Error {
  constructor(
    public needed: number,
    public balance: number,
    public reason: "no_subscription" | "no_credits"
  ) {
    super(reason === "no_subscription" ? "An active plan is needed to look up a competitor." : `This lookup costs ${needed} credits and the balance is ${balance}.`);
  }
}

function config() {
  const key = process.env.SERANKING_API_KEY?.trim();
  if (!key) throw new CompetitorUnavailableError("not_configured");
  // What one SE Ranking unit costs us, in USD. Wallet: $50 for 250,000 units.
  const usdPerUnit = Number(process.env.SERANKING_USD_PER_UNIT) > 0 ? Number(process.env.SERANKING_USD_PER_UNIT) : 50 / 250_000;
  // Requests per second allowed on our key (trial accounts: 1).
  const rps = Number(process.env.SERANKING_RPS) > 0 ? Number(process.env.SERANKING_RPS) : 1;
  const lowUnits = Number(process.env.SERANKING_LOW_UNITS) > 0 ? Number(process.env.SERANKING_LOW_UNITS) : 25_000;
  return { key, usdPerUnit, rps, lowUnits };
}

export function creditsPerPage(): number {
  return unitsToCredits(UNITS_PER_PAGE, config().usdPerUnit);
}

// ─── SE Ranking ───────────────────────────────────────────────────────────

// Requests leave one at a time, spaced to stay under our key's rate limit.
let queue: Promise<unknown> = Promise.resolve();
function throttled<T>(task: () => Promise<T>): Promise<T> {
  const gap = 1000 / config().rps + 50;
  const run = queue.then(task);
  queue = run.catch(() => undefined).then(() => new Promise((r) => setTimeout(r, gap)));
  return run;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const countryName = (code: string) => new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;

/** One page of the paid keyword list, straight from SE Ranking. */
async function fetchPaidPage(target: CompetitorTarget, page: number): Promise<unknown[]> {
  const { key } = config();
  const params = new URLSearchParams({
    source: sourceFor(target.country),
    domain: target.domain,
    type: "adv",
    with_subdomains: "1",
    limit: String(KEYWORDS_PAGE_SIZE),
    page: String(page),
    order_field: "volume",
    order_type: "desc",
  });
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await throttled(() => fetch(`${API}/domain/keywords?${params}`, { headers: { Authorization: `Token ${key}` }, signal: AbortSignal.timeout(45_000) }));
    } catch (err) {
      if (attempt < 2) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      console.error("[competitor-ads] SE Ranking unreachable", (err as Error).message);
      throw new CompetitorUnavailableError("unreachable");
    }
    if ((res.status === 429 || res.status === 503) && attempt < 3) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    const text = await res.text();
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      // Not JSON: handled below.
    }
    if (res.ok && Array.isArray(body)) return body;
    if (res.ok && body && typeof body === "object" && !("error" in body) && !("message" in body)) return [];

    const message = String((body as { message?: unknown; error?: unknown } | null)?.message ?? (body as { error?: unknown } | null)?.error ?? text).slice(0, 300);
    if (res.status === 244) throw new CompetitorInputError("This site is too big for this lookup (like google.com or facebook.com).");
    if (/source/i.test(message)) throw new CompetitorInputError(`Competitor ads are not available for ${countryName(target.country)} yet.`);
    if (/domain/i.test(message) && res.status === 400) throw new CompetitorInputError(`"${target.domain}" is not a site the data covers. Check the address.`);
    // Our balance, our key or their service: tell the team, not the customer.
    console.error(`[competitor-ads] SE Ranking ${res.status}: ${message}`);
    throw new CompetitorUnavailableError(/insufficient|funds|license|expired|token/i.test(message) ? "provider_account" : "provider_error");
  }
}

let balanceCheckedAt = 0;
/** Warns the team in the logs when our SE Ranking balance runs low (checked at most every 10 minutes; free). */
function watchBalance() {
  if (Date.now() - balanceCheckedAt < 10 * 60_000) return;
  balanceCheckedAt = Date.now();
  const { key, lowUnits } = config();
  void fetch(`${API}/account/subscription`, { headers: { Authorization: `Token ${key}` }, signal: AbortSignal.timeout(15_000) })
    .then((r) => r.json())
    .then((body: { subscription_info?: { units_left?: number; expiraton_date?: string } }) => {
      const left = Number(body?.subscription_info?.units_left);
      if (Number.isFinite(left) && left < lowUnits) console.error(`[competitor-ads] SE Ranking balance low: ${left} units left (top up the API wallet).`);
    })
    .catch(() => undefined);
}

// ─── The shared monthly copy ──────────────────────────────────────────────

type Stored = { page: number; rows: unknown[] };

async function storedPages(admin: SupabaseClient, target: CompetitorTarget, month: string): Promise<Stored[]> {
  const { data, error } = await admin
    .from("competitor_ads_pages")
    .select("page, rows")
    .eq("domain", target.domain)
    .eq("country", target.country)
    .eq("month", month)
    .order("page");
  if (error) throw new Error(`competitor_ads_pages: ${error.message}`);
  return (data ?? []).map((r) => ({ page: Number(r.page), rows: Array.isArray(r.rows) ? r.rows : [] }));
}

// Two requests for the same page at once share one purchase; only the first pays.
const inFlight = new Map<string, Promise<unknown[]>>();

async function buyPage(admin: SupabaseClient, target: CompetitorTarget, month: string, page: number): Promise<{ rows: unknown[]; bought: boolean }> {
  const key = `${target.domain}|${target.country}|${month}|${page}`;
  const running = inFlight.get(key);
  if (running) return { rows: await running, bought: false };
  const task = (async () => {
    const rows = await fetchPaidPage(target, page);
    const { error } = await admin
      .from("competitor_ads_pages")
      .upsert({ domain: target.domain, country: target.country, month, page, rows, units: UNITS_PER_PAGE }, { onConflict: "domain,country,month,page", ignoreDuplicates: true });
    if (error) console.error("[competitor-ads] could not keep the page", error.message);
    return rows;
  })();
  inFlight.set(key, task);
  try {
    return { rows: await task, bought: true };
  } finally {
    inFlight.delete(key);
    watchBalance();
  }
}

/**
 * The first page of 1..want still to buy, and at most how many pages from there
 * (a page after a short one does not exist, so fewer may be bought).
 */
function toBuy(stored: Stored[], want: number): { from: number; upTo: number } | null {
  for (let page = 1; page <= want; page++) {
    const have = stored.find((s) => s.page === page);
    if (!have) return { from: page, upTo: want - page + 1 };
    if (have.rows.length < KEYWORDS_PAGE_SIZE) return null;
  }
  return null;
}

// ─── Analyses ─────────────────────────────────────────────────────────────

export type Quote = { credits: number; pagesToBuy: number; creditsPerPage: number };

/** What a lookup would cost this workspace now (nothing when the month's copy has it). */
export async function quoteAnalysis(admin: SupabaseClient, target: CompetitorTarget, pages = 1): Promise<Quote> {
  const want = Math.min(MAX_PAGES, Math.max(1, Math.round(pages)));
  const plan = toBuy(await storedPages(admin, target, dataMonth()), want);
  const perPage = creditsPerPage();
  const count = plan?.upTo ?? 0;
  return { credits: Math.round(count * perPage * 1000) / 1000, pagesToBuy: count, creditsPerPage: perPage };
}

/**
 * Runs (or reopens) a lookup: buys the pages this month's copy is missing,
 * charges the workspace our cost for them, and returns the cleaned list.
 */
export async function runAnalysis(input: {
  admin: SupabaseClient;
  workspaceId: string;
  userId: string;
  target: CompetitorTarget;
  /** Pages of the list wanted (1,000 rows each). */
  pages?: number;
}): Promise<CompetitorAnalysis> {
  const { admin, workspaceId, userId, target } = input;
  const month = dataMonth();
  const want = Math.min(MAX_PAGES, Math.max(1, Math.round(input.pages ?? 1)));
  let stored = await storedPages(admin, target, month);
  const plan = toBuy(stored, want);
  const { usdPerUnit } = config();

  let ownerUserId: string | null = null;
  if (plan) {
    const ctx = await getWorkspaceContext({ workspaceId, userId });
    // The most it can cost; only the pages actually bought are charged.
    const needed = unitsToCredits(plan.upTo * UNITS_PER_PAGE, usdPerUnit);
    if (!ctx.subscription || !isContextSubscriptionActive(ctx)) throw new CompetitorCreditsError(needed, 0, "no_subscription");
    const balance = Math.max(0, Number(ctx.credits?.total ?? 0));
    if (balance < needed) throw new CompetitorCreditsError(needed, balance, "no_credits");
    ownerUserId = String(ctx.subscription.user_id);
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { count } = await admin
      .from("competitor_ads_analyses")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gt("units_bought", 0)
      .gte("updated_at", since);
    if ((count ?? 0) >= HOURLY_LIMIT) throw new CompetitorInputError("Too many new competitor lookups in the last hour. Try again later; lookups you already ran open for free.");
  }

  // The workspace's record for this site, country and month (created on first look).
  const { data: existing } = await admin
    .from("competitor_ads_analyses")
    .select("id, pages, units_bought, credits_charged")
    .eq("workspace_id", workspaceId)
    .eq("domain", target.domain)
    .eq("country", target.country)
    .eq("month", month)
    .maybeSingle();
  let record = existing;
  if (!record) {
    const { data, error } = await admin
      .from("competitor_ads_analyses")
      .upsert({ workspace_id: workspaceId, domain: target.domain, country: target.country, month, requested_by: userId }, { onConflict: "workspace_id,domain,country,month" })
      .select("id, pages, units_bought, credits_charged")
      .single();
    if (error) throw new Error(`competitor_ads_analyses: ${error.message}`);
    record = data;
  }

  // Buy what is missing, one page at a time (a short page means the list ends there).
  const bought: number[] = [];
  for (let page = plan?.from ?? want + 1; page <= want; page++) {
    const kept = stored.find((s) => s.page === page);
    const rows = kept ? kept.rows : await buyPage(admin, target, month, page).then((result) => {
      if (result.bought) bought.push(page);
      stored = [...stored, { page, rows: result.rows }].sort((a, b) => a.page - b.page);
      return result.rows;
    });
    if (rows.length < KEYWORDS_PAGE_SIZE) break;
  }

  let charged = 0;
  if (bought.length && ownerUserId) {
    const amount = unitsToCredits(bought.length * UNITS_PER_PAGE, usdPerUnit);
    const result = await settleProviderUsage({
      admin,
      ownerUserId,
      workspaceId,
      actorUserId: userId,
      amount,
      operation: "competitor_ads",
      entityType: "competitor_ads",
      entityId: record!.id,
      idempotencyKey: `competitor_ads:${workspaceId}:${target.domain}:${target.country}:${month}:${bought.join("-")}`,
      details: { domain: target.domain, country: target.country, month, pages: bought, units: bought.length * UNITS_PER_PAGE },
    });
    charged = result.charged;
    if (result.billingError && !isInsufficientCredits(result.billingError)) console.error("[competitor-ads] billing failed:", result.billingError);
    if (result.shortfall > 0) console.error(`[competitor-ads] ${result.shortfall} credits could not be charged to workspace ${workspaceId}`);
  }

  // Our list: free listings out, one row per keyword, the customer's account compared when connected.
  const pagesLoaded = stored.filter((s) => s.page <= want);
  const { rows, freeListingsRemoved } = cleanKeywords(
    pagesLoaded.flatMap((s) => s.rows),
    target.domain
  );
  let terms: Awaited<ReturnType<typeof accountTerms>> | null = null;
  const ads = await loadConnection(admin, workspaceId, "ads").catch(() => null);
  if (ads?.composio_connected_account_id && ads.account_id) terms = await accountTerms(ads).catch(() => null);
  const keywords = markAccount(rows, terms && (terms.keywords.size || terms.negatives.size) ? terms : null);
  const totals = totalsOf(keywords);
  const last = pagesLoaded.at(-1);
  const creditsCharged = Math.round((Number(record!.credits_charged) + charged) * 1000) / 1000;

  await admin
    .from("competitor_ads_analyses")
    .update({
      pages: Math.max(Number(record!.pages) || 1, pagesLoaded.length || 1),
      units_bought: Number(record!.units_bought) + bought.length * UNITS_PER_PAGE,
      credits_charged: creditsCharged,
      totals,
      updated_at: new Date().toISOString(),
    })
    .eq("id", record!.id);

  return {
    id: record!.id,
    ...target,
    month,
    keywords,
    totals,
    pages: pagesLoaded.length,
    hasMore: !!last && last.rows.length >= KEYWORDS_PAGE_SIZE && pagesLoaded.length < MAX_PAGES,
    freeListingsRemoved,
    comparedWithAccount: !!terms && (terms.keywords.size > 0 || terms.negatives.size > 0),
    creditsCharged,
    chargedNow: charged,
    fetchedAt: new Date().toISOString(),
  };
}

export type AnalysisSummary = {
  id: string;
  domain: string;
  country: string;
  month: string;
  pages: number;
  creditsCharged: number;
  totals: { keywords?: number; traffic?: number; cost?: number };
  updatedAt: string;
};

/** The workspace's lookups, newest first. Reopening one this month is free. */
export async function listAnalyses(admin: SupabaseClient, workspaceId: string): Promise<AnalysisSummary[]> {
  const { data, error } = await admin
    .from("competitor_ads_analyses")
    .select("id, domain, country, month, pages, credits_charged, totals, updated_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`competitor_ads_analyses: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: r.id,
    domain: r.domain,
    country: r.country,
    month: r.month,
    pages: r.pages,
    creditsCharged: Number(r.credits_charged) || 0,
    totals: (r.totals ?? {}) as AnalysisSummary["totals"],
    updatedAt: r.updated_at,
  }));
}

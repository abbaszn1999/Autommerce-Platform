// Keyword Planner through the workspace's Google Ads connection (Composio's
// Keyword Plan Idea tools). Countries and the language default to the business
// profile; every keyword is marked when the account already has it. Results are
// kept for 30 minutes (Google limits how often these can be asked).

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadProfile } from "../business-profile.server";
import { ConnectionHttpError, execute, searchGaql, type ConnectionRow } from "./connection.server";
import { loadLiveAccount } from "./live-report.server";
import { rangeFor, todayIn } from "./metrics";
import {
  KeywordInputError,
  MAX_IDEAS,
  countryCodes,
  parseForecast,
  parseMetricKeywords,
  parseSeed,
  regionNameIndex,
  sortRows,
  toMicros,
  toRow,
  type Forecast,
  type IdeaSeed,
  type KeywordResearch,
} from "./keyword-planner";

const TTL_MS = 30 * 60_000;
const cache = new Map<string, { at: number; value: unknown }>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.value as T);
  return load().then((value) => {
    cache.set(key, { at: Date.now(), value });
    if (cache.size > 300) cache.delete(cache.keys().next().value!);
    return value;
  });
}

let nameToCode: ((name: string) => string | undefined) | null = null;
const regionCode = (name: string) => (nameToCode ??= regionNameIndex())(name);
const regionName = (code: string) => new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;

type Targeting = { countries: { code: string; name: string; resource: string }[]; language: { code: string; name: string; resource: string } | null };

/** Countries and language as Google's resource names; defaults come from the business profile. */
async function targeting(admin: SupabaseClient, row: ConnectionRow, raw: { countries?: unknown; language?: unknown }): Promise<Targeting> {
  const customerId = row.account_id!;
  const profile = raw.countries === undefined || raw.language === undefined ? (await loadProfile(admin, row.workspace_id)).values : null;
  const codes = countryCodes(raw.countries ?? profile?.markets ?? [], regionCode);
  if ((Array.isArray(raw.countries) || typeof raw.countries === "string") && String(raw.countries).trim() && !codes.length)
    throw new KeywordInputError("None of those countries is known. Use country names or two-letter codes, e.g. LB, AE.");

  const countries = codes.length
    ? await cached(`geo:${codes.join(",")}`, async () => {
        const rows = await searchGaql<{ geoTargetConstant?: { countryCode?: string; resourceName?: string } }>(
          row,
          customerId,
          `SELECT geo_target_constant.resource_name, geo_target_constant.country_code FROM geo_target_constant WHERE geo_target_constant.country_code IN (${codes.map((c) => `'${c}'`).join(", ")}) AND geo_target_constant.target_type = 'Country'`,
          1
        );
        return rows
          .map((r) => ({ code: String(r.geoTargetConstant?.countryCode ?? ""), resource: String(r.geoTargetConstant?.resourceName ?? "") }))
          .filter((r) => r.code && r.resource)
          .map((r) => ({ ...r, name: regionName(r.code) }));
      })
    : [];

  // One language at a time in Keyword Planner. A profile with several languages means all languages.
  const asked = raw.language !== undefined ? String(raw.language ?? "").trim() : profile?.languages && Array.isArray(profile.languages) && profile.languages.length === 1 ? String(profile.languages[0]) : "";
  let language: Targeting["language"] = null;
  if (asked && !/^all$/i.test(asked)) {
    const safe = asked.replace(/[^\p{L} -]/gu, "").slice(0, 40);
    const rows = await cached(`lang:${safe.toLowerCase()}`, () =>
      searchGaql<{ languageConstant?: { code?: string; name?: string; resourceName?: string } }>(
        row,
        customerId,
        /^[a-z]{2}$/i.test(safe)
          ? `SELECT language_constant.resource_name, language_constant.code, language_constant.name FROM language_constant WHERE language_constant.code = '${safe.toLowerCase()}'`
          : `SELECT language_constant.resource_name, language_constant.code, language_constant.name FROM language_constant WHERE language_constant.name = '${safe.charAt(0).toUpperCase()}${safe.slice(1).toLowerCase()}'`,
        1
      )
    );
    const l = rows[0]?.languageConstant;
    if (!l?.resourceName) throw new KeywordInputError(`"${asked}" is not a language Google Ads knows. Use a name like Arabic or a code like ar.`);
    language = { code: String(l.code), name: String(l.name), resource: l.resourceName };
  }
  return { countries, language };
}

/** The account's keyword texts and negatives, to mark ideas it already has (empty when it can't load). */
export async function accountTerms(row: ConnectionRow) {
  try {
    const { data } = await loadLiveAccount(row, rangeFor("LAST_30_DAYS", todayIn(row.account_time_zone)));
    return {
      keywords: new Set(data.keywords.filter((k) => k.status !== "REMOVED").map((k) => k.text.toLowerCase())),
      negatives: new Set(data.negatives.map((n) => n.text.toLowerCase())),
    };
  } catch {
    return { keywords: new Set<string>(), negatives: new Set<string>() };
  }
}

function seedArgs(seed: IdeaSeed) {
  switch (seed.kind) {
    case "keywords":
      return { keyword_seed: { keywords: seed.keywords } };
    case "url":
      return { url_seed: { url: seed.url } };
    case "site":
      return { site_seed: { site: seed.site } };
    case "keywords_and_url":
      return { keyword_and_url_seed: { keywords: seed.keywords, url: seed.url } };
  }
}

const googleError = (err: unknown): never => {
  if (err instanceof ConnectionHttpError && err.message === "google_request_failed") {
    const d = err.detail ?? "";
    if (/RESOURCE_EXHAUSTED|RATE|quota/i.test(d)) throw new KeywordInputError("Google is limiting Keyword Planner requests right now. Try again in a minute.");
    throw new KeywordInputError(`Google Keyword Planner refused the request: ${d.replace(/\s+/g, " ").slice(0, 300)}`);
  }
  throw err;
};

/** Ideas from keywords, a page or a site; or search volumes for given keywords. */
export async function keywordResearch(admin: SupabaseClient, row: ConnectionRow, raw: Record<string, unknown>): Promise<KeywordResearch> {
  const customerId = row.account_id;
  if (!customerId) throw new ConnectionHttpError(409, "not_connected");
  const mode = raw.mode === "metrics" ? "metrics" : "ideas";
  const target = await targeting(admin, row, { countries: raw.countries, language: raw.language });
  const common = {
    customer_id: customerId,
    geo_target_constants: target.countries.map((c) => c.resource),
    ...(target.language ? { language: target.language.resource } : {}),
    keyword_plan_network: "GOOGLE_SEARCH",
    include_adult_keywords: false,
  };
  const limit = Math.min(MAX_IDEAS, Math.max(10, Math.round(Number(raw.limit) || 300)));
  const seed = mode === "ideas" ? parseSeed(raw) : undefined;
  const keywords = mode === "metrics" ? parseMetricKeywords(raw.keywords) : [];
  const key = `kw:${customerId}:${mode}:${JSON.stringify(seed ?? keywords)}:${common.geo_target_constants.join(",")}:${common.language ?? ""}:${limit}`;

  const raws = await cached(key, async () => {
    try {
      if (mode === "metrics") {
        const res = await execute<{ results?: Record<string, unknown>[] }>(row, "GOOGLEADS_GENERATE_KEYWORD_HISTORICAL_METRICS", { ...common, keywords });
        return { results: res.results ?? [], total: null as number | null };
      }
      // Google returns the best ideas first; read pages until the limit.
      const results: Record<string, unknown>[] = [];
      let pageToken: string | undefined;
      let total: number | null = null;
      for (let page = 0; page < 5 && results.length < limit; page++) {
        const res = await execute<{ results?: Record<string, unknown>[]; next_page_token?: string; nextPageToken?: string; total_size?: string; totalSize?: string }>(
          row,
          "GOOGLEADS_GENERATE_KEYWORD_IDEAS",
          { ...common, ...seedArgs(seed!), page_size: Math.min(1000, limit - results.length), ...(pageToken ? { page_token: pageToken } : {}) }
        );
        results.push(...(res.results ?? []));
        total = Number(res.total_size ?? res.totalSize) || total;
        pageToken = res.next_page_token ?? res.nextPageToken ?? undefined;
        if (!pageToken) break;
      }
      return { results: results.slice(0, limit), total };
    } catch (err) {
      return googleError(err);
    }
  });

  const terms = await accountTerms(row);
  const rows = sortRows(raws.results.map((r) => toRow(r, terms)).filter((r): r is NonNullable<typeof r> => !!r));
  return {
    mode,
    ...(seed ? { seed } : {}),
    countries: target.countries.map(({ code, name }) => ({ code, name })),
    language: target.language ? { code: target.language.code, name: target.language.name } : null,
    currency: row.account_currency ?? "",
    rows,
    totalIdeas: raws.total,
    fetchedAt: new Date().toISOString(),
  };
}

/** What a set of keywords would bring with a daily budget (nothing is created in the account). */
export async function keywordForecast(admin: SupabaseClient, row: ConnectionRow, raw: Record<string, unknown>): Promise<Forecast> {
  const customerId = row.account_id;
  if (!customerId) throw new ConnectionHttpError(409, "not_connected");
  const input = parseForecast(raw);
  const target = await targeting(admin, row, { countries: raw.countries, language: raw.language });
  const start = new Date(Date.now() + 86_400_000);
  const end = new Date(start.getTime() + (input.days - 1) * 86_400_000);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const bidding = input.maxCpc
    ? { manual_cpc_bidding_strategy: { max_cpc_bid_micros: toMicros(input.maxCpc), daily_budget_micros: toMicros(input.dailyBudget) } }
    : { maximize_clicks_bidding_strategy: { daily_target_spend_micros: toMicros(input.dailyBudget) } };
  let res: { campaign_forecast_metrics?: Record<string, unknown>; campaignForecastMetrics?: Record<string, unknown> };
  try {
    res = await execute(row, "GOOGLEADS_GENERATE_KEYWORD_FORECAST_METRICS", {
      customer_id: customerId,
      forecast_period: { start_date: day(start), end_date: day(end) },
      campaign: {
        bidding_strategy: bidding,
        ad_groups: [{ keywords: input.keywords.map((k) => ({ text: k.text, match_type: k.matchType })) }],
        geo_target_constants: target.countries.map((c) => c.resource),
        ...(target.language ? { language_constants: [target.language.resource] } : {}),
      },
    });
  } catch (err) {
    return googleError(err);
  }
  const m = (res.campaign_forecast_metrics ?? res.campaignForecastMetrics ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (v === undefined || v === null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  const money = (v: unknown) => (n(v) === null ? null : Math.round(n(v)! / 10_000) / 100);
  return {
    keywords: input.keywords.length,
    dailyBudget: input.dailyBudget,
    maxCpc: input.maxCpc ?? null,
    days: input.days,
    clicks: n(m.clicks) === null ? null : Math.round(n(m.clicks)!),
    cost: money(m.cost_micros ?? m.costMicros),
    averageCpc: money(m.average_cpc_micros ?? m.averageCpcMicros),
    conversions: n(m.conversions),
    averageCpa: money(m.average_cpa_micros ?? m.averageCpaMicros),
    currency: row.account_currency ?? "",
    countries: target.countries.map(({ code, name }) => ({ code, name })),
  };
}

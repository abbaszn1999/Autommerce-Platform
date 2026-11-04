import type { SupabaseClient } from "@supabase/supabase-js";
import { loadConnection, searchGaql, type ConnectionRow } from "./google-ads/connection.server";
import { loadMerchantSnapshot } from "./google-ads/merchant.server";

/**
 * What the first-run setup screen offers before the owner types anything:
 * values read from the connected Google Ads and Merchant Center accounts, and
 * the account's own numbers as a reference for the target and the budget.
 * Every part is optional: a failed read just leaves that part out.
 */
export type SetupPrefill = {
  suggestions: { businessName?: string; website?: string; markets?: string[]; brandTerms?: string[]; averageOrderValue?: number };
  /** Where each suggestion came from. */
  sources: Partial<Record<"businessName" | "website" | "markets" | "brandTerms" | "averageOrderValue", "google_ads" | "merchant">>;
  reference: {
    currency: string;
    /** Last 30 days. */
    spend: number | null;
    conversions: number | null;
    roas: number | null;
    averageOrderValue: number | null;
    /** The enabled campaigns' daily budgets × 30.4. */
    monthlyBudgets: number | null;
  };
};

type Row = Record<string, Record<string, unknown> | undefined>;

const hostOf = (u: string) => {
  try {
    const url = new URL(u);
    return /^https?:$/.test(url.protocol) ? url.hostname.replace(/^www\./, "") : null;
  } catch {
    return null;
  }
};

/** The most common value, or undefined. */
function mostCommon(values: string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
}

const settle = <T,>(p: Promise<T>) => p.then((v) => v, () => null);

async function adsPrefill(row: ConnectionRow) {
  const id = row.account_id!;
  const [ads, assetGroups, locations, totals, budgets] = await Promise.all([
    settle(searchGaql<Row>(row, id, "SELECT ad_group_ad.ad.final_urls FROM ad_group_ad WHERE ad_group_ad.status = 'ENABLED' AND campaign.status = 'ENABLED' LIMIT 200", 1)),
    settle(searchGaql<Row>(row, id, "SELECT asset_group.final_urls FROM asset_group WHERE asset_group.status = 'ENABLED' LIMIT 50", 1)),
    settle(
      searchGaql<Row>(
        row,
        id,
        "SELECT campaign_criterion.location.geo_target_constant FROM campaign_criterion WHERE campaign_criterion.type = 'LOCATION' AND campaign_criterion.negative = FALSE AND campaign.status = 'ENABLED'",
        2
      )
    ),
    settle(searchGaql<Row>(row, id, "SELECT metrics.cost_micros, metrics.conversions, metrics.conversions_value FROM customer WHERE segments.date DURING LAST_30_DAYS", 1)),
    settle(searchGaql<Row>(row, id, "SELECT campaign_budget.id, campaign_budget.amount_micros FROM campaign WHERE campaign.status = 'ENABLED'", 2)),
  ]);

  const urls = [...(ads ?? []).flatMap((r) => (r.adGroupAd?.ad as { finalUrls?: string[] } | undefined)?.finalUrls ?? []), ...(assetGroups ?? []).flatMap((r) => (r.assetGroup?.finalUrls as string[] | undefined) ?? [])];
  const host = mostCommon(urls.map(hostOf).filter((h): h is string => !!h));

  // Countries the enabled campaigns target (cities and regions count for their country).
  const geoIds = [
    ...new Set(
      (locations ?? []).map((r) => {
        const constant = (r.campaignCriterion?.location as { geoTargetConstant?: string } | undefined)?.geoTargetConstant ?? "";
        return constant.split("/").pop() ?? "";
      })
    ),
  ].filter((g) => /^\d+$/.test(g));
  let markets: string[] = [];
  if (geoIds.length) {
    const geo = await settle(
      searchGaql<Row>(row, id, `SELECT geo_target_constant.country_code FROM geo_target_constant WHERE geo_target_constant.id IN (${geoIds.slice(0, 200).join(", ")})`, 1)
    );
    const codes = [...new Set((geo ?? []).map((r) => String(r.geoTargetConstant?.countryCode ?? "")).filter((c) => /^[A-Z]{2}$/.test(c)))];
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    markets = codes.map((c) => names.of(c) ?? c).slice(0, 30);
  }

  const t = totals?.[0]?.metrics as { costMicros?: string | number; conversions?: number; conversionsValue?: number } | undefined;
  const spend = t ? Number(t.costMicros ?? 0) / 1e6 : null;
  const conversions = t ? Number(t.conversions ?? 0) : null;
  const value = t ? Number(t.conversionsValue ?? 0) : null;
  const seen = new Set<string>();
  let daily = 0;
  for (const r of budgets ?? []) {
    const b = r.campaignBudget as { id?: string | number; amountMicros?: string | number } | undefined;
    if (!b || seen.has(String(b.id))) continue;
    seen.add(String(b.id));
    daily += Number(b.amountMicros ?? 0) / 1e6;
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    host,
    markets,
    reference: {
      spend: spend === null ? null : round(spend),
      conversions: conversions === null ? null : round(conversions),
      roas: spend && value ? round(value / spend) : null,
      averageOrderValue: conversions && value ? round(value / conversions) : null,
      monthlyBudgets: budgets ? Math.round(daily * 30.4) : null,
    },
  };
}

async function merchantPrefill(row: ConnectionRow) {
  const snapshot = await loadMerchantSnapshot(row);
  return {
    host: mostCommon(snapshot.products.map((p) => (p.link ? hostOf(p.link) : null)).filter((h): h is string => !!h)),
    brand: mostCommon(snapshot.products.map((p) => p.brand.trim()).filter(Boolean)),
  };
}

export async function setupPrefill(admin: SupabaseClient, workspaceId: string): Promise<SetupPrefill> {
  const [adsRow, merchantRow] = await Promise.all([loadConnection(admin, workspaceId, "ads"), loadConnection(admin, workspaceId, "merchant")]);
  const ads = adsRow?.composio_connected_account_id && adsRow.account_id ? await settle(adsPrefill(adsRow)) : null;
  const merchant = merchantRow?.composio_connected_account_id && merchantRow.account_id ? await settle(merchantPrefill(merchantRow)) : null;

  const out: SetupPrefill = {
    suggestions: {},
    sources: {},
    reference: { currency: adsRow?.account_currency ?? "", spend: null, conversions: null, roas: null, averageOrderValue: null, monthlyBudgets: null, ...ads?.reference },
  };
  const name = adsRow?.account_name?.trim();
  // An account still named by its id ("204-636-2164") says nothing about the business.
  if (name && !/^\d[\d-]*$/.test(name)) {
    out.suggestions.businessName = name;
    out.sources.businessName = "google_ads";
  }
  if (ads?.host) {
    out.suggestions.website = `https://${ads.host}`;
    out.sources.website = "google_ads";
  } else if (merchant?.host) {
    out.suggestions.website = `https://${merchant.host}`;
    out.sources.website = "merchant";
  }
  if (ads?.markets.length) {
    out.suggestions.markets = ads.markets;
    out.sources.markets = "google_ads";
  }
  const brands = [...new Set([merchant?.brand, name].filter((b): b is string => !!b && !/^\d[\d-]*$/.test(b)))];
  if (brands.length) {
    out.suggestions.brandTerms = brands;
    out.sources.brandTerms = merchant?.brand ? "merchant" : "google_ads";
  }
  if (ads?.reference.averageOrderValue) {
    out.suggestions.averageOrderValue = ads.reference.averageOrderValue;
    out.sources.averageOrderValue = "google_ads";
  }
  return out;
}

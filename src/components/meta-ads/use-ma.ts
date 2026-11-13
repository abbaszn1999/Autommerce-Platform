"use client";

import { useAccountState, useMetaAds } from "@/lib/meta-ads/store";
import type { MetaAccountData, MetaCampaign, AdSet } from "@/lib/meta-ads/types";

/** Everything a view needs; views only render once an ad account is selected. */
export function useMa() {
  const acc = useAccountState()!;
  const range = useMetaAds((s) => s.range);
  const scope = useMetaAds((s) => s.scope);
  const data = acc.data;
  return {
    acc,
    data,
    range,
    scope,
    currency: data.account.currency,
    campaign: data.campaigns.find((c) => c.id === scope.campaignId),
    adSet: data.adSets.find((s) => s.id === scope.adSetId),
  };
}

/** Campaign ids visible at the current scope. */
export function scopedCampaignIds(data: MetaAccountData, campaign?: MetaCampaign): string[] {
  return campaign ? [campaign.id] : data.campaigns.filter((c) => c.status !== "ARCHIVED").map((c) => c.id);
}

/** Ad sets visible at the current scope. */
export function scopedAdSets(data: MetaAccountData, scope: { campaignId?: string; adSetId?: string }): AdSet[] {
  if (scope.adSetId) return data.adSets.filter((s) => s.id === scope.adSetId);
  return data.adSets.filter((s) => s.status !== "ARCHIVED" && (!scope.campaignId || s.campaignId === scope.campaignId) && data.campaigns.find((c) => c.id === s.campaignId)?.status !== "ARCHIVED");
}

/** Ad set ids visible at the current scope. */
export function scopedAdSetIds(data: MetaAccountData, scope: { campaignId?: string; adSetId?: string }): string[] {
  return scopedAdSets(data, scope).map((s) => s.id);
}

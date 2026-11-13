// The approval card's lines for creating things: everything that will be made,
// in full (every headline, keyword and image), so nothing is approved unseen.

import type { BeforeState } from "./live-mutate";
import type { CreateOp, NewAd, NewAdGroup, NewAssetGroup } from "./live-create";

type Item = { id: string; label: string; changes: Array<{ field: string; before?: string; after?: string }> };

const list = (v: unknown) => (Array.isArray(v) ? v.map(String).join(" · ") : "");
const named = (prefix: string, ids: unknown, before: BeforeState) =>
  Array.isArray(ids) ? ids.map((id) => before.create?.names[`${prefix}:${id}`] || `${prefix} ${id}`).join(", ") : "";
const pct = (change: number | undefined) => (change === undefined ? "" : `${change > 0 ? "+" : ""}${Math.round(change * 100)}%`);

export function describeCreate(op: CreateOp, before: BeforeState, currency: string, n: number): Item[] {
  const money = (v: number | undefined) => (v == null ? "—" : `${v.toFixed(2)} ${currency}`);
  const campaign = (id: string) => before.campaigns[id]?.name ?? `Campaign ${id}`;
  const adGroup = (id: string) => before.adGroups[id]?.name ?? `Ad group ${id}`;
  const items: Item[] = [];
  const item = (label: string, fields: [string, unknown][]) =>
    items.push({ id: `new-${n}-${items.length}`, label, changes: fields.filter(([, v]) => v !== undefined && v !== "").map(([field, v]) => ({ field, after: String(v) })) });

  const ad = (a: NewAd, where: string) => {
    if (!a) return;
    const images = "images" in a ? Object.entries(a.images ?? {}).flatMap(([k, urls]) => (urls ?? []).map((u) => `${k}: ${u}`)) : [];
    item(`New ${a.type === "RSA" ? "responsive search ad" : a.type === "DISPLAY" ? "responsive display ad" : "Demand Gen ad"} · ${where}`, [
      ["Final URL", a.finalUrl],
      ["Headlines", list(a.headlines)],
      ["Long headline", "longHeadline" in a ? a.longHeadline : undefined],
      ["Descriptions", list(a.descriptions)],
      ["Paths", a.type === "RSA" ? [a.path1, a.path2].filter(Boolean).join(" / ") : undefined],
      ["Business name", "businessName" in a ? a.businessName : undefined],
      ["Images", images.join(" · ") || undefined],
    ]);
  };
  const group = (g: NewAdGroup, where: string) => {
    if (!g) return;
    item(`New ad group · ${g.name} (${where})`, [
      ["Default max CPC", g.defaultCpcBid !== undefined ? money(g.defaultCpcBid) : undefined],
      ["Keywords", (g.keywords ?? []).map((k) => `${k.text} (${String(k.matchType).toLowerCase()}${k.cpcBid ? `, ${money(k.cpcBid)}` : ""})`).join(" · ") || undefined],
      ["Negative keywords", (g.negatives ?? []).map((k) => `${k.text} (${String(k.matchType).toLowerCase()})`).join(" · ") || undefined],
    ]);
    for (const a of g.ads ?? []) ad(a, g.name);
  };
  const assetGroup = (g: Partial<NewAssetGroup>, label: string) =>
    item(label, [
      ["Final URL", g.finalUrl],
      ["Headlines", list(g.headlines)],
      ["Long headlines", list(g.longHeadlines)],
      ["Descriptions", list(g.descriptions)],
      ["Business name", g.businessName],
      ["Images", Object.entries(g.images ?? {}).flatMap(([k, urls]) => (urls ?? []).map((u) => `${k}: ${u}`)).join(" · ") || undefined],
      ["YouTube videos", list(g.videos)],
      ["Search themes", list(g.searchThemes)],
    ]);

  switch (op.kind) {
    case "campaign.new": {
      const b = op.bidding ?? ({} as CreateOp & { strategy: string });
      item(`New ${String(op.type).replace("_", " ").toLowerCase()} campaign · ${op.name}`, [
        ["Status", "PAUSED (spends nothing until you turn it on)"],
        ["Daily budget", money(op.dailyBudget)],
        ["Bidding", [String(b.strategy ?? "").replace(/_/g, " ").toLowerCase(), b.targetCpa ? `target CPA ${money(b.targetCpa)}` : "", b.targetRoas ? `target ROAS ${Math.round(b.targetRoas * 100)}%` : "", b.maxCpc ? `max CPC ${money(b.maxCpc)}` : ""].filter(Boolean).join(", ")],
        ["Locations", named("location", op.locations, before)],
        ["Excluded locations", named("location", op.excludedLocations, before)],
        ["Languages", named("language", op.languages, before)],
        ["Search partners", op.type === "SEARCH" ? (op.searchPartners ? "on" : "off") : undefined],
        ["Merchant Center", op.merchantId],
        ["Dates", op.startDate || op.endDate ? `${op.startDate ?? "now"} → ${op.endDate ?? "no end"}` : undefined],
        ["Negative keywords", (op.negatives ?? []).map((k) => `${k.text} (${String(k.matchType).toLowerCase()})`).join(" · ") || undefined],
      ]);
      for (const g of op.adGroups ?? []) group(g, op.name);
      for (const g of op.assetGroups ?? []) assetGroup(g, `New asset group · ${g.name} (${op.name})`);
      break;
    }
    case "adGroup.new":
      group(op.adGroup, `${campaign(op.campaignId)}, ${op.status === "ENABLED" ? "on" : "paused"}`);
      break;
    case "ad.new":
      ad(op.ad, adGroup(op.adGroupId));
      break;
    case "assetGroup.new":
      assetGroup(op.assetGroup, `New asset group · ${op.assetGroup?.name} (${campaign(op.campaignId)})`);
      break;
    case "assetGroupAsset.add":
      assetGroup(op, `Add assets · asset group ${before.create?.assetGroups[op.assetGroupId]?.name ?? op.assetGroupId}`);
      if (op.existing?.length) item("Put back assets", [["Assets", op.existing.map((e) => `${e.fieldType} ${e.assetId}`).join(" · ")]]);
      break;
    case "assetGroupAsset.remove":
      for (const id of op.ids) {
        const [g, assetId, field] = id.split("~");
        items.push({ id: `rm-${id}`, label: `Remove asset · asset group ${before.create?.assetGroups[g ?? ""]?.name ?? g}`, changes: [{ field: String(field), before: before.create?.assetGroupAssets[id]?.text ?? `asset ${assetId}`, after: "—" }] });
      }
      break;
    case "searchTheme.add":
      item(`Add search themes · asset group ${before.create?.assetGroups[op.assetGroupId]?.name ?? op.assetGroupId}`, [["Themes", list(op.themes)]]);
      break;
    case "asset.new":
      for (const a of op.assets ?? [])
        item(`New ${String(a?.type).replace("_", " ").toLowerCase()} · ${op.level === "ACCOUNT" ? "whole account" : op.level === "CAMPAIGN" ? campaign(String(op.parentId)) : adGroup(String(op.parentId))}`, [
          ["Text", "text" in a ? a.text : "header" in a ? a.header : undefined],
          ["Lines", "description1" in a ? [a.description1, a.description2].filter(Boolean).join(" / ") : "values" in a ? list(a.values) : undefined],
          ["Phone", "phoneNumber" in a ? `${a.countryCode} ${a.phoneNumber}` : undefined],
          ["Final URL", "finalUrl" in a ? a.finalUrl : undefined],
        ]);
      break;
    case "audience.add":
      item(`Add audiences · ${op.level === "CAMPAIGN" ? campaign(op.parentId) : adGroup(op.parentId)}`, [
        ["Audience lists", named("list", op.userListIds, before)],
        ["Mode", (op.mode ?? "OBSERVATION") === "OBSERVATION" ? "Observation (adjusts bids, doesn't limit who sees ads)" : "Targeting (only these people see the ads)"],
        ["Bid adjustment", pct(op.bidModifier) || undefined],
      ]);
      break;
    case "audienceSetting.set":
      item(`Audience setting · ${op.level === "CAMPAIGN" ? campaign(op.parentId) : adGroup(op.parentId)}`, [["Restore", "the setting from before the change"]]);
      break;
    case "location.add":
      item(`${op.exclude ? "Exclude" : "Target"} locations · ${campaign(op.campaignId)}`, [["Locations", named("location", op.geoIds, before)], ["Bid adjustment", pct(op.bidModifier) || undefined]]);
      break;
    case "language.add":
      item(`Add languages · ${campaign(op.campaignId)}`, [["Languages", named("language", op.languageIds, before)]]);
      break;
    case "schedule.add":
      item(`Ad schedule · ${campaign(op.campaignId)}`, [["Runs", (op.slots ?? []).map((s) => `${String(s.day).slice(0, 3)} ${s.startHour}:00–${s.endHour}:00${s.bidModifier !== undefined ? ` (${pct(s.bidModifier)})` : ""}`).join(" · ")]]);
      break;
    case "targeting.remove":
      for (const id of op.criterionIds ?? []) {
        const t = before.create?.targeting[`${op.campaignId}~${id}`];
        const what = t?.geoId ? `${named("location", [t.geoId], before)}${t.negative ? " (excluded)" : ""}` : t?.languageId ? named("language", [t.languageId], before) : t?.slot ? `${t.slot.day} ${t.slot.startHour}:00–${t.slot.endHour}:00` : id;
        items.push({ id: `rm-${id}`, label: `Remove targeting · ${campaign(op.campaignId)}`, changes: [{ field: String(t?.type ?? "Targeting").toLowerCase().replace("_", " "), before: what, after: "—" }] });
      }
      break;
    case "device.set": {
      const t = Object.entries(before.create?.targeting ?? {}).find(([k, v]) => k.startsWith(`${op.campaignId}~`) && v.device === op.device)?.[1];
      items.push({
        id: `device-${n}`,
        label: `Device bid · ${campaign(op.campaignId)}`,
        changes: [{ field: String(op.device).toLowerCase(), before: t?.bidModifier !== undefined ? pct(t.bidModifier - 1) || "0%" : "0%", after: op.bidModifier === -1 ? "never show (-100%)" : pct(op.bidModifier) || "0%" }],
      });
      break;
    }
    case "placement.exclude":
      item(`Exclude placements · ${campaign(op.campaignId)}`, [["Sites and apps", list(op.urls)]]);
      break;
    case "conversion.new":
      item(`New conversion action · ${op.name}`, [
        ["Category", op.category],
        ["Count", op.countingType === "ONE_PER_CLICK" ? "one per click" : "every conversion"],
        ["Value", op.defaultValue !== undefined ? `${money(op.defaultValue)}${op.alwaysUseDefaultValue ? " always" : " unless the tag sends one"}` : undefined],
      ]);
      break;
    case "negativeList.new":
      item(`New negative keyword list · ${op.name}`, [
        ["Keywords", (op.keywords ?? []).map((k) => `${k.text} (${String(k.matchType).toLowerCase()})`).join(" · ")],
        ["Used by", (op.campaignIds ?? []).map(campaign).join(", ") || undefined],
      ]);
      break;
    case "label.new":
      item(`New label · ${op.name}`, [["Colour", op.color], ["On campaigns", (op.campaignIds ?? []).map(campaign).join(", ") || undefined]]);
      break;
    case "created.remove":
      item("Remove what this change created", [["Items", String(op.resources?.length ?? 0)]]);
      break;
  }
  return items;
}

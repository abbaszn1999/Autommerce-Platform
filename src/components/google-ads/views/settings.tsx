"use client";

import { BIDDING, CAMPAIGN_TYPES, OBJECTIVES } from "@/lib/google-ads/constants";
import { money } from "@/lib/google-ads/metrics";
import { Card, Pill, ViewHeader } from "../ga-ui";
import { useGa } from "../use-ga";

const NETWORK_LABEL = { googleSearch: "Google Search", searchPartners: "Search partners", displayNetwork: "Display Network" } as const;

/** Campaign level: read-only, the agent changes these. */
export function SettingsView() {
  const { campaign, data, currency } = useGa();
  if (!campaign) return null;
  const budget = data.budgets.find((b) => b.id === campaign.budgetId);
  const portfolio = campaign.bidding.portfolioId ? data.bidStrategies.find((s) => s.id === campaign.bidding.portfolioId) : undefined;
  const conversions = data.conversions.filter((c) => campaign.conversionActionIds.includes(c.id));
  const labels = campaign.labels.map((id) => data.labelDefs.find((l) => l.id === id)?.name ?? id);
  const target = BIDDING[campaign.bidding.type].target;
  const isPmax = campaign.type === "PERFORMANCE_MAX";
  const networks = (Object.keys(NETWORK_LABEL) as (keyof typeof NETWORK_LABEL)[]).filter((k) => campaign.networks[k]).map((k) => NETWORK_LABEL[k]);
  const place = campaign.locations.map((l) => `${l.excluded ? "Excluding " : ""}${l.name}`);
  const deviceNote = (["mobile", "desktop", "tablet"] as const).map((d) => {
    const v = campaign.devices[d];
    return `${d.charAt(0).toUpperCase() + d.slice(1)} ${v <= -1 ? "off" : v === 0 ? "no adjustment" : `${v > 0 ? "+" : ""}${Math.round(v * 100)}%`}`;
  });
  const slots = campaign.schedule.length;

  return (
    <div>
      <ViewHeader title="Campaign settings" subtitle={`${CAMPAIGN_TYPES[campaign.type].label}, created ${new Date(campaign.createdAt).toLocaleDateString()}. To change a setting, ask the agent.`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3 p-4">
          <p className="text-sm font-bold">General</p>
          <InfoRow label="Campaign name" value={campaign.name} />
          <InfoRow label="Status" value={{ ENABLED: "Enabled", PAUSED: "Paused", REMOVED: "Removed" }[campaign.status]} />
          <InfoRow label="Goal" value={OBJECTIVES[campaign.objective].label} />
          <InfoRow label="Start date" value={campaign.startDate} />
          <InfoRow label="End date" value={campaign.endDate ?? "No end date"} />
          <InfoRow label="Labels" value={labels.length ? labels.join(", ") : "None"} />
          <InfoRow label="EU political ads" hint="Required declaration for EU political advertising." value={campaign.euPoliticalAds ? "Yes" : "No"} />
        </Card>

        <Card className="space-y-3 p-4">
          <p className="text-sm font-bold">Budget and bidding</p>
          <InfoRow label="Daily budget" hint={budget?.shared ? "Shared with other campaigns." : "Google may spend up to twice this on a busy day."} value={budget ? `${money(budget.amount, currency)} per day` : "None"} />
          <InfoRow label="Bid strategy" value={BIDDING[campaign.bidding.type].label} />
          {portfolio && <InfoRow label="Portfolio strategy" hint="Shared with other campaigns." value={portfolio.name} />}
          {target === "CPA" && <InfoRow label="Target cost per action" value={campaign.bidding.targetCpa ? money(campaign.bidding.targetCpa, currency) : "Not set"} />}
          {target === "ROAS" && <InfoRow label="Target ROAS" value={campaign.bidding.targetRoas ? `${Math.round(campaign.bidding.targetRoas * 100)}%` : "Not set"} />}
          {target === "CPC" && <InfoRow label="Max. CPC limit" value={campaign.bidding.maxCpcLimit ? money(campaign.bidding.maxCpcLimit, currency) : "No limit"} />}
          {campaign.type !== "DEMAND_GEN" && campaign.type !== "DISPLAY" && campaign.type !== "VIDEO" && (
            <InfoRow
              label="New customer acquisition"
              hint="Bid more when the shopper is new to your business."
              value={campaign.newCustomerAcquisition ? (campaign.newCustomerAcquisition.mode === "ONLY_NEW" ? "Only new customers" : `Bid higher for new customers${campaign.newCustomerAcquisition.value ? ` (value ${money(campaign.newCustomerAcquisition.value, currency)})` : ""}`) : "Off"}
            />
          )}
        </Card>

        <Card className="space-y-3 p-4">
          <p className="text-sm font-bold">Conversion goals</p>
          <p className="text-[11px] text-muted-foreground">Bidding optimises for primary actions. Secondary actions are only reported.</p>
          {conversions.length ? (
            conversions.map((c) => (
              <div key={c.id} className="flex items-center gap-3">
                <span className="flex-1 text-xs font-semibold">{c.name}</span>
                <Pill tone={c.primary ? "brand" : "neutral"}>{c.primary ? "Primary" : "Secondary"}</Pill>
              </div>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">Uses the account default goals.</p>
          )}
        </Card>

        <Card className="space-y-3 p-4">
          <p className="text-sm font-bold">Targeting</p>
          <InfoRow label="Locations" value={place.length ? place.join(", ") : data.unavailable?.includes("locations") ? "Couldn't read from Google" : "All countries"} />
          <InfoRow label="Languages" value={campaign.languages.length ? campaign.languages.join(", ") : data.unavailable?.includes("languages") ? "Couldn't read from Google" : "All languages"} />
          <InfoRow label="Ad schedule" value={slots ? `${slots} time slot${slots > 1 ? "s" : ""}` : "All day, every day"} />
          {!isPmax && campaign.type !== "DEMAND_GEN" && <InfoRow label="Devices" hint="Bid adjustments by device." value={deviceNote.join(", ")} />}
          {campaign.type === "SEARCH" && <InfoRow label="Networks" value={networks.length ? networks.join(", ") : "None"} />}
        </Card>

        <Card className="space-y-3 p-4">
          <p className="text-sm font-bold">Tracking and URLs</p>
          <InfoRow label="Tracking template" value={campaign.trackingTemplate ?? "None"} />
          <InfoRow label="Final URL suffix" value={campaign.finalUrlSuffix ?? "None"} />
          {campaign.type === "SEARCH" && <InfoRow label="Ad rotation" hint="How ads in one ad group take turns." value={campaign.adRotation === "ROTATE_EVENLY" ? "Rotate evenly" : "Optimise for performance"} />}
          {campaign.type === "SEARCH" && <InfoRow label="AI Max for Search" hint="Search term matching and final URL expansion beyond your keywords." value={campaign.aiMax ? "On" : "Off"} />}
          {isPmax && <InfoRow label="Final URL expansion" hint="Let Google send people to other pages on your site." value={campaign.finalUrlExpansion ? "On" : "Off"} />}
          {isPmax && <InfoRow label="URL exclusions" hint="Pages Google must never send traffic to." value={campaign.urlExclusions?.length ? campaign.urlExclusions.join(", ") : "None"} />}
        </Card>

        {isPmax && (
          <Card className="space-y-3 p-4">
            <p className="text-sm font-bold">Brand guidelines</p>
            {campaign.brandGuidelines ? (
              <>
                <InfoRow label="Main colour" value={campaign.brandGuidelines.mainColor} />
                <InfoRow label="Accent colour" value={campaign.brandGuidelines.accentColor} />
                <InfoRow label="Font" value={campaign.brandGuidelines.font} />
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Not set. Google picks colours and fonts from your assets.</p>
            )}
          </Card>
        )}
        {campaign.shopping && (
          <Card className="space-y-3 p-4">
            <p className="text-sm font-bold">Shopping settings</p>
            <p className="text-[11px] text-muted-foreground">Set when the campaign was created. To change them, ask the agent.</p>
            <InfoRow label="Campaign priority" hint="Which campaign wins when several advertise the same product." value={PRIORITY[campaign.shopping.priority]} />
            <InfoRow label="Inventory filter" hint="Limits the campaign to part of the feed." value={campaign.shopping.inventoryFilter ?? "Whole feed"} />
            <InfoRow label="Feed label" value={campaign.shopping.feedLabel} />
            <InfoRow label="Country of sale" hint="Products sold and shipped here." value={campaign.shopping.countryOfSale} />
            <InfoRow label="Local inventory ads" value={campaign.shopping.localInventory ? "On" : "Off"} />
          </Card>
        )}

        {campaign.display && (
          <Card className="space-y-3 p-4">
            <p className="text-sm font-bold">Display settings</p>
            <p className="text-[11px] text-muted-foreground">Set when the campaign was created. To change them, ask the agent.</p>
            <InfoRow label="Optimized targeting" hint="Google finds more people like your audiences and converters." value={campaign.display.optimizedTargeting ? "On" : "Off"} />
            <InfoRow label="Frequency cap" hint="Most times one person sees your ads." value={campaign.display.frequencyCap ? `${campaign.display.frequencyCap.impressions} impressions per ${campaign.display.frequencyCap.per.toLowerCase()}` : "No cap"} />
            <InfoRow label="Automatically created assets" hint="Google generates extra headlines and images." value={campaign.display.autoCreatedAssets ? "On" : "Off"} />
            <InfoRow label="Content exclusions" hint="Content this campaign never shows next to." value={campaign.display.contentExclusions.length ? campaign.display.contentExclusions.join(", ") : "None"} />
          </Card>
        )}

        {campaign.type === "DEMAND_GEN" && (
          <Card className="space-y-3 p-4">
            <p className="text-sm font-bold">Demand Gen settings</p>
            <p className="text-[11px] text-muted-foreground">To change them, ask the agent.</p>
            <InfoRow label="Channels" hint="Set per ad group: where its ads may serve." value={demandGenChannels(data.adGroups.filter((g) => g.campaignId === campaign.id))} />
            <InfoRow label="Lookalike segments" hint="Find new people similar to your customers." value={campaign.demandGen?.lookalikes ? "On" : "Off"} />
            <InfoRow label="Product feed" hint="Promote products from Merchant Center." value={campaign.merchantFeed ? "Linked" : "Not used"} />
            <InfoRow label="Content suitability" hint="Brand safety is set once for the whole account, not per campaign." value="Account level" />
          </Card>
        )}
      </div>

    </div>
  );
}

/** Ad group level: read-only, the agent changes these. */
export function AdGroupSettingsView() {
  const { adGroup, campaign, currency, data } = useGa();
  if (!adGroup || !campaign) return null;
  const status = { ENABLED: "Enabled", PAUSED: "Paused", REMOVED: "Removed" }[adGroup.status];
  const ads = data.ads.filter((a) => a.adGroupId === adGroup.id).length;
  return (
    <div>
      <ViewHeader title="Ad group settings" subtitle={`${adGroup.name} · ${CAMPAIGN_TYPES[campaign.type].label} ad group in ${campaign.name}. To change them, ask the agent.`} />
      <Card className="max-w-2xl space-y-3 p-4">
        <InfoRow label="Name" value={adGroup.name} />
        <InfoRow label="Status" value={status} />
        <InfoRow label="Ads" value={String(ads)} />
        {campaign.type !== "DEMAND_GEN" && (
          <InfoRow label="Default bid" hint="Used when a keyword or product group has no bid of its own." value={adGroup.defaultCpcBid ? money(adGroup.defaultCpcBid, currency) : "Uses the campaign's bidding"} />
        )}
        {adGroup.targetCpa !== undefined && <InfoRow label="Target CPA" value={money(adGroup.targetCpa, currency)} />}
        {campaign.type === "DEMAND_GEN" && (
          <>
            <InfoRow label="Channels" hint="Where this ad group's ads may serve." value={demandGenChannels([adGroup])} />
            <InfoRow label="Audience segments" hint="Grouped: any of the segments can match. Otherwise each is used on its own." value={adGroup.audienceGrouped ? "Grouped" : "Separate"} />
          </>
        )}
      </Card>
    </div>
  );
}

const CHANNEL_LABEL = { YOUTUBE: "YouTube", DISCOVER: "Discover", GMAIL: "Gmail", DISPLAY: "Display Network", MAPS: "Maps" } as const;

/** The channels the campaign's ad groups allow, or "All channels" when none are restricted. */
function demandGenChannels(groups: { channels?: (keyof typeof CHANNEL_LABEL)[] }[]) {
  const set = new Set(groups.flatMap((g) => g.channels ?? []));
  return set.size ? [...set].map((c) => CHANNEL_LABEL[c]).join(", ") : "All channels";
}

const PRIORITY = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" } as const;

export function InfoRow({ label, hint, value }: { label: string; hint?: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-1">
        <p className="text-xs font-semibold">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </div>
      <span className="max-w-56 text-right text-xs font-semibold">{value}</span>
    </div>
  );
}
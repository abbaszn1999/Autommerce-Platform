import React, { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { activeChatOf, useGoogleAds } from "@/lib/google-ads/store";
import { planAgentTurn } from "@/lib/google-ads/agent-sim";
import { OBJECTIVES } from "@/lib/google-ads/constants";
import { DEFAULT_PROFILE, emptyProfile, profileCompleteness } from "@/lib/google-ads/docs";
import type { CampaignType, GaView } from "@/lib/google-ads/types";
import { GoogleAdsShell } from "./ga-shell";
import { GaDialogs } from "./ga-dialogs";
import { FolderView } from "./views/documents";
import { GaCampaignEditor } from "./ga-campaign-editor";
import { emptyBundle } from "@/lib/google-ads/mutations";

// Server rendering reads zustand's initial state; make it read the live state instead.
const originalUseSyncExternalStore = React.useSyncExternalStore;
(React as { useSyncExternalStore: typeof React.useSyncExternalStore }).useSyncExternalStore = (subscribe, getSnapshot) =>
  originalUseSyncExternalStore(subscribe, getSnapshot, getSnapshot);

const VIEWS: GaView[] = ["overview", "campaigns", "adGroups", "ads", "assets", "keywords", "negatives", "searchTerms", "audiences", "locations", "schedule", "devices", "recommendations", "conversions", "library", "settings", "pending", "history", "products", "productGroups", "reports", "rules", "competitorAds", "experiments", "planner", "content", "demographics", "links", "accountSettings", "documents", "profile", "connections", "languages", "brandExclusions", "channels", "searchCategories", "assetCombinations", "placementsShown", "landingPages", "impressionShare", "priceCompetitiveness", "contentExclusions", "adGroupSettings", "assetGroupAssets", "audienceSignals", "searchThemes", "assetGroupSettings", "trends"];

/** The HTML of one landmark (the sidebar or the page), so assertions ignore the chat panel and top bar. */
const part = (html: string, tag: string) => html.slice(html.indexOf("<" + tag), html.indexOf("</" + tag + ">"));

function connect(customer = "7316204458") {
  const s = useGoogleAds.getState();
  s.disconnect();
  s.disconnectMerchant();
  s.completeAuth();
  useGoogleAds.getState().selectAccount(customer);
}

describe("render smoke", () => {
  it("renders connect screens", () => {
    useGoogleAds.getState().disconnect();
    expect(renderToString(createElement(GoogleAdsShell))).toContain("Connect Google Ads");
    useGoogleAds.getState().startConnect();
    expect(renderToString(createElement(GoogleAdsShell))).toContain("Choose an account");
    useGoogleAds.getState().completeAuth();
    expect(renderToString(createElement(GoogleAdsShell))).toContain("Choose an ad account");
  });

  it("shows two connections and 'Go to agent' only once Google Ads is connected", () => {
    const s = useGoogleAds.getState();
    s.disconnect();
    s.disconnectMerchant();
    let html = renderToString(createElement(GoogleAdsShell));
    expect(html).toContain("Connect Google Ads");
    expect(html).toContain("Connect Merchant Center");
    expect(html).not.toContain("Go to agent");

    // Merchant Center alone does not open the agent.
    s.completeMerchantAuth();
    s.selectMerchantAccount("512889034");
    html = renderToString(createElement(GoogleAdsShell));
    expect(html).toContain("Merchant Center connected");
    expect(html).toContain("Connect Google Ads");
    expect(html).not.toContain("Go to agent");

    s.completeAuth();
    useGoogleAds.getState().chooseAccount("7316204458");
    html = renderToString(createElement(GoogleAdsShell));
    expect(html).toContain("Google Ads connected");
    expect(html).toContain("Go to agent");
    expect(html).not.toContain("Ads agent");

    useGoogleAds.getState().enterWorkspace();
    expect(renderToString(createElement(GoogleAdsShell))).toContain("Ads agent");
  });

  it("shows the agent as a fixed panel with chat tabs and the Store Agent message box", () => {
    connect();
    const html = renderToString(createElement(GoogleAdsShell));
    expect(html).toContain("New chat");
    expect(html).toContain("History");
    expect(html).toContain("Plan");
    expect(html).toContain("Ask anything about");
    // There is no way to hide the agent.
    expect(html).not.toContain("Hide agent");
    expect(html).not.toContain("Open agent");
  });

  it("keeps several chats as tabs: new, switch, close, rename, pin, delete", () => {
    connect();
    const acc = () => {
      const s = useGoogleAds.getState();
      return s.accounts[s.customerId!]!;
    };
    const first = acc().activeChatId;
    expect(acc().openChatIds).toEqual([first]);

    // The first question names the chat.
    useGoogleAds.getState().addMessage({ id: "m1", role: "user", text: "Where am I wasting budget?", at: "" });
    expect(acc().chats.find((c) => c.id === first)!.title).toBe("Where am I wasting budget?");

    // + opens a fresh chat; pressing + again reuses the empty one.
    useGoogleAds.getState().newChat();
    const second = acc().activeChatId;
    expect(second).not.toBe(first);
    expect(acc().openChatIds).toEqual([first, second]);
    useGoogleAds.getState().newChat();
    expect(acc().openChatIds).toHaveLength(2);

    // Each chat keeps its own messages; patching finds a message in any chat.
    useGoogleAds.getState().addMessage({ id: "m2", role: "user", text: "Write a monthly report", at: "" });
    expect(acc().chats.find((c) => c.id === second)!.messages).toHaveLength(1);
    expect(acc().chats.find((c) => c.id === first)!.messages).toHaveLength(1);
    useGoogleAds.getState().patchMessage("m1", { text: "edited" });
    expect(acc().chats.find((c) => c.id === first)!.messages[0]!.text).toBe("edited");

    useGoogleAds.getState().selectChat(first);
    expect(acc().activeChatId).toBe(first);
    useGoogleAds.getState().renameChat(second, "Monthly report");
    useGoogleAds.getState().pinChat(second);
    expect(acc().chats.find((c) => c.id === second)).toMatchObject({ title: "Monthly report", pinned: true });
    expect(renderToString(createElement(GoogleAdsShell))).toContain("Monthly report");

    // Closing a tab keeps the chat in History; opening it from there brings it back.
    useGoogleAds.getState().closeChat(second);
    expect(acc().openChatIds).toEqual([first]);
    expect(acc().chats.some((c) => c.id === second)).toBe(true);
    useGoogleAds.getState().openChat(second);
    expect(acc().activeChatId).toBe(second);

    // Deleting removes it for good; the last chat is never left empty-handed.
    useGoogleAds.getState().deleteChat(second);
    expect(acc().chats.some((c) => c.id === second)).toBe(false);
    useGoogleAds.getState().deleteChat(first);
    expect(acc().chats).toHaveLength(1);
    expect(acc().openChatIds).toEqual([acc().activeChatId]);
  });

  it("plan mode describes the work and prepares nothing to approve", () => {
    connect();
    useGoogleAds.getState().setChatMode("plan");
    const s = useGoogleAds.getState();
    expect(activeChatOf(s.accounts[s.customerId!]!).mode).toBe("plan");
    const html = renderToString(createElement(GoogleAdsShell));
    expect(html).toContain("Nothing in the account will change");
  });

  it("shows the agreed account-level sidebar and nothing the agent should do", () => {
    connect();
    useGoogleAds.setState({ scope: {}, view: "overview" });
    const page = renderToString(createElement(GoogleAdsShell));
    // No Pending button in the top bar either: approvals happen in the chat.
    expect(page).not.toContain('title="Pending changes"');
    const html = part(page, "nav");
    for (const label of ["Recommendations", "Reports", "Campaigns", "Ad groups", "Ads", "Experiments", "Assets", "Keywords", "Audiences", "Placements &amp; content", "Locations &amp; languages", "Shared library", "Conversions", "Linked accounts", "Connections", "Account settings", "Documents", "Business profile", "Rules &amp; alerts", ">Products<"]) {
      expect(html, label).toContain(label);
    }
    // Moved into tabs, or left to the agent and the chat.
    for (const label of ["Negative keywords", "Demographics", "Keyword Planner", "Performance Planner", "Pending changes", "Change history"]) {
      expect(html, label).not.toContain(label);
    }
  });

  it("groups related pages into tabs: Keywords, Audiences, Locations & schedule", () => {
    connect();
    const tabsOf = (view: GaView, scope = {}) => {
      useGoogleAds.setState({ scope, view });
      return renderToString(createElement(GoogleAdsShell));
    };
    let html = tabsOf("searchTerms");
    expect(html).toContain('role="tablist"');
    for (const t of ["Search keywords", "Negative keywords", "Search terms"]) expect(html).toContain(t);
    html = tabsOf("demographics");
    for (const t of ["Audiences", "Demographics"]) expect(html).toContain(t);
    html = tabsOf("schedule");
    for (const t of ["Locations", "Ad schedule", "Devices"]) expect(html).toContain(t);
    // Overview has no tab strip.
    expect(tabsOf("overview")).not.toContain('role="tablist"');
    // Performance Max has no positive keywords, so Search keywords disappears from the tabs.
    const pmax = useGoogleAds.getState().accounts["7316204458"]!.data.campaigns.find((c) => c.type === "PERFORMANCE_MAX")!;
    html = tabsOf("negatives", { campaignId: pmax.id });
    expect(html).toContain("Negative keywords");
    expect(html).not.toContain("Search keywords");
  });

  it("splits Shared library and account ad groups into tabs", () => {
    connect();
    useGoogleAds.setState({ scope: {}, view: "library" });
    let html = renderToString(createElement(GoogleAdsShell));
    for (const t of ["Budgets", "Bid strategies", "Negative lists", "Placement exclusions", "Labels"]) expect(html).toContain(t);
    expect(html).toContain("Every budget in the account");
    useGoogleAds.setState({ scope: {}, view: "adGroups" });
    html = renderToString(createElement(GoogleAdsShell));
    expect(html).toContain("Asset groups");
  });

  it("builds the Shared library from real objects: portfolio strategies, placement lists, labels", () => {
    connect();
    const data = useGoogleAds.getState().accounts["7316204458"]!.data;
    // A portfolio strategy exists as its own object and campaigns point at it.
    expect(data.bidStrategies.length).toBeGreaterThan(0);
    for (const s of data.bidStrategies) {
      expect(data.campaigns.some((c) => c.bidding.portfolioId === s.id), s.name).toBe(true);
    }
    // A campaign's own strategy (no portfolioId) is not a library item.
    expect(data.campaigns.some((c) => !c.bidding.portfolioId)).toBe(true);
    // Placement exclusion lists are named lists attached to real campaigns.
    for (const l of data.placementLists) {
      expect(l.placements.length).toBeGreaterThan(0);
      expect(l.campaignIds.every((id) => data.campaigns.some((c) => c.id === id))).toBe(true);
    }
    // Labels sit on more than campaigns.
    expect(data.adGroups.some((g) => g.labels?.length)).toBe(true);
    expect(data.keywords.some((k) => k.labels?.length)).toBe(true);
    // The empty account has none of it.
    connect("9082215570");
    const empty = useGoogleAds.getState().accounts["9082215570"]!.data;
    expect([empty.bidStrategies, empty.placementLists, empty.labelDefs].every((x) => x.length === 0)).toBe(true);
  });

  it("recommendations are asked of the agent, not applied from the dashboard", () => {
    connect();
    useGoogleAds.setState({ scope: {}, view: "recommendations" });
    const html = renderToString(createElement(GoogleAdsShell));
    expect(html).toContain("Ask agent to apply");
    expect(html).toContain("Ask agent to explain");
    expect(html).not.toContain("Dismiss");
  });

  it("has no manual add, edit or experiment buttons: the user asks the agent", () => {
    connect();
    const page = (view: GaView) => {
      useGoogleAds.setState({ scope: {}, view });
      return part(renderToString(createElement(GoogleAdsShell)), "main");
    };
    const button = (label: string) => new RegExp(`</svg>\\s*${label}</button>`);
    expect(page("campaigns")).not.toContain("New campaign");
    expect(page("adGroups")).not.toMatch(button("Ad group"));
    const ads = page("ads");
    expect(ads).not.toContain("Write ads with agent");
    expect(ads).not.toMatch(button("Ad"));
    expect(ads).not.toMatch(button("Edit"));
    expect(ads).toContain("Fix with agent");
    const experiments = page("experiments");
    for (const t of ["New experiment", "Apply to campaign", "End experiment", "Start experiment"]) expect(experiments, t).not.toContain(t);
    expect(experiments).toContain("Confidence");
    // Keywords keeps the agent shortcuts and loses the manual add buttons.
    const keywords = page("keywords");
    expect(keywords).toContain("Keyword ideas");
    expect(keywords).not.toMatch(button("Keywords"));
    const negatives = page("negatives");
    expect(negatives).toContain("Find waste");
    expect(negatives).not.toMatch(button("Negative keywords"));
    expect(page("searchTerms")).toMatch(/Analy[sz]e with agent/);
    expect(negatives).not.toContain('aria-label="Remove"');
  });

  it("targeting and measurement pages are read-only", () => {
    connect();
    const render = (view: GaView, campaignId?: string) => {
      useGoogleAds.setState({ scope: campaignId ? { campaignId } : {}, view });
      return part(renderToString(createElement(GoogleAdsShell)), "main");
    };
    const campaignId = useGoogleAds.getState().accounts && Object.values(useGoogleAds.getState().accounts)[0]?.data.campaigns[0]?.id;
    const views: GaView[] = ["audiences", "demographics", "content", "locations", "schedule", "devices", "conversions"];
    for (const v of views) {
      for (const html of [render(v), render(v, campaignId)]) {
        expect(html, v).not.toContain("<input");
        // A <select> is allowed: it is the campaign picker (a view filter), not an editor.
        expect(html, v).not.toContain('aria-label="Remove"');
        expect(html, v).not.toMatch(/<button[^>]*role="switch"/);
        for (const t of ["Add segment", "Add exclusion", "Add targeting", "Add rule", "Upload a CSV"]) expect(html, `${v}: ${t}`).not.toContain(t);
        expect(html, v).not.toMatch(/>(All day|8:00[^<]*|Conversion action)<\/button>/);
      }
    }
    expect(render("content")).toMatch(/Find bad placements/);
    expect(render("conversions")).toMatch(/Check tracking/);
    // Lists show column headers so the numbers are readable.
    const demo = render("demographics");
    for (const h of ["Cost", "Conv.", "CPA", "ROAS", "Bid adj."]) expect(demo, h).toContain(h);
    const locs = render("locations");
    for (const h of ["Campaign", "Targeted locations", "Excluded", "Languages"]) expect(locs, h).toContain(h);
    const sched = render("schedule");
    for (const h of ["Campaign", "Runs", "Bid adjustments"]) expect(sched, h).toContain(h);
    const dev = render("devices");
    for (const h of ["Campaign", "Mobile phones", "Computers", "Tablets"]) expect(dev, h).toContain(h);
    // Rules & alerts: rules are created by the agent, there is no manual "New rule".
    const rules = render("rules");
    expect(rules).not.toContain("New rule");
    expect(rules).toContain("Let the agent set it up");
  });

  it("Performance Max campaign sidebar: asset groups, insights, search & exclusions, locations & languages", () => {
    connect();
    const sidebar = (campaignId: string, view: GaView = "adGroups") => {
      useGoogleAds.setState({ scope: { campaignId }, view });
      return part(renderToString(createElement(GoogleAdsShell)), "nav");
    };
    const pmax = sidebar("c_pmax");
    for (const label of ["Asset groups", "Assets", ">Products<", "Insights", "Search &amp; exclusions", "Locations &amp; languages", "Campaign settings", "Recommendations", "Reports"]) {
      expect(pmax, label).toContain(label);
    }
    // Not used by Performance Max: keywords, ads, an audiences page, placements page, devices.
    for (const label of [">Keywords<", ">Ads<", ">Audiences<", "Placements &amp; content", ">Devices<", "Locations &amp; schedule", "Product groups"]) {
      expect(pmax, label).not.toContain(label);
    }

    // Tabs of each Performance Max item.
    const tabsOf = (view: GaView) => {
      useGoogleAds.setState({ scope: { campaignId: "c_pmax" }, view });
      return part(renderToString(createElement(GoogleAdsShell)), "main");
    };
    for (const t of ["Channels", "Search categories", "Asset combinations", "Where ads showed"]) expect(tabsOf("channels"), t).toContain(t);
    for (const t of ["Search terms", "Negative keywords", "Brand exclusions"]) expect(tabsOf("brandExclusions"), t).toContain(t);
    const loc = tabsOf("languages");
    for (const t of ["Locations", "Languages", "Ad schedule"]) expect(loc, t).toContain(t);
    expect(loc).not.toContain(">Devices<");
    // No bid adjustment column for Performance Max locations.
    expect(tabsOf("locations")).not.toContain("Bid adj.");
    expect(tabsOf("assetCombinations")).toContain("Top combination");

    // The other campaign types keep their own sidebar (Search has keywords, no Insights).
    const search = sidebar("c_running", "keywords");
    expect(search).toContain(">Keywords<");
    expect(search).toContain("Locations &amp; languages");
    expect(search).toContain("Landing pages");
    expect(search).toContain("Insights");
    expect(search).not.toContain(">Products<");
    // Search keeps Devices and gets Languages.
    useGoogleAds.setState({ scope: { campaignId: "c_running" }, view: "languages" });
    const searchTabs = part(renderToString(createElement(GoogleAdsShell)), "main");
    for (const t of ["Locations", "Languages", "Ad schedule", "Devices"]) expect(searchTabs, t).toContain(t);
    useGoogleAds.setState({ scope: { campaignId: "c_running" }, view: "landingPages" });
    const pages = part(renderToString(createElement(GoogleAdsShell)), "main");
    for (const t of ["Landing page", "Mobile speed", "Cost"]) expect(pages, t).toContain(t);
    useGoogleAds.setState({ scope: { campaignId: "c_running" }, view: "impressionShare" });
    const share = part(renderToString(createElement(GoogleAdsShell)), "main");
    for (const t of ["Search impression share", "Lost to budget", "Lost to rank"]) expect(share, t).toContain(t);
    // A campaign that is the base of a running experiment says so on its Overview; others do not.
    useGoogleAds.setState({ scope: { campaignId: "c_shopping" }, view: "overview" });
    expect(part(renderToString(createElement(GoogleAdsShell)), "main")).toContain("Running in an experiment");
    useGoogleAds.setState({ scope: { campaignId: "c_running" }, view: "overview" });
    expect(part(renderToString(createElement(GoogleAdsShell)), "main")).not.toContain("Running in an experiment");
    // Landing pages are for Search, Display and Demand Gen; Insights is Search, Shopping, Performance Max and Demand Gen only.
    expect(sidebar("c_shopping")).not.toContain("Landing pages");
    expect(sidebar("c_remarketing")).not.toContain("Insights");
  });

  it("Shopping and Display campaign sidebars", () => {
    connect();
    const sidebar = (campaignId: string, view: GaView = "adGroups") => {
      useGoogleAds.setState({ scope: { campaignId }, view });
      return part(renderToString(createElement(GoogleAdsShell)), "nav");
    };
    const main = (campaignId: string, view: GaView) => {
      useGoogleAds.setState({ scope: { campaignId }, view });
      return part(renderToString(createElement(GoogleAdsShell)), "main");
    };

    // Shopping: feed-based, so Products and product groups, no assets or landing pages.
    const shop = sidebar("c_shopping");
    for (const label of ["Ad groups", "Product groups", ">Products<", "Insights", ">Keywords<", ">Audiences<", "Locations &amp; languages", "Campaign settings"]) {
      expect(shop, label).toContain(label);
    }
    for (const label of [">Assets<", "Landing pages", ">Ads<"]) expect(shop, label).not.toContain(label);
    const shopInsights = main("c_shopping", "priceCompetitiveness");
    for (const t of ["Impression share", "Price competitiveness", "Your price", "Market price", "Difference"]) expect(shopInsights, t).toContain(t);
    expect(shopInsights).toContain("Sample data");
    expect(main("c_shopping", "impressionShare")).toContain("Search impression share");
    // Video campaigns cannot be created or edited through Google's API: no goal offers Video.
    // Display is retired for new campaigns (Google is moving it into Demand Gen).
    for (const o of Object.values(OBJECTIVES)) {
      expect(o.types).not.toContain("VIDEO");
      expect(o.types).not.toContain("DISPLAY");
    }
    // Only this campaign's products, not the whole feed.
    expect(main("c_shopping", "products")).toContain("products in");
    // Shopping settings
    const shopSettings = main("c_shopping", "settings");
    for (const t of ["Shopping settings", "Campaign priority", "Inventory filter", "Feed label", "Country of sale", "Local inventory ads"]) expect(shopSettings, t).toContain(t);
    // Price competitiveness is Shopping-only.
    useGoogleAds.getState().setScope({ campaignId: "c_running" }, "priceCompetitiveness");
    expect(useGoogleAds.getState().view).toBe("adGroups");

    // Display: audiences, placements & content (with negative keywords inside), no Keywords or Insights.
    const display = sidebar("c_remarketing");
    for (const label of ["Ad groups", ">Ads<", "Assets", ">Audiences<", "Placements &amp; content", "Locations &amp; languages", "Campaign settings"]) {
      expect(display, label).toContain(label);
    }
    for (const label of [">Keywords<", "Insights", ">Products<", "Product groups"]) expect(display, label).not.toContain(label);
    expect(display).toContain("Landing pages");
    useGoogleAds.setState({ scope: { campaignId: "c_remarketing" }, view: "content" });
    const shown = part(renderToString(createElement(GoogleAdsShell)), "main");
    for (const t of ["Where ads showed", "Exclusions", "Negative keywords"]) expect(shown, t).toContain(t);
    const audiences = main("c_remarketing", "audiences");
    for (const t of ["Audiences", "Demographics"]) expect(audiences, t).toContain(t);
    const displaySettings = main("c_remarketing", "settings");
    for (const t of ["Display settings", "Optimized targeting", "Frequency cap", "Automatically created assets", "Content exclusions"]) expect(displaySettings, t).toContain(t);
    // Exclusions are Display-only: other types fall back.
    useGoogleAds.getState().setScope({ campaignId: "c_running" }, "contentExclusions");
    expect(useGoogleAds.getState().view).toBe("adGroups");
    useGoogleAds.getState().setScope({ campaignId: "c_shopping" }, "assets");
    expect(useGoogleAds.getState().view).toBe("adGroups");
  });

  it("Demand Gen campaign sidebar", () => {
    connect();
    const sidebar = (view: GaView = "adGroups") => {
      useGoogleAds.setState({ scope: { campaignId: "c_demandgen" }, view });
      return part(renderToString(createElement(GoogleAdsShell)), "nav");
    };
    const main = (view: GaView) => {
      useGoogleAds.setState({ scope: { campaignId: "c_demandgen" }, view });
      return part(renderToString(createElement(GoogleAdsShell)), "main");
    };
    const dg = sidebar();
    for (const label of ["Ad groups", ">Ads<", "Assets", "Insights", ">Audiences<", "Locations &amp; languages", "Campaign settings", "Recommendations", "Reports"]) {
      expect(dg, label).toContain(label);
    }
    // No keywords, placements, landing pages or products (no feed) at Demand Gen campaign level.
    for (const label of [">Keywords<", "Placements &amp; content", ">Products<", "Product groups"]) expect(dg, label).not.toContain(label);
    expect(dg).toContain("Landing pages");
    const channels = main("channels");
    for (const t of ["YouTube Shorts", "YouTube in-feed", "Discover", "Gmail", "Share of spend"]) expect(channels, t).toContain(t);
    const settings = main("settings");
    for (const t of ["Demand Gen settings", "Channels", "Lookalike segments", "Product feed", "Content suitability"]) expect(settings, t).toContain(t);
    // Pages Demand Gen does not have fall back to Ad groups.
    for (const v of ["keywords", "negatives", "searchTerms", "content", "contentExclusions"] as GaView[]) {
      useGoogleAds.getState().setScope({ campaignId: "c_demandgen" }, v);
      expect(useGoogleAds.getState().view, v).toBe("adGroups");
    }
    // Channels belong to Performance Max and Demand Gen only.
    useGoogleAds.getState().setScope({ campaignId: "c_running" }, "channels");
    expect(useGoogleAds.getState().view).toBe("adGroups");
  });

  it("ad group sidebar per campaign type", () => {
    connect();
    const nav = (campaignId: string, adGroupId: string, view: GaView) => {
      useGoogleAds.setState({ scope: { campaignId, adGroupId }, view });
      return part(renderToString(createElement(GoogleAdsShell)), "nav");
    };
    const hiddenEverywhere = ["Recommendations", ">Ad groups<", "Campaign settings", "Landing pages", "Insights", "Experiments"];
    // Search: ads, assets, keywords tabs, audiences + demographics, ad group settings; no locations or products.
    const search = nav("c_running", "ag_run_men", "keywords");
    for (const l of [">Ads<", "Assets", ">Keywords<", ">Audiences<", "Ad group settings"]) expect(search, l).toContain(l);
    for (const l of [...hiddenEverywhere, "Locations &amp; languages", ">Products<", "Product groups"]) expect(search, l).not.toContain(l);
    // Shopping: ads, product groups, products, keywords (negatives and search terms only), no assets.
    const shop = nav("c_shopping", "ag_shop_all", "ads");
    for (const l of [">Ads<", "Product groups", ">Products<", ">Keywords<", ">Audiences<", "Ad group settings"]) expect(shop, l).toContain(l);
    for (const l of [">Assets<", "Locations &amp; languages", "Insights"]) expect(shop, l).not.toContain(l);
    // Demand Gen: ads, assets, audiences, locations & languages, no keywords.
    const dg = nav("c_demandgen", "ag_dg_summer", "ads");
    for (const l of [">Ads<", "Assets", ">Audiences<", "Locations &amp; languages", "Ad group settings"]) expect(dg, l).toContain(l);
    for (const l of [">Keywords<", "Insights", ">Products<"]) expect(dg, l).not.toContain(l);

    const main = (campaignId: string, adGroupId: string, view: GaView) => {
      useGoogleAds.setState({ scope: { campaignId, adGroupId }, view });
      return part(renderToString(createElement(GoogleAdsShell)), "main");
    };
    // Tabs: Demographics inside Search and Demand Gen ad groups; Search keywords tab not in Shopping.
    expect(main("c_running", "ag_run_men", "audiences")).toContain("Demographics");
    expect(main("c_demandgen", "ag_dg_summer", "audiences")).toContain("Demographics");
    expect(main("c_shopping", "ag_shop_all", "audiences")).not.toContain("Demographics");
    const shopKeywords = main("c_shopping", "ag_shop_all", "negatives");
    expect(shopKeywords).toContain("Negative keywords");
    expect(shopKeywords).not.toContain("Search keywords");
    const dgLoc = main("c_demandgen", "ag_dg_summer", "languages");
    expect(dgLoc).toContain("Languages");
    expect(dgLoc).not.toContain("Ad schedule");
    // Ad group settings per type
    expect(main("c_demandgen", "ag_dg_summer", "adGroupSettings")).toContain("Audience segments");
    expect(main("c_running", "ag_run_men", "adGroupSettings")).toContain("Default bid");

    // Pages that do not exist for the ad group's type fall back.
    const go = (campaignId: string, adGroupId: string, v: GaView) => {
      useGoogleAds.getState().setScope({ campaignId, adGroupId }, v);
      return useGoogleAds.getState().view;
    };
    expect(go("c_demandgen", "ag_dg_summer", "keywords")).toBe("ads");
    expect(go("c_shopping", "ag_shop_all", "keywords")).toBe("negatives");
    expect(go("c_running", "ag_run_men", "locations")).toBe("keywords");
    expect(go("c_running", "ag_run_men", "productGroups")).toBe("keywords");
    expect(go("c_running", "ag_run_men", "impressionShare")).toBe("keywords");
    expect(go("c_shopping", "ag_shop_all", "assets")).toBe("ads");
    expect(go("c_shopping", "ag_shop_all", "productGroups")).toBe("productGroups");
    // Ad group settings only exist inside an ad group.
    useGoogleAds.getState().setScope({ campaignId: "c_running" }, "adGroupSettings");
    expect(useGoogleAds.getState().view).toBe("adGroups");
  });

  it("Performance Max asset group level and the History header button", () => {
    connect();
    const nav = (view: GaView) => {
      useGoogleAds.setState({ scope: { campaignId: "c_pmax", assetGroupId: "asg_all" }, view });
      return part(renderToString(createElement(GoogleAdsShell)), "nav");
    };
    const main = (view: GaView) => {
      useGoogleAds.setState({ scope: { campaignId: "c_pmax", assetGroupId: "asg_all" }, view });
      return part(renderToString(createElement(GoogleAdsShell)), "main");
    };
    const side = nav("overview");
    for (const l of ["Overview", "Reports", ">Assets<", "Insights", "Audience signals", "Asset group settings"]) expect(side, l).toContain(l);
    for (const l of ["Recommendations", "Asset groups", "Search &amp; exclusions", "Locations &amp; languages", ">Audiences<", ">Keywords<", ">Ads<", "Campaign settings"]) expect(side, l).not.toContain(l);
    // Overview describes the group itself.
    const overview = main("overview");
    for (const t of ["Asset coverage", "What needs attention", "Conv. value", "Good"]) expect(overview, t).toContain(t);
    // Tabs
    const assets = main("assetGroupAssets");
    for (const t of ["Assets", "Top combinations", "Google&#x27;s rating", "Headline"]) expect(assets, t).toContain(t);
    const signals = main("audienceSignals");
    for (const t of ["Audience signals", "Search themes"]) expect(signals, t).toContain(t);
    expect(main("searchThemes")).toContain("Search themes");
    expect(main("channels")).toContain("Share of spend");
    const settings = main("assetGroupSettings");
    for (const t of ["Final URL", "Business name", "Ad strength"]) expect(settings, t).toContain(t);
    // Top combinations shows only this group.
    expect(main("assetCombinations")).not.toContain("Summer Sale");
    useGoogleAds.setState({ scope: { campaignId: "c_pmax" }, view: "assetCombinations" });
    expect(part(renderToString(createElement(GoogleAdsShell)), "main")).toContain("Summer Sale");
    // Other pages fall back to the group assets; the group pages do not exist outside an asset group.
    const go = (scope: { campaignId?: string; assetGroupId?: string }, v: GaView) => {
      useGoogleAds.getState().setScope(scope, v);
      return useGoogleAds.getState().view;
    };
    expect(go({ campaignId: "c_pmax", assetGroupId: "asg_all" }, "searchTerms")).toBe("assetGroupAssets");
    expect(go({ campaignId: "c_pmax", assetGroupId: "asg_all" }, "recommendations")).toBe("assetGroupAssets");
    expect(go({ campaignId: "c_pmax" }, "assetGroupAssets")).toBe("adGroups");
    expect(go({}, "assetGroupSettings")).toBe("campaigns");
    // Breadcrumb shows the asset group, and the campaign Asset groups page links into it.
    useGoogleAds.setState({ scope: { campaignId: "c_pmax", assetGroupId: "asg_all" }, view: "overview" });
    const header = renderToString(createElement(GoogleAdsShell));
    expect(header).toContain("Change history");
    useGoogleAds.setState({ scope: { campaignId: "c_pmax" }, view: "adGroups" });
    const groups = part(renderToString(createElement(GoogleAdsShell)), "main");
    expect(groups).toContain("text-[#400095] hover:underline");
  });

  it("documents are two folders: Reports (with the ready templates) and Plans", () => {
    connect();
    useGoogleAds.setState({ scope: {}, view: "documents" });
    const root = part(renderToString(createElement(GoogleAdsShell)), "main");
    expect(root).toContain("Reports");
    expect(root).toContain("Plans");
    expect(root).not.toContain("Ready templates");
    expect(root).not.toContain("Ask the agent to write");

    const reports = renderToString(createElement(FolderView, { folder: "REPORTS", onBack: () => {} }));
    expect(reports).toContain("Ready templates");
    for (const t of ["Performance report", "Account audit", "Campaign plan"]) expect(reports, t).toContain(t);
    const plans = renderToString(createElement(FolderView, { folder: "PLANS", onBack: () => {} }));
    expect(plans).not.toContain("Ready templates");
    expect(plans).toContain("Your plans");
  });

  it("brings the Merchant Center Products page back, view-only", () => {
    connect();
    useGoogleAds.setState({ scope: {}, view: "products" });
    const page = renderToString(createElement(GoogleAdsShell));
    expect(part(page, "nav")).toContain(">Products<");
    const main = part(page, "main");
    expect(main).toContain("Merchant Center");
    expect(main).not.toMatch(/>\s*Fix from catalog\s*</);
    expect(main).not.toContain("Exclude from");
    expect(main).not.toContain('role="checkbox"');
    expect(main).toMatch(/Ask agent/);
  });

  it("business profile is a read-only knowledge base the agent fills", () => {
    connect();
    useGoogleAds.setState({ scope: {}, view: "profile" });
    let html = renderToString(createElement(GoogleAdsShell));
    for (const t of ["Read-only", "Knowledge base", "Markets &amp; catalog", "Economics", "Positioning", "Guardrails", "Brand guidelines", "Competitors", "Never advertise", "Peak seasons", "Key selling points", "Stride Violet", "Break-even"]) {
      expect(html, t).toContain(t);
    }
    expect(html).toMatch(/6(<!-- -->)? of (<!-- -->)?6(<!-- -->)? sections filled/);
    const page = part(html, "main");
    expect(page).not.toContain("Save profile");
    expect(page).not.toContain("<input");
    expect(page).not.toContain("<textarea");

    // Before onboarding the agent has filled nothing yet.
    useGoogleAds.getState().setProfile(emptyProfile("Stride"));
    html = renderToString(createElement(GoogleAdsShell));
    expect(html).toContain("Not filled yet");
    expect(html).toMatch(/0(<!-- -->)? of (<!-- -->)?6(<!-- -->)? sections filled/);
  });

  it("measures how complete the business profile is", () => {
    expect(profileCompleteness(DEFAULT_PROFILE)).toMatchObject({ done: 6, total: 6 });
    const none = profileCompleteness(emptyProfile());
    expect(none.done).toBe(0);
    const partial = profileCompleteness({ ...emptyProfile("Shop"), website: "https://shop.example", markets: ["UAE"], categories: ["Shoes"] });
    expect(partial.sections.filter((s) => s.filled).map((s) => s.id)).toEqual(["business", "markets"]);
  });

  it("lets Google Ads connect without Merchant Center", () => {
    const s = useGoogleAds.getState();
    s.disconnect();
    s.disconnectMerchant();
    s.completeAuth();
    useGoogleAds.getState().chooseAccount("7316204458");
    const html = renderToString(createElement(GoogleAdsShell));
    expect(html).toContain("Go to agent");
    expect(html).toContain("Connect Merchant Center");
    useGoogleAds.getState().enterWorkspace();
    expect(useGoogleAds.getState().entered).toBe(true);
    expect(useGoogleAds.getState().merchant.merchantId).toBeNull();
  });

  it("connects, switches, reconnects and disconnects Merchant Center from Connections", () => {
    connect();
    useGoogleAds.setState({ view: "connections", scope: {} });
    let html = renderToString(createElement(GoogleAdsShell));
    expect(html).toContain("Connect Merchant Center");
    expect(html).toContain("Locked until Merchant Center is connected");

    const s = useGoogleAds.getState();
    s.startMerchantConnect();
    expect(renderToString(createElement(GoogleAdsShell))).toContain("Choose an account");
    useGoogleAds.getState().completeMerchantAuth();
    html = renderToString(createElement(GoogleAdsShell));
    expect(html).toContain("Choose a Merchant Center account");
    expect(html).toContain("Linked to ");
    useGoogleAds.getState().selectMerchantAccount("512889034");
    html = renderToString(createElement(GoogleAdsShell));
    expect(html).toContain("Stride Store Feed");
    expect(html).not.toContain("Locked until Merchant Center is connected");

    // Another Merchant Center account than the one linked to this ad account.
    useGoogleAds.getState().changeMerchantAccount();
    useGoogleAds.getState().selectMerchantAccount("512889077");
    html = renderToString(createElement(GoogleAdsShell));
    expect(html).toMatch(/Linked to (<!-- -->)?512889034/);

    // Cancelling a reconnect keeps the connected account.
    useGoogleAds.getState().startMerchantConnect();
    useGoogleAds.getState().cancelMerchantConnect();
    expect(useGoogleAds.getState().merchant.status).toBe("connected");
    expect(useGoogleAds.getState().merchant.merchantId).toBe("512889077");

    useGoogleAds.getState().disconnectMerchant();
    expect(useGoogleAds.getState().merchant.merchantId).toBeNull();
    expect(renderToString(createElement(GoogleAdsShell))).toContain("Locked until Merchant Center is connected");
  });

  it("ignores an unknown Merchant Center account", () => {
    const s = useGoogleAds.getState();
    s.disconnectMerchant();
    s.completeMerchantAuth();
    useGoogleAds.getState().selectMerchantAccount("nope");
    expect(useGoogleAds.getState().merchant.status).toBe("selecting");
    useGoogleAds.getState().cancelMerchantConnect();
    expect(useGoogleAds.getState().merchant.status).toBe("disconnected");
  });

  it("the agent says Merchant Center is missing instead of proposing feed fixes", () => {
    connect();
    const s = useGoogleAds.getState();
    const data = s.accounts[s.customerId!].data;
    const without = planAgentTurn("Fix my Merchant Center product issues", { data, range: s.range, scope: {}, merchantConnected: false });
    expect(without.changes).toHaveLength(0);
    expect(without.viewHint).toBe("connections");
    expect(without.reply).toContain("Merchant Center isn't connected");
    const withMc = planAgentTurn("Fix my Merchant Center product issues", { data, range: s.range, scope: {}, merchantConnected: true });
    expect(withMc.changes.length).toBeGreaterThan(0);
  });

  for (const scope of [{}, { campaignId: "c_running" }, { campaignId: "c_running", adGroupId: "ag_run_men" }, { campaignId: "c_pmax" }, { campaignId: "c_shopping" }, { campaignId: "c_demandgen" }]) {
    for (const view of VIEWS) {
      it(`renders ${view} at ${JSON.stringify(scope)}`, () => {
        connect();
        useGoogleAds.setState({ scope, view });
        const html = renderToString(createElement(GoogleAdsShell));
        expect(html).toContain("Ads agent");
        expect(html).not.toContain("Connect Google Ads");
      });
    }
  }

  it("renders every view on the empty account", () => {
    connect("9082215570");
    for (const view of VIEWS) {
      useGoogleAds.setState({ view, scope: {} });
      expect(() => renderToString(createElement(GoogleAdsShell))).not.toThrow();
    }
  });

  it("renders chat with agent replies and pending changes", () => {
    connect();
    const s = useGoogleAds.getState();
    const state = s.accounts[s.customerId!];
    for (const prompt of ["Run a full audit of my account", "Create a Search campaign for running shoes in Saudi Arabia with $60/day"]) {
      const plan = planAgentTurn(prompt, { data: state.data, range: s.range, scope: {} });
      s.addMessage({ id: `u-${prompt}`, role: "user", text: prompt, at: "" });
      const ids = plan.changes.map((c) => useGoogleAds.getState().propose(c).id);
      s.addMessage({ id: `a-${prompt}`, role: "agent", text: plan.reply, at: "", steps: plan.steps, changeIds: ids, followUps: plan.followUps, draftBundle: plan.draftBundle });
    }
    useGoogleAds.setState({ view: "pending" });
    const html = renderToString(createElement(GoogleAdsShell));
    expect(html).toContain("Approve");
    const first = useGoogleAds.getState().accounts[s.customerId!].changes.at(-1)!;
    useGoogleAds.getState().applyChange(first.id);
    useGoogleAds.setState({ view: "history" });
    expect(renderToString(createElement(GoogleAdsShell))).toContain("Undo");
  });

  it("renders every document type in a tab", async () => {
    connect();
    const { buildPlanDoc, buildReportDoc, buildAuditDoc, buildBudgetDoc, buildKeywordDoc, buildAdCopyDoc, buildFeedDoc, buildCompetitorDoc, buildExperimentDoc } = await import("@/lib/google-ads/agent-docs");
    const s = useGoogleAds.getState();
    const state = s.accounts[s.customerId!];
    const c = { data: state.data, range: s.range, scope: {}, profile: state.profile, memories: state.memories };
    const docs = [buildPlanDoc(c, { occasion: "Ramadan", budget: 5000, goal: "Sales", focus: "Running shoes" }), buildReportDoc(c), buildAuditDoc(c), buildBudgetDoc(c, 12000), buildKeywordDoc(c, "trail shoes"), buildAdCopyDoc(c, "leggings"), buildFeedDoc(c), buildCompetitorDoc(c), buildExperimentDoc(c)];
    for (const d of docs) {
      useGoogleAds.getState().createDoc(d);
      const html = renderToString(createElement(GoogleAdsShell));
      expect(html).toContain(d.title.replace(/&/g, "&amp;").slice(0, 12));
    }
  });

  it("renders chat with team, todo, questions and a doc card", () => {
    connect();
    const s = useGoogleAds.getState();
    s.addMessage({ id: "u1", role: "user", text: "Make me a Ramadan campaign plan", at: "" });
    s.addMessage({ id: "a1", role: "agent", text: "Three quick questions", at: "", questions: [{ id: "budget", label: "Total budget", options: ["$3,000"] }], team: [{ role: "Analyst", task: "Reading", status: "WORKING" }], todo: [{ label: "Read", done: true }] });
    const html = renderToString(createElement(GoogleAdsShell));
    expect(html).toContain("Build the plan");
    expect(html).toContain("Analyst");
  });

  it("renders every dialog", () => {
    connect();
    const dialogs = [
      { kind: "adGroup" as const, campaignId: "c_running" },
      { kind: "keywords" as const },
      { kind: "negatives" as const, campaignId: "c_generic" },
      { kind: "ad" as const },
      { kind: "ad" as const, adGroupId: "ag_run_men", adId: "ad3" },
      { kind: "asset" as const },
      { kind: "budget" as const, campaignId: "c_running" },
      { kind: "audience" as const },
      { kind: "conversion" as const },
    ];
    for (const dialog of dialogs) {
      useGoogleAds.setState({ dialog });
      expect(() => renderToString(createElement(GaDialogs))).not.toThrow();
    }
  });

  it("renders the campaign editor for every type", () => {
    connect();
    const types: CampaignType[] = ["SEARCH", "PERFORMANCE_MAX", "SHOPPING", "DEMAND_GEN"];
    for (const type of types) {
      const b = emptyBundle();
      b.campaign.type = type;
      useGoogleAds.setState({ editor: { open: true, draft: b } });
      expect(renderToString(createElement(GaCampaignEditor))).toContain("Review your campaign");
    }
    useGoogleAds.setState({ editor: { open: true } });
    expect(renderToString(createElement(GaCampaignEditor))).toContain("goal of this campaign");
  });
});

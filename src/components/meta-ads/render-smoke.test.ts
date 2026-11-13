import React, { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useBusinessStore } from "@/lib/ads-shared/business-store";
import { planAgentTurn } from "@/lib/meta-ads/agent-sim";
import { emptyBundle } from "@/lib/meta-ads/mutations";
import { rangeFor } from "@/lib/meta-ads/metrics";
import { activeChatOf, useMetaAds } from "@/lib/meta-ads/store";
import { MaCampaignEditor } from "./ma-campaign-editor";
import { MaDialogs } from "./ma-dialogs";
import { META_VIEWS, MetaAdsShell } from "./ma-shell";
import { FlightDetail, PostDetail } from "./views/calendar";
import { CreativeDetail } from "./views/creatives";
import { creativeRows } from "@/lib/meta-ads/analytics";
import { buildFlights } from "@/lib/meta-ads/calendar";
import type { MetaView } from "@/lib/meta-ads/types";

// Server rendering reads zustand's initial state; make it read the live state instead.
const originalUseSyncExternalStore = React.useSyncExternalStore;
(React as { useSyncExternalStore: typeof React.useSyncExternalStore }).useSyncExternalStore = (subscribe, getSnapshot) =>
  originalUseSyncExternalStore(subscribe, getSnapshot, getSnapshot);

const MAIN = "act_4412907731";
const VIEWS = Object.keys(META_VIEWS) as MetaView[];
const part = (html: string, tag: string) => html.slice(html.indexOf("<" + tag), html.indexOf("</" + tag + ">"));
const accState = () => {
  const s = useMetaAds.getState();
  return s.accounts[s.accountId!]!;
};

function connect(id = MAIN) {
  useBusinessStore.getState().reset();
  const s = useMetaAds.getState();
  s.disconnect();
  s.completeAuth();
  useMetaAds.getState().selectAccount(id);
  const c = useMetaAds.getState();
  c.completeCatalogAuth();
  c.selectCatalog("cat_7701");
}

describe("meta render smoke", () => {
  it("knows all 36 views", () => {
    expect(VIEWS.length).toBe(36);
  });

  it("renders the connect screens and only opens the agent after 'Go to agent'", () => {
    useMetaAds.getState().disconnect();
    let html = renderToString(createElement(MetaAdsShell));
    expect(html).toContain("Agents · Meta Ads");
    expect(html).not.toContain("Ask anything about");
    useMetaAds.getState().startConnect();
    useMetaAds.getState().completeAuth();
    html = renderToString(createElement(MetaAdsShell));
    expect(html).toContain("Choose an ad account");
    useMetaAds.getState().chooseAccount(MAIN);
    html = renderToString(createElement(MetaAdsShell));
    expect(html).toContain("Go to agent");
    expect(html).not.toContain("Ask anything about");
    useMetaAds.getState().enterWorkspace();
    expect(renderToString(createElement(MetaAdsShell))).toContain("Ask anything about");
  });

  it("shows the fixed agent panel and the full navigation at account scope", () => {
    connect();
    const html = renderToString(createElement(MetaAdsShell));
    for (const t of ["New chat", "History", "Plan"]) expect(html).toContain(t);
    expect(html).not.toContain("Hide agent");
    const nav = part(html, "nav");
    for (const label of ["Overview", "Campaigns", "Ad sets", "Ads", "Calendar", "Creative library", "Experiments", "Catalog", "Lead forms", "Events Manager", "Quality &amp; safety", "Billing", "Documents", "Business profile", "Rules"]) {
      expect(nav, label).toContain(label);
    }
  });

  it("renders every page at account scope inside the shell", () => {
    connect();
    for (const view of VIEWS) {
      useMetaAds.setState({ view, scope: {} });
      const html = renderToString(createElement(MetaAdsShell));
      expect(html, view).toContain("Ask anything about");
      expect(html, view).not.toMatch(/could not be (shown|displayed)|Something went wrong/i);
    }
  });

  // About 830 renders (every page at the account, each campaign and each ad set), so it gets more time than the default 5s.
  it("renders every page for every campaign and ad set without throwing", () => {
    connect();
    const data = accState().data;
    for (const view of VIEWS) {
      const Page = META_VIEWS[view];
      useMetaAds.setState({ view, scope: {} });
      expect(() => renderToString(createElement(Page)), `${view} @account`).not.toThrow();
      for (const c of data.campaigns) {
        useMetaAds.setState({ view, scope: { campaignId: c.id } });
        expect(() => renderToString(createElement(Page)), `${view} @${c.id}`).not.toThrow();
      }
      for (const a of data.adSets) {
        useMetaAds.setState({ view, scope: { campaignId: a.campaignId, adSetId: a.id } });
        expect(() => renderToString(createElement(Page)), `${view} @${a.id}`).not.toThrow();
      }
    }
  }, 30_000);

  it("renders the pages for the second and the empty account", () => {
    for (const id of ["act_5520188314", "act_6630255901"]) {
      connect(id);
      for (const view of VIEWS) {
        useMetaAds.setState({ view, scope: {} });
        expect(() => renderToString(createElement(META_VIEWS[view])), `${view} @${id}`).not.toThrow();
      }
      const first = accState().data.campaigns[0];
      if (first) {
        for (const view of VIEWS) {
          useMetaAds.setState({ view, scope: { campaignId: first.id } });
          expect(() => renderToString(createElement(META_VIEWS[view])), `${view} @${id}/${first.id}`).not.toThrow();
        }
      }
    }
  });

  it("follows the objective in the navigation inside a campaign", () => {
    connect();
    const nav = (campaignId: string) => {
      useMetaAds.getState().setScope({ campaignId });
      return part(renderToString(createElement(MetaAdsShell)), "nav");
    };
    expect(nav("m_leads")).toContain("Lead forms");
    expect(nav("m_leads")).not.toContain("Catalog");
    expect(nav("m_asc")).toContain("Catalog");
    expect(nav("m_asc")).not.toContain("Lead forms");
    expect(nav("m_asc")).not.toContain("Billing");
    expect(nav("m_asc")).toContain("Campaign settings");
    useMetaAds.getState().setScope({ campaignId: "m_asc", adSetId: "as_asc" });
    const html = part(renderToString(createElement(MetaAdsShell)), "nav");
    expect(html).toContain("Ad set settings");
    expect(html).not.toContain("Opportunities");
  });

  it("billing is view only", () => {
    connect();
    useMetaAds.setState({ view: "billing", scope: {} });
    const html = renderToString(createElement(META_VIEWS.billing));
    expect(html).toMatch(/Billing/);
    expect(html).toMatch(/view only|can't change|cannot change|never change/i);
    // Only what the Marketing API returns: status, limit, spent, balance and (with manage access) the payment method.
    for (const label of ["Account status", "Payment method", "Visa ending 4417", "Balance due", "$412.80", "$17,460", "$25,000"]) expect(html, label).toContain(label);
    // Not exposed to apps, so no made-up numbers: a pointer to Meta Billing instead.
    expect(html).not.toContain("Next billing date");
    expect(html).toContain("Check your next charge");

    // Connected without manage access: Meta withholds the payment method.
    connect("act_5520188314");
    useMetaAds.setState({ view: "billing", scope: {} });
    expect(renderToString(createElement(META_VIEWS.billing))).toContain("See Meta Billing");
  });

  it("keeps several chats and switches to plan mode", () => {
    connect();
    const s = useMetaAds.getState();
    const first = activeChatOf(accState()).id;
    s.newChat();
    // An empty chat is reused instead of piling up blank tabs.
    expect(activeChatOf(accState()).id).toBe(first);
    useMetaAds.getState().setChatMode("plan");
    expect(activeChatOf(accState()).mode).toBe("plan");
    expect(renderToString(createElement(MetaAdsShell))).toContain("Plan");
  });

  it("tables use Ads Manager quick filters, a status dot (no Off / On switch) and results that say what they count", () => {
    connect();
    const data = accState().data;
    for (const [view, noun] of [["campaigns", "campaigns"], ["adSets", "ad sets"], ["ads", "ads"]] as const) {
      useMetaAds.setState({ view, scope: {} });
      const html = renderToString(createElement(META_VIEWS[view]));
      for (const label of ["Had delivery", "Actions", `All ${noun}`, `Active ${noun}`, 'aria-label="Active"']) expect(html, `${view}: ${label}`).toContain(label);
      expect(html, `${view}: no switch`).not.toContain("Off / On");
      expect(html, view).toMatch(/Per (purchase|landing page view|lead|engagement|reach|conversion|link click)/i);
    }
    useMetaAds.setState({ view: "adSets", scope: {} });
    expect(renderToString(createElement(META_VIEWS.adSets))).toContain("Attribution setting");
    // Counts come from the data: the demo account has ads that need attention.
    expect(data.ads.some((a) => a.review === "REJECTED" || a.review === "LIMITED")).toBe(true);
    useMetaAds.setState({ view: "ads", scope: {} });
    expect(renderToString(createElement(META_VIEWS.ads))).toMatch(/Actions[\s\S]{0,40}[1-9]/);
  });

  it("renders the dialogs", () => {
    connect();
    const dialogs = [
      { kind: "budget", entity: "CAMPAIGN", id: "m_asc" },
      { kind: "budget", entity: "AD_SET", id: "as_lal" },
      { kind: "exclusions", adSetId: "as_lal" },
      { kind: "rename", entity: "AD", id: "ad_asc_heat" },
    ] as const;
    for (const d of dialogs) {
      useMetaAds.getState().openDialog(d);
      expect(() => renderToString(createElement(MaDialogs)), JSON.stringify(d)).not.toThrow();
    }
    useMetaAds.getState().closeDialog();
  });

  it("opens agent drafts of a new ad set and new ads in the part editor, and a whole campaign in the full one", () => {
    connect();
    const ctx = () => ({ data: accState().data, range: rangeFor("LAST_30_DAYS"), scope: {} });
    const propose = (msg: string) => {
      const plan = planAgentTurn(msg, ctx());
      return useMetaAds.getState().propose({ ...plan.changes[0]! });
    };
    const set = propose("Add a new ad set to Prospecting – Running Shoes");
    const ad = propose("Add a new ad to Advantage+ audience – KSA & UAE");
    const camp = propose("Create an Advantage+ Sales campaign for running shoes in Saudi Arabia with $80/day");

    useMetaAds.getState().openChangeEditor(set.id);
    let html = renderToString(createElement(MaCampaignEditor));
    expect(html).toContain("meta-part-editor");
    expect(html).toContain("New ad set");
    expect(html).toContain("Drafted by agent");
    expect(html).toContain("Publish ad set");

    useMetaAds.getState().openChangeEditor(ad.id);
    html = renderToString(createElement(MaCampaignEditor));
    expect(html).toContain("meta-part-editor");
    expect(html).toContain("New ads");
    expect(html).toContain("Publish ads");

    useMetaAds.getState().openChangeEditor(camp.id);
    html = renderToString(createElement(MaCampaignEditor));
    expect(html).toContain("meta-campaign-editor");
    expect(html).not.toContain("meta-part-editor");
    useMetaAds.getState().closeEditor();

    // The pending list offers "Edit" for all three.
    useMetaAds.setState({ view: "pending", scope: {} });
    const pending = renderToString(createElement(META_VIEWS.pending));
    expect(pending.match(/>\s*Edit\s*</g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("renders the campaign editor empty and with an agent draft", () => {
    connect();
    useMetaAds.getState().openEditor(emptyBundle("SALES"));
    expect(renderToString(createElement(MaCampaignEditor))).toContain("Objective");
    const plan = planAgentTurn("Create an Advantage+ Sales campaign for running shoes in Saudi Arabia with $80/day", {
      data: accState().data,
      range: rangeFor("LAST_30_DAYS"),
      scope: {},
    });
    useMetaAds.getState().openEditor(plan.draftBundle);
    expect(() => renderToString(createElement(MaCampaignEditor))).not.toThrow();
    for (const o of ["LEADS", "TRAFFIC", "AWARENESS", "ENGAGEMENT"] as const) {
      useMetaAds.getState().openEditor(emptyBundle(o));
      expect(() => renderToString(createElement(MaCampaignEditor)), o).not.toThrow();
    }
    useMetaAds.getState().closeEditor();
  });

  it("shows the ad schedule grid, and explains the lifetime budget rule for daily ad sets", () => {
    connect();
    useMetaAds.setState({ view: "adSetSettings", scope: { campaignId: "m_traffic", adSetId: "as_traf_main" } });
    const scheduled = renderToString(createElement(META_VIEWS.adSetSettings));
    expect(scheduled).toContain("meta-schedule-grid");
    expect(scheduled).toContain("Every day 08:00–24:00");
    useMetaAds.setState({ view: "adSetSettings", scope: { campaignId: "m_traffic", adSetId: "as_traf_ig" } });
    const daily = renderToString(createElement(META_VIEWS.adSetSettings));
    expect(daily).toContain("needs a lifetime budget");
    expect(daily).toContain("All day, every day");
  });

  it("draws the calendar at account, campaign and ad set scope, with agent drafts as dashed bars", () => {
    connect();
    const month = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
    useMetaAds.setState({ view: "calendar", scope: {} });
    let html = renderToString(createElement(META_VIEWS.calendar));
    expect(html).toContain(month);
    // The week planner opens first: a folded ad band on top, post cards in their day, and no side panel until something is clicked.
    expect(html).toContain('data-flight="m_asc"');
    expect(html).toMatch(/\d+ more/);
    const todayPost = accState().data.posts.find((p) => p.publishAt.slice(0, 10) === new Date().toISOString().slice(0, 10))!;
    expect(html).toContain(`data-post="${todayPost.id}"`);
    for (const label of ["Planner", "Content type", "Status", "Platform", "Today", "Comfortable", "Compact", "Create", "Ads in flight", "Posts and ad launches"]) expect(html, label).toContain(label);
    expect(html).not.toContain("meta-calendar-panel");
    expect(html).not.toContain("meta-calendar-post-panel");
    expect(part(renderToString(createElement(MetaAdsShell)), "nav")).toContain("Calendar");

    // Clicking a post opens the slide-over with its preview and engagement.
    const published = accState().data.posts.find((p) => p.status === "PUBLISHED" && p.platforms.length === 2)!;
    html = renderToString(createElement(PostDetail, { post: published, onClose: () => {} }));
    expect(html).toContain("meta-calendar-post-panel");
    for (const label of ["Performance", "Engagement", "Caption", "Facebook", "Instagram", "Boost as an ad"]) expect(html, label).toContain(label);

    const ctx = () => ({ data: accState().data, range: rangeFor("LAST_30_DAYS"), scope: {} });
    const plan = planAgentTurn("Add a new ad set to Traffic – Summer Drop", ctx());
    useMetaAds.getState().propose({ ...plan.changes[0]! });

    useMetaAds.setState({ view: "calendar", scope: { campaignId: "m_traffic" } });
    html = renderToString(createElement(META_VIEWS.calendar));
    expect(html).toContain('data-flight="as_traf_main"');
    expect(html).toContain("dashed outline");
    expect(html).toContain("border-dashed");
    // Posts belong to the Page, so a campaign's calendar shows ads only.
    expect(html).not.toContain("data-post=");
    expect(html).not.toContain("Platform:");

    // An ad set's slide-over has its budget, setup, schedule and ad previews.
    useMetaAds.setState({ view: "calendar", scope: { campaignId: "m_traffic", adSetId: "as_traf_main" } });
    const today = new Date().toISOString().slice(0, 10);
    const flight = buildFlights(accState().data, { campaignId: "m_traffic", adSetId: "as_traf_main" }, [], today)[0]!;
    html = renderToString(createElement(FlightDetail, { flight, today, onClose: () => {} }));
    expect(html).toContain("meta-calendar-panel");
    expect(html).toContain("meta-schedule-grid");
    expect(html).toContain("Every day 08:00–24:00");
    for (const label of ["Lifetime budget", "Spent so far", "Setup", "Optimised for", "Placements", "Facebook Feed"]) expect(html, label).toContain(label);
  });

  it("draws reports with paid and social performance, and paid only inside a campaign", () => {
    connect();
    useMetaAds.setState({ view: "reports", scope: {} });
    let html = renderToString(createElement(META_VIEWS.reports));
    for (const label of ["Paid performance", "Social performance", "Performance over time", "Where the money goes", "Explore", "Top ads", "What stands out", "Top posts", "What format works", "Scheduled reports", "Weekly Meta performance", "New scheduled report", "Organic reach", "Engagement rate"])
      expect(html, label).toContain(label);
    // The explorer opens on placements with a total row.
    expect(html).toContain("Facebook Feed");
    expect(html).toContain("Total");

    useMetaAds.setState({ view: "reports", scope: { campaignId: "m_traffic" } });
    html = renderToString(createElement(META_VIEWS.reports));
    expect(html).toContain("Paid performance");
    expect(html).not.toContain("Social performance");
    expect(html).not.toContain("Top posts");
  });

  it("has no Shared library: block lists live in Brand safety, product sets in Catalog, concepts in the Creative library", () => {
    connect();
    useMetaAds.setState({ view: "overview", scope: {} });
    expect(part(renderToString(createElement(MetaAdsShell)), "nav")).not.toContain("Shared library");
    expect(Object.keys(META_VIEWS)).not.toContain("library");

    const data = accState().data;
    useMetaAds.setState({ view: "brandSafety", scope: {} });
    let html = renderToString(createElement(META_VIEWS.brandSafety));
    for (const b of data.blockLists) expect(html, b.name).toContain(b.name);
    for (const label of ["Block lists", "Update block lists", "Whole account", "Entries"]) expect(html, label).toContain(label);

    useMetaAds.setState({ view: "catalog", scope: {} });
    html = renderToString(createElement(META_VIEWS.catalog));
    expect(html).toContain("Product sets");
    for (const s of data.productSets) expect(html, s.name).toContain(s.name);

    useMetaAds.setState({ view: "creatives", scope: {} });
    html = renderToString(createElement(META_VIEWS.creatives));
    expect(html).toContain("Concepts");
  });

  it("shows the creative library as a gallery of ads and posts, with a full detail panel", () => {
    connect();
    useMetaAds.setState({ view: "creatives", scope: {} });
    const html = renderToString(createElement(META_VIEWS.creatives));
    for (const label of ["Creative health", "Concepts live", "Where the spend goes, by concept", "Best hook rate", "Gallery", "Table", "Concepts", "Everything", "Organic", "Brief new creative"]) expect(html, label).toContain(label);
    expect(html).toContain('data-creative="ad_asc_heat"');
    expect(html).toMatch(/data-post="post_\d+"/);
    // CTR change is a fraction shown once as a percent: never the old "−2075%".
    expect(html).not.toMatch(/−\d{3,}%/);

    const data = accState().data;
    const row = creativeRows(data, rangeFor("LAST_30_DAYS"), ["ad_asc_heat"])[0]!;
    const detail = renderToString(createElement(CreativeDetail, { row, data, range: rangeFor("LAST_30_DAYS"), currency: "USD", onClose: () => {} }));
    for (const label of ["meta-creative-panel", "Health", "Frequency", "Video retention", "Hook rate", "relevance rankings", "Where it runs", "Copy variations", "New variation"]) expect(detail, label).toContain(label);

    // Inside a campaign there are no organic posts.
    useMetaAds.setState({ view: "creatives", scope: { campaignId: "m_asc" } });
    expect(renderToString(createElement(META_VIEWS.creatives))).not.toContain("data-post=");
  });

  it("puts Account quality and Brand safety on one page with two tabs, badge on the menu item", () => {
    connect();
    for (const view of ["accountQuality", "brandSafety"] as const) {
      useMetaAds.setState({ view, scope: {} });
      const shell = renderToString(createElement(MetaAdsShell));
      const nav = part(shell, "nav");
      expect(nav).toContain("Quality &amp; safety");
      expect(nav).not.toContain("Brand safety");
      // Both tabs show above either page.
      expect(shell).toContain("Account quality");
      expect(shell).toContain("Brand safety");
    }
    useMetaAds.setState({ view: "overview", scope: { campaignId: "m_traffic" } });
    expect(part(renderToString(createElement(MetaAdsShell)), "nav")).not.toContain("Quality &amp; safety");
  });
});
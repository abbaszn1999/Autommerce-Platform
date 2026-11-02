import React, { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { setDataSource, demoDataSource, type GoogleAdsDataSource } from "@/lib/google-ads/data-source";
import { buildDemoAccount } from "@/lib/google-ads/mock-data";
import { touchedBy } from "@/lib/google-ads/mutations";
import { useGoogleAds } from "@/lib/google-ads/store";
import { GoogleAdsShell } from "./ga-shell";
import { GaSyncBanner, GaViewBoundary } from "./ga-view-boundary";
import { AdDetail } from "./views/ad-detail";
import { KeywordDetail } from "./views/keyword-detail";

// Server rendering reads zustand's initial state; make it read the live state instead.
const originalUseSyncExternalStore = React.useSyncExternalStore;
(React as { useSyncExternalStore: typeof React.useSyncExternalStore }).useSyncExternalStore = (subscribe, getSnapshot) =>
  originalUseSyncExternalStore(subscribe, getSnapshot, getSnapshot);

const part = (html: string, tag: string) => html.slice(html.indexOf("<" + tag), html.indexOf("</" + tag + ">"));

function connect() {
  const s = useGoogleAds.getState();
  s.disconnect();
  s.disconnectMerchant();
  s.completeAuth();
  useGoogleAds.getState().selectAccount("7316204458");
}

const data = buildDemoAccount("2026-10-23");
const noop = () => {};

describe("ad and keyword detail", () => {
  it("shows Google's rating for each headline and the pin position", () => {
    connect();
    const ad = data.ads.find((a) => a.type === "RESPONSIVE_SEARCH_AD")!;
    const html = renderToString(createElement(AdDetail, { ad, onBack: noop }));
    expect(html).toContain("Headlines and descriptions");
    expect(html).toMatch(/Best|Good|Low|Learning/);
    expect(html).toContain("Pinned to");
  });

  it("shows first page and top of page bids next to the keyword's Max CPC", () => {
    connect();
    const keyword = data.keywords[0];
    expect(keyword.firstPageBid).toBeGreaterThan(0);
    expect(keyword.topOfPageBid).toBeGreaterThanOrEqual(keyword.firstPageBid!);
    const html = renderToString(createElement(KeywordDetail, { keyword, onBack: noop }));
    expect(html).toContain("Quality Score");
    expect(html).toContain("First page bid");
  });
});

describe("landing pages and insights by campaign type", () => {
  it("keeps Landing pages for Search, Display and Demand Gen only", () => {
    connect();
    const open = (type: string) => {
      const id = data.campaigns.find((c) => c.type === type)!.id;
      useGoogleAds.getState().setScope({ campaignId: id }, "landingPages");
      return useGoogleAds.getState().view;
    };
    for (const type of ["SEARCH", "DISPLAY", "DEMAND_GEN"]) expect(open(type), type).toBe("landingPages");
    for (const type of ["SHOPPING", "PERFORMANCE_MAX"]) expect(open(type), type).not.toBe("landingPages");
  });

  it("moves Trends and Impression share to the account level", () => {
    connect();
    useGoogleAds.getState().setScope({}, "trends");
    expect(useGoogleAds.getState().view).toBe("trends");
    useGoogleAds.getState().setScope({ campaignId: "c_running" }, "trends");
    expect(useGoogleAds.getState().view).not.toBe("trends");
  });

  it("renders the account Insights tabs with every campaign's impression share", () => {
    connect();
    useGoogleAds.setState({ scope: {}, view: "impressionShare" });
    const main = part(renderToString(createElement(GoogleAdsShell)), "main");
    for (const t of ["Lost to budget", "Lost to rank"]) expect(main).toContain(t);
    useGoogleAds.setState({ scope: {}, view: "trends" });
    expect(part(renderToString(createElement(GoogleAdsShell)), "main")).toMatch(/Best day|Best hour/i);
  });
});

describe("history is scoped to where you are", () => {
  it("records which campaigns, ad groups and asset groups a change touched", () => {
    const keyword = data.keywords[0];
    const touched = touchedBy(data, [{ kind: "status.set", entity: "KEYWORD", ids: [keyword.id], status: "PAUSED" }]);
    expect(touched.adGroupIds).toContain(keyword.adGroupId);
    expect(touched.campaignIds).toContain(data.adGroups.find((g) => g.id === keyword.adGroupId)!.campaignId);
    const budget = touchedBy(data, [{ kind: "budget.update", budgetId: "b_running", amount: 200 }]);
    expect(budget.campaignIds).toContain("c_running");
    expect(budget.adGroupIds).toEqual([]);
  });

  it("offers a here / all account switch inside a campaign", () => {
    connect();
    useGoogleAds.setState({ scope: { campaignId: "c_running" }, view: "history" });
    const main = part(renderToString(createElement(GoogleAdsShell)), "main");
    expect(main).toContain("All account");
  });
});

describe("view-only dashboard", () => {
  it("has no inline editors on the Campaigns page", () => {
    connect();
    useGoogleAds.setState({ scope: {}, view: "campaigns" });
    const main = part(renderToString(createElement(GoogleAdsShell)), "main");
    expect(main).not.toContain('type="number"');
    expect(main).not.toContain("New campaign");
  });

  it("shows campaign settings as read-only fields", () => {
    connect();
    useGoogleAds.setState({ scope: { campaignId: "c_pmax" }, view: "settings" });
    const main = part(renderToString(createElement(GoogleAdsShell)), "main");
    for (const t of ["Brand guidelines", "Tracking", "New customer"]) expect(main, t).toContain(t);
    expect(main).not.toContain("<input");
    expect(main).not.toContain("<select");
  });
});

describe("refresh and sync states", () => {
  it("starts ready and refresh keeps the data and stamps the time", async () => {
    connect();
    const before = useGoogleAds.getState();
    const acc = before.accounts[before.customerId!];
    expect(acc.sync.status).toBe("ready");
    await useGoogleAds.getState().refreshData();
    const after = useGoogleAds.getState().accounts[before.customerId!];
    expect(after.sync.status).toBe("ready");
    expect(after.data).toBe(acc.data);
    expect(after.sync.refreshedAt >= acc.sync.refreshedAt).toBe(true);
  });

  it("replaces the data when the source returns a new snapshot", async () => {
    connect();
    const id = useGoogleAds.getState().customerId!;
    const source: GoogleAdsDataSource = {
      id: "test",
      label: "Test",
      fetchAccount: async (_id, current) => ({ ...current, account: { ...current.account, name: "Reloaded account" } }),
    };
    setDataSource(source);
    try {
      await useGoogleAds.getState().refreshData();
      expect(useGoogleAds.getState().accounts[id].data.account.name).toBe("Reloaded account");
    } finally {
      setDataSource(demoDataSource);
    }
  });

  it("keeps the old numbers and shows a Retry banner when a refresh fails", async () => {
    connect();
    const id = useGoogleAds.getState().customerId!;
    const old = useGoogleAds.getState().accounts[id].data;
    setDataSource({ id: "down", label: "Down", fetchAccount: async () => Promise.reject(new Error("Google Ads is unreachable")) });
    try {
      await useGoogleAds.getState().refreshData();
      const acc = useGoogleAds.getState().accounts[id];
      expect(acc.sync.status).toBe("error");
      expect(acc.data).toBe(old);
      const html = renderToString(createElement(GaSyncBanner));
      expect(html).toContain("Could not refresh");
      expect(html).toContain("Google Ads is unreachable");
      expect(html).toContain("Retry");
    } finally {
      setDataSource(demoDataSource);
    }
    await useGoogleAds.getState().refreshData();
    expect(useGoogleAds.getState().accounts[id].sync.status).toBe("ready");
    expect(renderToString(createElement(GaSyncBanner))).toBe("");
  });

  it("shows a loading line while the account reloads", () => {
    connect();
    const id = useGoogleAds.getState().customerId!;
    useGoogleAds.setState((s) => ({ accounts: { ...s.accounts, [id]: { ...s.accounts[id], sync: { ...s.accounts[id].sync, status: "loading" } } } }));
    expect(renderToString(createElement(GaSyncBanner))).toContain("Loading the latest numbers");
    useGoogleAds.setState((s) => ({ accounts: { ...s.accounts, [id]: { ...s.accounts[id], sync: { ...s.accounts[id].sync, status: "ready" } } } }));
  });

  it("the page boundary shows a fallback after a render error and clears it when you navigate", () => {
    const err = new Error("boom");
    expect(GaViewBoundary.getDerivedStateFromError(err)).toEqual({ error: err });
    const cleared = GaViewBoundary.getDerivedStateFromProps({ children: null, resetKey: "b" }, { error: err, resetKey: "a" });
    expect(cleared).toEqual({ error: null, resetKey: "b" });
    expect(GaViewBoundary.getDerivedStateFromProps({ children: null, resetKey: "a" }, { error: err, resetKey: "a" })).toBeNull();
    const html = renderToString(createElement(GaViewBoundary, { resetKey: "a" }, createElement("p", null, "fine")));
    expect(html).toContain("fine");
  });
});

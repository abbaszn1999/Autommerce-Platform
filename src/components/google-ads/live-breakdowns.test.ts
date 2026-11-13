import React, { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { useGoogleAds } from "@/lib/google-ads/store";
import { DemographicsView } from "./views/targeting";
import { ReportsView } from "./views/reports";
import { TrendsView } from "./views/trends";

// Server rendering reads zustand's initial state; make it read the live state instead.
const original = React.useSyncExternalStore;
(React as { useSyncExternalStore: typeof React.useSyncExternalStore }).useSyncExternalStore = (subscribe, getSnapshot) => original(subscribe, getSnapshot, getSnapshot);

function connectDemo() {
  const s = useGoogleAds.getState();
  s.disconnect();
  s.disconnectMerchant();
  s.completeAuth();
  useGoogleAds.getState().selectAccount("7316204458");
}

describe("breakdowns on a live account", () => {
  beforeAll(() => {
    connectDemo();
    useGoogleAds.setState({ mode: "live", workspaceId: "w1" });
  });
  afterAll(() => {
    useGoogleAds.setState({ mode: "demo", workspaceId: null });
  });

  it("waits for Google instead of showing simulated splits", () => {
    const reports = renderToString(createElement(ReportsView));
    expect(reports).toContain("Loading from Google Ads");
    expect(reports).not.toContain("Mobile phones");
  });

  it("shows no simulated best hour or device", () => {
    const trends = renderToString(createElement(TrendsView));
    expect(trends).toContain("Loading from Google Ads");
    expect(trends).not.toContain("Mobile phones");
    expect(trends).not.toContain(":00");
  });

  it("hides demographic rows until Google answers", () => {
    expect(renderToString(createElement(DemographicsView))).toContain("Loading from Google Ads");
  });

  it("still simulates on the demo account, which says it is demo data", () => {
    useGoogleAds.setState({ mode: "demo" });
    expect(renderToString(createElement(ReportsView))).toContain("Mobile phones");
    useGoogleAds.setState({ mode: "live" });
  });
});

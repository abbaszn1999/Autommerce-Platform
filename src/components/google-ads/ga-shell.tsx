"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useWorkspaceContext } from "@/app/(dashboard)/w/[workspaceSlug]/workspace-context";
import { runAgentTurn } from "@/lib/google-ads/agent-runner";
import { useGoogleAds } from "@/lib/google-ads/store";
import type { GaView } from "@/lib/google-ads/types";
import { boardLocked, onboardingStageOf, type OnboardingStage } from "@/lib/business-profile";
import { useStoreAgent } from "@/components/store-agent/use-store-agent";
import { ProfileSetup } from "./profile-setup";
import { ONBOARDING_START, OnboardingLock } from "./onboarding-lock";
import { GaCampaignEditor } from "./ga-campaign-editor";
import { GaChat } from "./ga-chat";
import { GaVera } from "./ga-vera";
import { GaConnect } from "./ga-connect";
import { GaDialogs } from "./ga-dialogs";
import { GaNav } from "./ga-nav";
import { GaTopbar } from "./ga-topbar";
import { AdGroupsView } from "./views/ad-groups";
import { AdsView } from "./views/ads";
import { AssetsView } from "./views/assets";
import { AudiencesView } from "./views/audiences";
import { CampaignsView } from "./views/campaigns";
import { HistoryView, PendingView } from "./views/changes";
import { ConversionsView } from "./views/conversions";
import { KeywordsView, NegativesView } from "./views/keywords";
import { LibraryView } from "./views/library";
import { DevicesView, LanguagesView, LocationsView, ScheduleView } from "./views/locations";
import { ImpressionShareView, LandingPagesView, PriceCompetitivenessView } from "./views/search-insights";
import { TrendsView } from "./views/trends";
import { GaSyncBanner, GaViewBoundary } from "./ga-view-boundary";
import { WorkspaceSkeleton, firstLoadPlaceholder } from "./ga-skeleton";
import { AssetCombinationsView, BrandExclusionsView, ChannelsView, PlacementsShownView, SearchCategoriesView } from "./views/pmax-insights";
import { GaViewTabs } from "./ga-view-tabs";
import { OverviewView } from "./views/overview";
import { RecommendationsView } from "./views/recommendations";
import { SearchTermsView } from "./views/search-terms";
import { AdGroupSettingsView, SettingsView } from "./views/settings";
import { AssetGroupAssetsView, AssetGroupSettingsView, AudienceSignalsView, SearchThemesView } from "./views/asset-group";
import { AccountSettingsView, LinksView } from "./views/account";
import { ProductGroupsView, ProductsView } from "./views/products";
import { ConnectionsView } from "./views/connections";
import { MerchantConnectDialog } from "./ga-merchant";
import { ReportsView } from "./views/reports";
import { RulesView } from "./views/rules";
import { ContentExclusionsView, ContentView, DemographicsView } from "./views/targeting";
import { CompetitorAdsView, ExperimentsView, PlannerView } from "./views/tools";
import { DocumentsView } from "./views/documents";
import { ProfileView } from "./views/profile";
import { DocTabs } from "./docs/doc-tabs";
import { DocView } from "./docs/doc-view";
import { useAccountState } from "@/lib/google-ads/store";

const VIEWS: Record<GaView, () => React.ReactNode> = {
  overview: OverviewView,
  campaigns: CampaignsView,
  adGroups: AdGroupsView,
  ads: AdsView,
  assets: AssetsView,
  keywords: KeywordsView,
  negatives: NegativesView,
  searchTerms: SearchTermsView,
  audiences: AudiencesView,
  locations: LocationsView,
  schedule: ScheduleView,
  devices: DevicesView,
  recommendations: RecommendationsView,
  conversions: ConversionsView,
  library: LibraryView,
  settings: SettingsView,
  pending: PendingView,
  history: HistoryView,
  products: ProductsView,
  productGroups: ProductGroupsView,
  reports: ReportsView,
  rules: RulesView,
  competitorAds: CompetitorAdsView,
  experiments: ExperimentsView,
  planner: PlannerView,
  content: ContentView,
  demographics: DemographicsView,
  links: LinksView,
  accountSettings: AccountSettingsView,
  documents: DocumentsView,
  profile: ProfileView,
  connections: ConnectionsView,
  languages: LanguagesView,
  brandExclusions: BrandExclusionsView,
  channels: ChannelsView,
  searchCategories: SearchCategoriesView,
  assetCombinations: AssetCombinationsView,
  placementsShown: PlacementsShownView,
  landingPages: LandingPagesView,
  impressionShare: ImpressionShareView,
  trends: TrendsView,
  priceCompetitiveness: PriceCompetitivenessView,
  contentExclusions: ContentExclusionsView,
  adGroupSettings: AdGroupSettingsView,
  assetGroupAssets: AssetGroupAssetsView,
  audienceSignals: AudienceSignalsView,
  searchThemes: SearchThemesView,
  assetGroupSettings: AssetGroupSettingsView,
};

// Like the Store Agent: the agent panel is always there and is resized by dragging the divider.
const CHAT_DEFAULT = 440;
const CHAT_MIN = 360;
const chatMax = () => Math.max(CHAT_MIN, Math.round(window.innerWidth * 0.6));

/**
 * Google Ads agent workspace: agent chat on the left, a full Google Ads-style
 * account manager on the right. `live` connects real Google accounts for this
 * workspace; otherwise everything runs on demo data.
 */
export function GoogleAdsShell({ live = false }: { live?: boolean }) {
  const status = useGoogleAds((s) => s.status);
  const entered = useGoogleAds((s) => s.entered);
  const workspaceId = useWorkspaceContext().workspace?.id;
  const initLive = useGoogleAds((s) => s.initLive);

  useEffect(() => {
    if (!live || !workspaceId) return;
    // Back from Google sign-in: read the result once, then drop it from the address bar.
    const params = new URLSearchParams(window.location.search);
    const notice = { result: params.get("google"), kind: params.get("kind") };
    if (notice.result) {
      params.delete("google");
      params.delete("kind");
      const rest = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
    }
    void initLive(workspaceId, notice);
  }, [live, workspaceId, initLive]);

  // Connecting Google Ads alone stays on the connect screen until "Go to agent".
  const inWorkspace = status === "connected" && entered;
  const setup = useFirstRunSetup(live && inWorkspace ? workspaceId : undefined);
  return (
    <>
      {!inWorkspace ? (
        <GaConnect />
      ) : setup.state === "show" && workspaceId ? (
        <ProfileSetup workspaceId={workspaceId} onDone={setup.finish} />
      ) : setup.state === "checking" ? (
        <WorkspaceSkeleton />
      ) : (
        <TooltipProvider delayDuration={200}>
          <Workspace stage={live ? setup.stage : null} workspaceId={workspaceId} onUnlockAnyway={setup.unlockAnyway} />
        </TooltipProvider>
      )}
      <MerchantConnectDialog />
    </>
  );
}

/** The workspace whose onboarding chat the page already started (this tab), so it is never started twice. */
let onboardingStarted: string | null = null;

/**
 * Live accounts: the first time an owner or admin enters, ask whether the
 * business profile setup was done, and whether the first-run onboarding is
 * still going (the board is locked until Vera has filled the workspace).
 * A failed check never blocks the workspace.
 */
function useFirstRunSetup(workspaceId: string | undefined) {
  // The answer is kept per workspace, so switching workspaces checks again.
  const [answer, setAnswer] = useState<{ workspaceId: string; show: boolean; stage: OnboardingStage | null } | null>(null);
  useEffect(() => {
    if (!workspaceId) return;
    let alive = true;
    fetch(`/api/business-profile/setup?${new URLSearchParams({ workspaceId })}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { show: false }))
      .then((d: { show?: boolean; onboardingStage?: OnboardingStage | null }) => alive && setAnswer({ workspaceId, show: !!d.show, stage: d.onboardingStage ?? null }))
      .catch(() => alive && setAnswer({ workspaceId, show: false, stage: null }));
    return () => {
      alive = false;
    };
  }, [workspaceId]);

  // While Vera works, follow the stage until she unlocks the board.
  const locked = !!workspaceId && answer?.workspaceId === workspaceId && !answer.show && boardLocked(answer.stage);
  useEffect(() => {
    if (!workspaceId || !locked) return;
    let alive = true;
    const timer = setInterval(() => {
      fetch(`/api/business-profile?${new URLSearchParams({ workspaceId })}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { profile?: { values?: Record<string, unknown> } } | null) => {
          if (!alive || !d?.profile) return;
          const stage = onboardingStageOf(d.profile.values ?? {});
          setAnswer((a) => (a && a.workspaceId === workspaceId && a.stage !== stage ? { ...a, stage } : a));
        })
        .catch(() => undefined);
    }, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [workspaceId, locked]);

  const finish = useCallback(() => {
    if (!workspaceId) return;
    // The popup just saved everything and started the onboarding: Vera opens the chat and asks her questions.
    setAnswer({ workspaceId, show: false, stage: "interview" });
    useGoogleAds.getState().setView("profile");
    onboardingStarted = workspaceId;
    runAgentTurn(ONBOARDING_START);
  }, [workspaceId]);
  const unlockAnyway = useCallback(async () => {
    if (!workspaceId) return;
    const res = await fetch("/api/business-profile/setup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, action: "unlock" }) });
    if (res.ok) setAnswer((a) => (a ? { ...a, stage: "done" } : a));
  }, [workspaceId]);
  const state = !workspaceId ? "done" : answer?.workspaceId !== workspaceId ? "checking" : answer.show ? "show" : "done";
  const stage = answer && answer.workspaceId === workspaceId ? answer.stage : null;
  return { state, finish, stage, unlockAnyway };
}

/** Reloaded in the middle of the onboarding with no chat at all (it never started): open it now. */
function OnboardingStarter({ workspaceId }: { workspaceId: string }) {
  useEffect(() => {
    if (onboardingStarted === workspaceId) return;
    const ready = () => {
      const s = useStoreAgent.getState();
      if (s.domain !== "google_ads" || s.availability !== "ready" || !s.chatsLoaded) return false;
      onboardingStarted = workspaceId;
      if (s.chats.length === 0) runAgentTurn(ONBOARDING_START);
      return true;
    };
    if (ready()) return;
    const unsubscribe = useStoreAgent.subscribe(() => {
      if (ready()) unsubscribe();
    });
    return unsubscribe;
  }, [workspaceId]);
  return null;
}
function Workspace({ stage, workspaceId, onUnlockAnyway }: { stage: OnboardingStage | null; workspaceId: string | undefined; onUnlockAnyway: () => Promise<void> }) {
  const locked = boardLocked(stage);
  const view = useGoogleAds((s) => s.view);
  // Live accounts talk to Vera; the demo keeps its simulated agent.
  const live = useGoogleAds((s) => s.mode === "live");
  const customerId = useGoogleAds((s) => s.customerId);
  const scope = useGoogleAds((s) => s.scope);
  // Live plans and reports open inside the Documents page; the demo keeps its document tabs.
  const acc = useAccountState();
  const demoTab = acc?.activeTab ?? "account";
  const activeTab = live ? "account" : demoTab;
  // First load of a live account: skeletons (or a retry) instead of a page full of zeros.
  const placeholder = firstLoadPlaceholder(view, acc?.sync);
  const [width, setWidth] = useState(CHAT_DEFAULT);
  const drag = useRef<{ x: number; w: number } | null>(null);

  const onDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      drag.current = { x: e.clientX, w: width };
      e.currentTarget.setPointerCapture(e.pointerId);
      document.body.style.userSelect = "none";
    },
    [width]
  );
  const onMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setWidth(Math.min(chatMax(), Math.max(CHAT_MIN, drag.current.w + e.clientX - drag.current.x)));
  }, []);
  const onUp = useCallback(() => {
    drag.current = null;
    document.body.style.userSelect = "";
  }, []);

  const View = VIEWS[view];

  return (
    <div className="autommerce-dashboard flex h-full min-h-0 w-full bg-background [font-family:var(--brand-font)]">
      {/* Agent panel: the lighter surface. The ads panel on the right is the recessed canvas (tinted in light, darkest in dark), so the two read as different places. */}
      {live ? <GaVera width={width} /> : <GaChat width={width} />}
      <div
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize · double-click to reset"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onDoubleClick={() => setWidth(CHAT_DEFAULT)}
        className="w-1 shrink-0 cursor-col-resize border-s bg-border/40 transition-colors hover:bg-[#6B358D]/40 dark:hover:bg-[#F76D01]/40"
      />
      <div className="flex min-w-0 flex-1 flex-col bg-[#F6F4FA] dark:bg-background">
        {!live && <DocTabs />}
        {locked && stage ? (
          <>
            {workspaceId && <OnboardingStarter workspaceId={workspaceId} />}
            <OnboardingLock stage={stage} onUnlockAnyway={onUnlockAnyway} />
          </>
        ) : activeTab === "account" ? (
          <>
            <GaTopbar />
            <div className="flex min-h-0 flex-1">
              <GaNav />
              <main className="min-w-0 flex-1 overflow-y-auto">
                {/* Keyed so local view state (filters, selection) resets with the account or scope. */}
                <div key={`${customerId}:${scope.campaignId ?? ""}:${scope.adGroupId ?? ""}:${scope.assetGroupId ?? ""}:${view}`} className="mx-auto max-w-[1400px] px-5 py-5">
                  {placeholder ?? (
                    <>
                      <GaSyncBanner />
                      <GaViewTabs />
                      <GaViewBoundary resetKey={`${customerId}:${scope.campaignId ?? ""}:${scope.adGroupId ?? ""}:${scope.assetGroupId ?? ""}:${view}`}>
                        <View />
                      </GaViewBoundary>
                    </>
                  )}
                </div>
              </main>
            </div>
          </>
        ) : (
          <div className="min-h-0 flex-1">
            <DocView docId={activeTab} />
          </div>
        )}
      </div>
      <GaDialogs />
      <GaCampaignEditor />
    </div>
  );
}

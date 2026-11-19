"use client";

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Loader2 } from "lucide-react";
import { useWorkspaceContext } from "@/app/(dashboard)/w/[workspaceSlug]/workspace-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MetaLiveWorkspace, MetaRealConnect, useLoginResult, useMetaLive } from "./ma-live";
import { useAccountState, useMetaAds } from "@/lib/meta-ads/store";
import type { MetaView } from "@/lib/meta-ads/types";
import { MaCampaignEditor } from "./ma-campaign-editor";
import { CatalogConnectDialog } from "./ma-catalog-connect";
import { MaChat } from "./ma-chat";
import { MaConnect } from "./ma-connect";
import { MaDialogs } from "./ma-dialogs";
import { MaNav } from "./ma-nav";
import { MaTopbar } from "./ma-topbar";
import { MaSyncBanner, MaViewBoundary } from "./ma-view-boundary";
import { MaViewTabs } from "./ma-view-tabs";
import { DocTabs } from "./docs/doc-tabs";
import { DocView } from "./docs/doc-view";
import { OverviewView } from "./views/overview";
import { CampaignsView } from "./views/campaigns";
import { AdSetsView } from "./views/ad-sets";
import { AdsView } from "./views/ads";
import { CalendarView } from "./views/calendar";
import { CreativesView } from "./views/creatives";
import { ExperimentsView } from "./views/experiments";
import { CatalogView } from "./views/catalog";
import { LeadFormsView } from "./views/lead-forms";
import { BreakdownsView, DemographicsView, LandingPagesView, PlacementsView, ReachFrequencyView, TrendsView } from "./views/insights";
import { AdSetAudienceView, AdSetPlacementsView, AudiencesView, LocationsView } from "./views/targeting";
import { AccountQualityView, AccountSettingsView, BillingView, BrandSafetyView, EventsManagerView, LinkedAssetsView } from "./views/setup";
import { ConnectionsView } from "./views/connections";
import { AdSetSettingsView, SettingsView } from "./views/settings";
import { OpportunitiesView } from "./views/opportunities";
import { ReportsView } from "./views/reports";
import { RulesView } from "./views/rules";
import { DocumentsView } from "./views/documents";
import { ProfileView } from "./views/profile";
import { HistoryView, PendingView } from "./views/changes";
import { PlannerView } from "./views/planner";

const VIEWS: Record<MetaView, () => React.ReactNode> = {
  overview: OverviewView,
  opportunities: OpportunitiesView,
  reports: ReportsView,
  campaigns: CampaignsView,
  adSets: AdSetsView,
  ads: AdsView,
  calendar: CalendarView,
  creatives: CreativesView,
  experiments: ExperimentsView,
  catalog: CatalogView,
  leadForms: LeadFormsView,
  placements: PlacementsView,
  demographics: DemographicsView,
  trends: TrendsView,
  reachFrequency: ReachFrequencyView,
  landingPages: LandingPagesView,
  breakdowns: BreakdownsView,
  audiences: AudiencesView,
  locations: LocationsView,
  adSetAudience: AdSetAudienceView,
  adSetPlacements: AdSetPlacementsView,
  eventsManager: EventsManagerView,
  linkedAssets: LinkedAssetsView,
  accountQuality: AccountQualityView,
  brandSafety: BrandSafetyView,
  billing: BillingView,
  connections: ConnectionsView,
  accountSettings: AccountSettingsView,
  settings: SettingsView,
  adSetSettings: AdSetSettingsView,
  documents: DocumentsView,
  profile: ProfileView,
  rules: RulesView,
  pending: PendingView,
  history: HistoryView,
  planner: PlannerView,
};

/** Every page, for the render smoke test. */
export const META_VIEWS = VIEWS;

// Like the Store Agent: the agent panel is always there and is resized by dragging the divider.
const CHAT_DEFAULT = 440;
const CHAT_MIN = 360;
const chatMax = () => Math.max(CHAT_MIN, Math.round(window.innerWidth * 0.6));

/**
 * Meta Ads agent workspace: agent chat on the left, a full Ads Manager-style
 * account manager on the right. Front-end prototype on demo data.
 */
export function MetaAdsShell({ live: realMeta = false }: { live?: boolean }) {
  const workspaceId = useWorkspaceContext().workspace?.id;
  const live = useMetaLive(workspaceId);
  const loginError = useLoginResult();
  const status = useMetaAds((s) => s.status);
  const entered = useMetaAds((s) => s.entered);

  // A real Meta connection: the live workspace (stage A). Otherwise the demo, with the real Connect on top.
  // Meta is set up on this server: the real connection only. Until the workspace and its
  // connection are known, a spinner (never a glimpse of the demo).
  if (live.loading || (realMeta && !workspaceId)) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (live.configured && live.connection) return <MetaLiveWorkspace live={live} loginError={loginError} />;
  // Meta is set up on this server: only the real connect, never the simulated demo login.
  if ((live.configured || realMeta) && workspaceId) return <MetaRealConnect workspaceId={workspaceId} canManage={live.canManage} loginError={loginError ?? live.error} />;

  // Connecting Meta alone stays on the connect screen until "Go to agent".
  const inWorkspace = status === "connected" && entered;
  return (
    <>
      {inWorkspace ? (
        <TooltipProvider delayDuration={200}>
          <Workspace />
        </TooltipProvider>
      ) : (
        <MaConnect />
      )}
      <CatalogConnectDialog />
    </>
  );
}

function Workspace() {
  const view = useMetaAds((s) => s.view);
  const accountId = useMetaAds((s) => s.accountId);
  const scope = useMetaAds((s) => s.scope);
  const activeTab = useAccountState()?.activeTab ?? "account";
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
  const key = `${accountId}:${scope.campaignId ?? ""}:${scope.adSetId ?? ""}:${view}`;

  return (
    <div className="autommerce-dashboard flex h-full min-h-0 w-full bg-background [font-family:var(--brand-font)]">
      <MaChat width={width} />
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
        <DocTabs />
        {activeTab === "account" ? (
          <>
            <MaTopbar />
            <div className="flex min-h-0 flex-1">
              <MaNav />
              <main className="min-w-0 flex-1 overflow-y-auto">
                {/* Keyed so local view state (filters, selection) resets with the account or scope. */}
                <div key={key} className="mx-auto max-w-[1400px] px-5 py-5">
                  <MaSyncBanner />
                  <MaViewTabs />
                  <MaViewBoundary resetKey={key}>
                    <View />
                  </MaViewBoundary>
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
      <MaDialogs />
      <MaCampaignEditor />
    </div>
  );
}

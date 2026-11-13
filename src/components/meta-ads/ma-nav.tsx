"use client";

import {
  BarChart3,
  CalendarDays,
  BellRing,
  Brain,
  CreditCard,
  Database,
  FileStack,
  FileText,
  FlaskConical,
  FolderKanban,
  Image as ImageIcon,
  LayoutDashboard,
  LayoutList,
  Lightbulb,
  Link2,
  Plug,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Telescope,
  Users,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAccountState, useMetaAds } from "@/lib/meta-ads/store";
import type { MetaView } from "@/lib/meta-ads/types";
import { TAB_GROUPS, groupActive, navCtx, visibleTabs } from "./nav-model";

type NavItem = { view: MetaView; label: string; icon: LucideIcon; badge?: string | number; hidden?: boolean; /** Pages that count as this item being open (tabbed items). */ views?: MetaView[] };

export function MaNav() {
  const acc = useAccountState();
  const view = useMetaAds((s) => s.view);
  const scope = useMetaAds((s) => s.scope);
  const setView = useMetaAds((s) => s.setView);
  const hasCatalog = useMetaAds((s) => s.catalog.status === "connected");
  if (!acc) return null;
  const { data } = acc;

  const campaign = data.campaigns.find((c) => c.id === scope.campaignId);
  const objective = campaign?.objective;
  const inCampaign = !!scope.campaignId;
  const inAdSet = !!scope.adSetId;
  const opps = data.opportunities.filter((o) => o.status === "OPEN").length;
  const unread = data.alerts.filter((a) => !a.read).length;
  const issues = data.policyIssues.filter((p) => p.status !== "RESOLVED").length;

  const ctx = navCtx(data.campaigns, scope, hasCatalog);
  const tabItem = (id: string, icon: LucideIcon): NavItem => {
    const g = TAB_GROUPS.find((x) => x.id === id)!;
    const tabs = visibleTabs(g, ctx);
    return { view: tabs[0]?.view ?? g.tabs[0]!.view, views: g.tabs.map((t) => t.view), label: g.label, icon, hidden: !groupActive(g, ctx) || !tabs.length };
  };

  // The dashboard is view-only: the agent does the work, so approvals are in the chat.
  const groups: { title?: string; items: NavItem[] }[] = [
    {
      items: [
        { view: "overview", label: "Overview", icon: LayoutDashboard },
        { view: "opportunities", label: "Opportunities", icon: Lightbulb, badge: opps || undefined, hidden: inAdSet },
        { view: "reports", label: "Reports", icon: BarChart3 },
      ],
    },
    {
      title: "Structure",
      items: [
        { view: "campaigns", label: "Campaigns", icon: FolderKanban, hidden: inCampaign },
        { view: "adSets", label: "Ad sets", icon: LayoutList, hidden: inAdSet },
        { view: "ads", label: "Ads", icon: FileText },
        { view: "calendar", label: "Calendar", icon: CalendarDays },
        { view: "creatives", label: "Creative library", icon: ImageIcon, hidden: inCampaign },
        { view: "experiments", label: "Experiments", icon: FlaskConical, hidden: inCampaign },
        { view: "catalog", label: "Catalog", icon: ShoppingBag, hidden: !hasCatalog || inAdSet || (inCampaign && objective !== "SALES") },
        { view: "leadForms", label: "Lead forms", icon: ClipboardList, hidden: inAdSet || (inCampaign && objective !== "LEADS") },
      ],
    },
    {
      title: "Insights",
      items: [tabItem("insights", Telescope), { view: "breakdowns", label: "Breakdowns", icon: Telescope, hidden: !inAdSet }],
    },
    {
      title: "Targeting & audiences",
      items: [tabItem("audiences", Users), tabItem("adSetTargeting", Users)],
    },
    {
      title: "Setup",
      items: [
        { view: "eventsManager", label: "Events Manager", icon: Database, hidden: inCampaign },
        { view: "linkedAssets", label: "Linked assets", icon: Link2, hidden: inCampaign },
        { ...tabItem("safety", ShieldCheck), badge: issues || undefined },
        { view: "billing", label: "Billing & limit", icon: CreditCard, hidden: inCampaign },
        { view: "connections", label: "Connections", icon: Plug, hidden: inCampaign },
        { view: "accountSettings", label: "Account settings", icon: Settings2, hidden: inCampaign },
        { view: "settings", label: "Campaign settings", icon: Settings2, hidden: !inCampaign || inAdSet },
        { view: "adSetSettings", label: "Ad set settings", icon: Settings2, hidden: !inAdSet },
      ],
    },
    {
      title: "Agent",
      items: [
        { view: "documents", label: "Documents", icon: FileStack, badge: acc.docs.length || undefined, hidden: inCampaign },
        { view: "profile", label: "Business profile", icon: Brain, hidden: inCampaign },
        { view: "rules", label: "Rules & alerts", icon: BellRing, badge: unread || undefined, hidden: inCampaign },
      ],
    },
  ];

  return (
    <nav className="flex w-56 shrink-0 flex-col overflow-y-auto border-r border-border/60 bg-muted/20 px-2 py-3">
      {groups.map((g, gi) => {
        const items = g.items.filter((i) => !i.hidden);
        if (!items.length) return null;
        return (
          <div key={gi} className={cn(gi > 0 && "mt-3")}>
            {g.title && <p className="mb-1 px-2.5 text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground/70">{g.title}</p>}
            {items.map((item) => {
              const active = item.views ? item.views.includes(view) : view === item.view;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setView(item.view)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
                    active ? "bg-[#400095]/10 text-[#400095] dark:bg-violet-500/15 dark:text-violet-300" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge !== undefined && (
                    <span className={cn("rounded-full px-1.5 text-[10px] font-bold", item.view === "rules" || item.view === "accountQuality" ? "bg-[#F76D01] text-white" : "bg-muted-foreground/15 text-muted-foreground")}>{item.badge}</span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

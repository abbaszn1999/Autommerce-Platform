"use client";

import { BusinessProfilePage } from "@/components/ads-shared/business-profile";
import { useGoogleAds } from "@/lib/google-ads/store";
import { useGa } from "../use-ga";
import { LiveProfileView } from "./business-profile";

/**
 * The business knowledge base. Every plan and report reads from it.
 * - Live workspaces: the real, editable profile saved for the workspace and shared by every agent.
 * - Demo: the read-only profile the agent fills during onboarding, one per workspace and shared with the Meta Ads agent.
 */
export function ProfileView() {
  const live = useGoogleAds((s) => s.mode === "live");
  return live ? <LiveProfileView /> : <DemoProfileView />;
}

function DemoProfileView() {
  const { currency } = useGa();
  return <BusinessProfilePage currency={currency} />;
}

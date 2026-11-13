"use client";

import { BusinessProfilePage } from "@/components/ads-shared/business-profile";
import { useGa } from "../use-ga";

/**
 * The business knowledge base. Read-only on purpose: the agent fills it during
 * onboarding and keeps it current, and every plan and report reads from it.
 * One profile per workspace, shared with the Meta Ads agent.
 */
export function ProfileView() {
  const { currency } = useGa();
  return <BusinessProfilePage currency={currency} />;
}

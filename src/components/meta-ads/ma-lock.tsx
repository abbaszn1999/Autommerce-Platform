"use client";

import { Infinity as InfinityIcon } from "lucide-react";
import { GoogleAdsLock } from "@/components/google-ads/ga-lock";

/** Same password and cookie as Google Ads: unlocking one opens both. */
export function MetaAdsLock() {
  return <GoogleAdsLock title="Meta Ads" icon={InfinityIcon} />;
}

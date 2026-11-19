"use client";

// Shared by the real Meta connection screens (ma-live.tsx) and the live
// account area (ma-live-account.tsx).

import { AlertTriangle } from "lucide-react";

type Pair = { id: string; name: string };
export type LiveConnection = {
  metaUserName: string | null;
  connectedAt: string;
  expiresAt: string | null;
  expired: boolean;
  expiresSoon: boolean;
  scopes: string[];
  adAccount: (Pair & { currency: string | null }) | null;
  business: Pair | null;
  page: Pair | null;
  catalog: Pair | null;
};

export const BRAND_BTN =
  "inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#400095] px-5 text-sm font-bold text-white transition-colors hover:bg-[#340079] disabled:opacity-60 dark:bg-[#F76D01] dark:hover:bg-[#d85f00]";
export const GHOST_BTN = "inline-flex h-9 items-center gap-1.5 rounded-lg border border-border/70 px-3 text-xs font-semibold transition-colors hover:bg-muted/60 disabled:opacity-60";

const ERRORS: Record<string, string> = {
  cancelled: "You cancelled the Facebook login. Nothing was connected.",
  missing_permissions: "Some permissions were not allowed, so nothing was connected. Connect again and allow everything asked.",
  invalid_state: "The login link expired or was opened by another account. Start again.",
  login_failed: "Facebook did not complete the login. Try again.",
  token_expired: "The Meta connection expired or was removed. Reconnect Meta.",
  meta_permission_missing: "Meta refused: a permission is missing. Reconnect Meta and allow everything asked.",
  not_configured: "Meta is not set up on this server yet.",
  network: "Meta could not be reached. Try again in a moment.",
  meta_request_failed: "Meta did not answer. Try again in a moment.",
  forbidden: "Only the workspace owner or an admin can do this.",
};
export const errorText = (code: string | null | undefined) => (code ? ERRORS[code] ?? `Something went wrong (${code}).` : null);

export const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—");

export const connectUrl = (workspaceId: string) => `/api/meta-ads/oauth/start?workspaceId=${encodeURIComponent(workspaceId)}`;

export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-medium text-red-700 dark:text-red-400">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{children}</span>
    </div>
  );
}

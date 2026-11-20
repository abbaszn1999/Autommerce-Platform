import type { SupabaseClient } from "@supabase/supabase-js";

export type GoogleAdsAccount = { accountName: string; customerId: string; currency: string; merchant: { name: string; id: string } | null };

/** The Google Ads account a Google Ads chat works on (picked on the Google Ads page). */
export async function loadAdsAccount(db: SupabaseClient, workspaceId: string): Promise<GoogleAdsAccount> {
  const { data } = await db
    .from("google_ads_connections")
    .select("kind, account_id, account_name, account_currency")
    .eq("workspace_id", workspaceId)
    .not("composio_connected_account_id", "is", null);
  const ads = data?.find((r) => r.kind === "ads");
  const merchant = data?.find((r) => r.kind === "merchant" && r.account_id);
  if (!ads?.account_id) throw new Error("Google Ads is not connected for this workspace. Connect it on the Google Ads page.");
  return {
    accountName: String(ads.account_name ?? ads.account_id),
    customerId: String(ads.account_id),
    currency: String(ads.account_currency ?? ""),
    merchant: merchant ? { name: String(merchant.account_name ?? merchant.account_id), id: String(merchant.account_id) } : null,
  };
}

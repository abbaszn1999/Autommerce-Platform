import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetaAccountInfo } from "./instructions";

/** The Meta ad account (and business, Page, catalog) a Meta Ads chat works on, picked on the Meta Ads page. No token: the site keeps it. */
export async function loadMetaAccount(db: SupabaseClient, workspaceId: string): Promise<MetaAccountInfo> {
  const { data } = await db
    .from("meta_ads_connections")
    .select("ad_account_id, ad_account_name, ad_account_currency, business_id, business_name, page_id, page_name, catalog_id, catalog_name")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (!data?.ad_account_id) throw new Error("Meta is not connected for this workspace. Connect it on the Meta Ads page and pick an ad account.");
  const pair = (id: unknown, name: unknown) => (id ? { id: String(id), name: String(name ?? id) } : null);
  return {
    adAccountId: String(data.ad_account_id),
    adAccountName: String(data.ad_account_name ?? data.ad_account_id),
    currency: String(data.ad_account_currency ?? ""),
    business: pair(data.business_id, data.business_name),
    page: pair(data.page_id, data.page_name),
    catalog: pair(data.catalog_id, data.catalog_name),
  };
}

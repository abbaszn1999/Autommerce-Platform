import { NextRequest, NextResponse } from "next/server";
import { jsonError, requireMrRead } from "@/lib/market-research/api-schema";
import { fetchShopStoreUrl } from "@/lib/sync/providers/shopify/shop-info";
import type { IntegrationRecord } from "@/lib/sync/core/types";

export const maxDuration = 30;

function normalizeStoreUrl(value: string | null | undefined): string {
  const clean = (value ?? "").trim().replace(/\/+$/, "");
  if (!clean) return "";
  return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
}

/**
 * The storefront origin and platform of the connected store, so the On-page
 * tab can turn stored collection handles into links a merchant can open and
 * build the sitemap export.
 */
export async function GET(request: NextRequest) {
  const workspaceId = request.nextUrl.searchParams.get("workspaceId") ?? "";
  if (!workspaceId) return jsonError("workspaceId is required", 400);

  const auth = await requireMrRead(workspaceId);
  if (!auth.ok) return auth.response;

  const { data: integrationRow } = await auth.admin
    .from("workspace_integrations")
    .select("provider, integration_name, base_url, config")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const provider = String(integrationRow?.provider ?? "").toLowerCase();
  const fallbackUrl = normalizeStoreUrl(integrationRow?.base_url);

  if (!integrationRow || provider !== "shopify") {
    return NextResponse.json(
      { provider: provider || null, storeUrl: fallbackUrl },
      { headers: auth.headers }
    );
  }

  const shopUrl = await fetchShopStoreUrl({
    integration: integrationRow as IntegrationRecord,
  });

  return NextResponse.json(
    { provider, storeUrl: normalizeStoreUrl(shopUrl) || fallbackUrl },
    { headers: auth.headers }
  );
}

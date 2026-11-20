import { clip, str, type ToolEvents } from "../../core/events";

/** How the Google Ads agent's own tools read in the chat (the shared tools are described by core). */
export const googleAdsToolEvents: ToolEvents = {
  describe(name, args) {
    switch (name) {
      case "ads_overview":
        return { kind: "store_read", title: "Reading the Google Ads account" };
      case "ads_query":
        return { kind: "store_read", title: "Querying Google Ads", detail: clip(str(args.purpose), 140) || undefined };
      case "ads_change":
        return { kind: "store_write", title: "Changing Google Ads", detail: clip(str(args.title), 140) || undefined };
      case "ads_report":
        return { kind: "store_read", title: "Analysing Google Ads", detail: str(args.report).replace(/_/g, " ") || undefined };
      case "merchant_products":
        return { kind: "store_read", title: "Reading Merchant Center products" };
      case "merchant_change":
        return { kind: "store_write", title: "Fixing Merchant Center products", detail: clip(str(args.title), 140) || undefined };
      case "business_profile":
        return { kind: "store_read", title: "Reading the business profile" };
      case "keyword_research": {
        const seed = str(args.site) || str(args.url) || (Array.isArray(args.keywords) ? (args.keywords as unknown[]).slice(0, 3).map(String).join(", ") : "");
        return { kind: "store_read", title: args.mode === "metrics" ? "Checking search volumes" : "Finding keyword ideas", detail: clip(seed, 120) || undefined };
      }
      case "keyword_forecast":
        return { kind: "store_read", title: "Forecasting keywords", detail: Number(args.dailyBudget) ? `${args.dailyBudget} a day` : undefined };
      case "competitor_ads":
        return {
          kind: "store_read",
          title: args.quoteOnly === true ? "Pricing a competitor lookup" : "Looking up a competitor's ads",
          detail: clip([args.domain, args.country].filter((v) => typeof v === "string" && v).join(" · "), 120) || undefined,
        };
      case "save_plan":
        return { kind: "plan", title: args.documentId ? "Revising the plan" : "Writing the plan", detail: clip(str(args.title), 140) || undefined };
      case "save_report":
        return { kind: "file", title: args.documentId ? "Updating the report" : "Writing the report", detail: clip(str(args.title), 140) || undefined };
      case "read_document":
        return { kind: "store_read", title: "Reading a document" };
      case "update_business_profile": {
        const fields = Array.isArray(args.edits) ? (args.edits as Array<{ field?: unknown }>).map((e) => str(e?.field)).filter(Boolean).join(", ") : "";
        return { kind: "other", title: args.statedByUser === true ? "Saving to the business profile" : "Suggesting business profile values", detail: clip(fields, 120) || undefined };
      }
      default:
        return null;
    }
  },

  summarize(name, text) {
    const saved = /saved to google-ads\//.test(text);
    switch (name) {
      case "ads_overview":
      case "ads_report":
      case "merchant_products":
        return { ok: true, summary: saved ? "large result saved to a file" : undefined };
      case "ads_query": {
        if (saved) return { ok: true, summary: "large result saved to a file" };
        try {
          return { ok: true, summary: `${(JSON.parse(text) as { rowCount?: number }).rowCount ?? 0} rows` };
        } catch {
          return { ok: true };
        }
      }
      case "ads_change":
        return { ok: true, summary: "applied in Google Ads" };
      case "merchant_change":
        return { ok: true, summary: "sent to Merchant Center" };
      case "business_profile":
      case "save_report":
      case "read_document":
      case "keyword_forecast":
        return { ok: true };
      case "save_plan":
        try {
          const steps = (JSON.parse(text) as { steps?: number }).steps;
          return { ok: true, summary: steps ? `${steps} step${steps > 1 ? "s" : ""}, checked by Google` : undefined };
        } catch {
          return { ok: true };
        }
      case "competitor_ads":
        if (saved) return { ok: true, summary: "large result saved to a file" };
        try {
          const parsed = JSON.parse(text) as { paidKeywords?: number; credits?: number };
          if (typeof parsed.credits === "number") return { ok: true, summary: parsed.credits ? `${parsed.credits} credits` : "free" };
          const n = parsed.paidKeywords ?? 0;
          return { ok: true, summary: `${n} paid keyword${n === 1 ? "" : "s"}` };
        } catch {
          return { ok: true };
        }
      case "keyword_research":
        if (saved) return { ok: true, summary: "large result saved to a file" };
        try {
          const n = ((JSON.parse(text) as { keywords?: unknown[] }).keywords ?? []).length;
          return { ok: true, summary: `${n} keyword${n === 1 ? "" : "s"}` };
        } catch {
          return { ok: true };
        }
      case "update_business_profile":
        try {
          const parsed = JSON.parse(text) as { saved?: unknown[]; skipped?: unknown[] };
          const savedCount = parsed.saved?.length ?? 0;
          const skipped = parsed.skipped?.length ?? 0;
          return { ok: true, summary: `${savedCount} saved${skipped ? `, ${skipped} left to the owner` : ""}` };
        } catch {
          return { ok: true };
        }
      default:
        return null;
    }
  },
};

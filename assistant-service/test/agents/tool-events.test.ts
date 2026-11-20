import { describe, expect, it } from "vitest";
import { googleAdsToolEvents } from "../../src/agents/google-ads/events";
import { storeAssistantToolEvents } from "../../src/agents/store-assistant/events";
import { describeTool, summarizeResult } from "../../src/core/events";

const ok = (text: string) => ({ status: "finished", value: { content: [{ text }] } });

describe("each agent describes its own tools", () => {
  it("Google Ads tools read as before, and only with the Google Ads hooks", () => {
    expect(describeTool("ads_change", { title: "Raise the budget" }, googleAdsToolEvents)).toEqual({ kind: "store_write", title: "Changing Google Ads", detail: "Raise the budget" });
    expect(describeTool("keyword_research", { mode: "metrics", keywords: ["a", "b"] }, googleAdsToolEvents).title).toBe("Checking search volumes");
    // Without the hooks, core does not know an ads tool: it falls back to a plain label.
    expect(describeTool("ads_change", { title: "x" }).title).not.toBe("Changing Google Ads");
  });

  it("Google Ads results are summarised by Google Ads, errors by core", () => {
    expect(summarizeResult("ads_query", ok('{"rowCount": 12}'), googleAdsToolEvents)).toEqual({ ok: true, summary: "12 rows" });
    expect(summarizeResult("keyword_research", ok("saved to google-ads/ideas.json"), googleAdsToolEvents).summary).toBe("large result saved to a file");
    const failed = summarizeResult("ads_query", { status: "error", value: { content: [{ text: "quota" }], isError: true } }, googleAdsToolEvents);
    expect(failed.ok).toBe(false);
  });

  it("the Store Assistant's own tools are described by it, and shared ones by core", () => {
    expect(describeTool("save_store_note", { note: "Free shipping over 50" }, storeAssistantToolEvents).title).toBe("Remembering for this store");
    expect(describeTool("inline_image", { image: "attachments/logo.png" }, storeAssistantToolEvents).title).toBe("Putting the logo into the page");
    expect(describeTool("shopify_admin", { query: "{ shop { name } }" }, storeAssistantToolEvents).title).toBe("Reading the store");
    expect(describeTool("read_file", { path: "a/b.txt" }).title).toBe("Reading");
  });

  it("asking for store access reads the same for every agent, and its note for the agent stays out of the chat", () => {
    for (const hooks of [storeAssistantToolEvents, googleAdsToolEvents]) {
      expect(describeTool("request_store_access", { reason: "x" }, hooks)).toEqual({ kind: "other", title: "Checking the store's access" });
      expect(summarizeResult("request_store_access", ok("A card is on the user's screen. Tell the user in one line."), hooks)).toEqual({ ok: true });
    }
  });
});

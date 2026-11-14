// The Google Ads agent's own tools. Reads go straight through; a change is
// previewed (the platform runs every safety check and Google's validate_only),
// shown on an approval card that ALWAYS waits for a person, and applied only
// after approval. The platform checks that approval again before applying.

import type { SDKCustomTool } from "@cursor/sdk";
import { approvalBinding } from "../../../../src/lib/google-ads/approval-binding";
import type { ApprovalPreview } from "../../../../src/lib/store-agent/protocol";
import { INLINE_RESULT_BYTES, byteLength } from "../sdk-output";
import { failure, setChatStatus, stamp, text, writeChatFile, type ToolContext } from "../tool-helpers";
import { AdsPlatformError, callAdsPlatform, type AdsAction, type AdsPlatform } from "./platform";

type PreviewItem = ApprovalPreview["items"][number];
type PreviewResult = { ok: true; items: PreviewItem[]; warnings: string[]; operations: number } | { ok: false; error: string };
type ApplyResult = { status: "applied"; id: string; inverse: unknown[]; warnings: string[] } | { status: "failed"; id: string; error: string };

/** Items on the card: as many as one change can hold, so nothing is approved unseen. */
const CARD_ITEMS = 200;

/** Big reads go to a file in the chat folder instead of the model's context. */
async function compact(ctx: ToolContext, payload: unknown, name: string): Promise<string> {
  const json = JSON.stringify(payload, null, 1);
  if (byteLength(json) <= INLINE_RESULT_BYTES) return json;
  const relative = `google-ads/${name}-${stamp()}.json`;
  await writeChatFile(ctx, relative, JSON.stringify(payload, null, 2));
  return `The result is large (${json.length.toLocaleString("en")} characters) and was saved to ${relative}. Read it with read_file or analyse it with run_script. First part:\n${json.slice(0, 4000)}`;
}

/** Where a change goes: its platform actions and the label on its card. */
const TARGETS = {
  ads: { preview: "preview", apply: "apply", label: "Google Ads" },
  merchant: { preview: "merchant_preview", apply: "merchant_apply", label: "Merchant Center" },
} as const;

export function createGoogleAdsTools(ctx: ToolContext, platform: AdsPlatform): Record<string, SDKCustomTool> {
  const call = <T>(action: AdsAction, body: Record<string, unknown>) =>
    callAdsPlatform<T>(platform, { action, userId: ctx.run.userId, body: { ...body, workspaceId: ctx.run.workspaceId, chatId: ctx.run.chatId }, signal: ctx.run.signal });

  /** Check → card (always waits for a person) → apply; the platform re-checks the approval. */
  const propose = async (target: keyof typeof TARGETS, args: Record<string, unknown>) => {
    const { preview: previewAction, apply: applyAction, label } = TARGETS[target];
    const title = typeof args.title === "string" ? args.title.trim().slice(0, 200) : "";
    const reason = typeof args.reason === "string" ? args.reason.trim().slice(0, 1500) : "";
    const ops = Array.isArray(args.edits) ? (args.edits as Record<string, unknown>[]) : [];
    if (!title || !reason || !ops.length) return failure("Give the change a title, a reason and at least one edit.");
    if (ctx.planMode) {
      return failure(`Plan mode is on, so nothing in ${label} can change. Put this step in the plan; the user switches to Agent mode to carry it out.`);
    }

    // 1. Same checks as applying (and Google's validate_only for Google Ads). Refused changes never reach the card.
    let preview: PreviewResult;
    try {
      preview = await call<PreviewResult>(previewAction, { ops });
    } catch (error) {
      return failure((error as Error).message);
    }
    if (!preview.ok) return failure(`This change can't be made: ${preview.error}`);

    // 2. The card. These changes always wait for a person, whatever auto-run is set to.
    const outcome = await waitForAdsApproval(ctx, { title, reason, items: preview.items, warnings: preview.warnings, label, binding: approvalBinding(target, ops) });
    if (!outcome.ok) return failure(outcome.message);

    // 3. Apply. The platform checks the approval again and reads the current state from Google.
    let result: ApplyResult;
    try {
      result = await call<ApplyResult>(applyAction, { approvalId: outcome.approvalId, title, ops });
    } catch (error) {
      const message = error instanceof AdsPlatformError ? error.message : String(error);
      return failure(`The change was approved but not confirmed by ${label}: ${message} Check the account before trying again; it is never applied twice.`);
    } finally {
      ctx.checkpoint();
    }
    if (result.status === "failed") return failure(`${label} did not apply the change: ${result.error}`);
    // Applied: the card can now offer Undo (the platform kept the inverse).
    ctx.run.emit({ type: "approval_resolved", approvalId: outcome.approvalId, status: "approved", auto: false, undoable: result.inverse.length > 0 });
    return text(
      JSON.stringify({
        applied: true,
        edits: ops.length,
        warnings: result.warnings,
        undo: result.inverse.length ? "The user can undo this change from its card." : "This change cannot be undone automatically.",
      })
    );
  };

  return {
    ads_overview: {
      description:
        "The connected Google Ads account at a glance (last 30 days): account, every campaign with budget, bidding, serving issues and metrics, " +
        "the ad groups, keywords and search terms that cost the most, and the negatives. Start every task with this.",
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        try {
          const res = await call<{ overview: unknown; fetchedAt: string }>("overview", {});
          return text(await compact(ctx, { ...res.overview as object, dataAsOf: res.fetchedAt }, "overview"));
        } catch (error) {
          return failure((error as Error).message);
        }
      },
    },

    ads_query: {
      description:
        "Run one read-only GAQL query (SELECT … FROM … WHERE … ORDER BY … LIMIT …) on the connected Google Ads account. At most 500 rows. " +
        "Money fields ending in _micros are millionths of the account currency.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "One GAQL SELECT statement." },
          purpose: { type: "string", description: "One short sentence, in the user's language, saying what you are looking for." },
        },
        required: ["query"],
      },
      execute: async (args) => {
        const query = typeof args.query === "string" ? args.query : "";
        try {
          const res = await call<{ ok: boolean; error?: string; query?: string; rows?: unknown[]; rowCount?: number }>("query", { query });
          if (!res.ok) return failure(`Google Ads refused the query: ${res.error}`);
          return text(await compact(ctx, { query: res.query, rowCount: res.rowCount, rows: res.rows }, "query"));
        } catch (error) {
          return failure((error as Error).message);
        }
      },
    },

    ads_report: {
      description:
        "An expert report on the connected Google Ads account, computed by the platform: " +
        "conversions (tracking health: double counting, values, primary actions, bidding volume), " +
        "shopping_pmax (asset groups, asset coverage, listing groups, signals, PMax search categories), " +
        "products (every advertised product tiered star / on_target / below_target / loser / too_early, plus products that barely serve), " +
        "recommendations (Google's open recommendations, each with a verdict from the account's own numbers, and auto-apply), " +
        "reach (devices, countries, location targeting, audiences, ad assets, recent account changes). Each returns findings ranked by severity.",
      inputSchema: {
        type: "object",
        properties: {
          report: { type: "string", enum: ["conversions", "shopping_pmax", "products", "recommendations", "reach"] },
          days: { type: "number", enum: [7, 14, 30, 90], description: "Period, default 30. Recommendations always use 30." },
          targetRoas: { type: "number", description: "products only: the store's real target ROAS (e.g. 4 = 400%) when the user gives one; otherwise the account average is used." },
          refresh: { type: "boolean", description: "Read fresh from Google instead of the last 15 minutes' copy. Only after a change." },
        },
        required: ["report"],
      },
      execute: async (args) => {
        try {
          const res = await call<{ ok: boolean; error?: string; report?: unknown }>("report", {
            report: args.report,
            days: args.days,
            targetRoas: args.targetRoas,
            refresh: args.refresh === true,
          });
          if (!res.ok) return failure(res.error ?? "The report could not be made.");
          return text(await compact(ctx, res.report, `report-${String(args.report)}`));
        } catch (error) {
          return failure((error as Error).message);
        }
      },
    },

    ads_change: {
      description:
        "Propose one change to the Google Ads account: one or more related edits applied together (all or nothing). " +
        "The user sees every edit before → after, already checked by Google, and must approve it; nothing changes without that. " +
        "Edits (formats in your rules): status.set, budget.update, campaign.update, adGroup.update, keyword.create, keyword.update, negative.create, negative.remove; " +
        "creating: campaign.new (Search, Shopping, Performance Max, Display, Demand Gen; created paused), adGroup.new, ad.new, assetGroup.new, assetGroupAsset.add/remove, searchTheme.add, " +
        "asset.new (sitelinks, callouts, call, snippets), audience.add, location.add, language.add, schedule.add, targeting.remove, device.set, placement.exclude, conversion.new, negativeList.new, label.new; " +
        "experiments alone: experiment.new, experiment.end.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short title in the user's language, e.g. \"Pause 3 keywords that spent with no conversions\"." },
          reason: { type: "string", description: "Why, with the numbers behind it, in the user's language. Shown on the card." },
          edits: { type: "array", minItems: 1, maxItems: 50, items: { type: "object", additionalProperties: true }, description: "The edits, in the formats from your rules." },
        },
        required: ["title", "reason", "edits"],
      },
      execute: (args) => propose("ads", args),
    },

    merchant_products: {
      description:
        "The connected Merchant Center account's products: each product's id, title, description, brand, GTIN, image, price, availability, " +
        "status (approved, limited, disapproved, pending) and every issue Google reports, plus the account's own issues and issue counts. " +
        "Start here for any product or feed question.",
      inputSchema: {
        type: "object",
        properties: { refresh: { type: "boolean", description: "Read fresh from Google instead of the last few minutes' copy. Only after a fix." } },
      },
      execute: async (args) => {
        try {
          const res = await call<{ overview: unknown; fetchedAt: string }>("merchant", { refresh: args.refresh === true });
          return text(await compact(ctx, { ...(res.overview as object), dataAsOf: res.fetchedAt }, "merchant-products"));
        } catch (error) {
          return failure((error as Error).message);
        }
      },
    },

    merchant_change: {
      description:
        "Propose fixes to Merchant Center products: title, description, brand, GTIN, MPN, image link or Google product category. " +
        "The user sees every product before → after on a card and must approve it; nothing changes without that. " +
        'Edits: { "kind": "product.update", "productId": "<id from merchant_products>", "set": { ...fields } }, one per product.',
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: 'Short title in the user\'s language, e.g. "Clearer titles for 3 products".' },
          reason: { type: "string", description: "Why: which issue or weakness each fix solves, in the user's language. Shown on the card." },
          edits: { type: "array", minItems: 1, maxItems: 50, items: { type: "object", additionalProperties: true }, description: "One product.update per product." },
        },
        required: ["title", "reason", "edits"],
      },
      execute: (args) => propose("merchant", args),
    },

    business_profile: {
      description:
        "The business profile shared by every Autommerce agent in this workspace: every field with its value, where it came from and whether the owner " +
        "confirmed it or it is only a suggestion, and the required fields still missing. A short version is already in your rules; " +
        "read this for the full texts (brand voice, identity, shipping and returns) or after an edit.",
      inputSchema: { type: "object", properties: {} },
      execute: async () => {
        try {
          const res = await call<{ ok: boolean; profile: unknown }>("profile", {});
          return text(JSON.stringify(res.profile, null, 1));
        } catch (error) {
          return failure((error as Error).message);
        }
      },
    },

    update_business_profile: {
      description:
        "Save fields of the business profile. statedByUser: true ONLY when the user said these values in this chat (\"our margin is 40%\", " +
        "\"add Qatar\"): they are saved as confirmed, at once; the user can change them on the Business profile page. " +
        "statedByUser: false for what you found yourself (website, account data): saved only as suggestions the owner confirms, only into empty or " +
        "suggested fields, and never for margin, target ROAS, monthly budget cap or goal (only the owner sets those). " +
        "The profile is a fixed document with these sections and fields. " +
        "Key facts: businessName, website, languages. Business overview: overview (text: what it is, story, model). Brand and search names: brandTerms. " +
        "Markets and customers: markets, audience (text). Goals and economics: goal (profit | growth | new_customers), margin (e.g. 40 for 40%), targetRoas (e.g. 4 for 400%), " +
        "monthlyBudgetCap, averageOrderValue (amounts in the account currency). Products and catalog: categories, focusProducts. " +
        "Positioning: usp (text), keySellingPoints, competitiveAdvantages, proof (text). Offers, shipping and returns: shippingReturns (text). " +
        "Competitors: competitors ([{ name, url }]). Seasonality: peakSeasons. Guardrails: neverAdvertise, restrictions (text). " +
        "Brand guidelines: brandIdentity, brandVoice, visualDirection, logoUrl, palette ([{ name, hex, role }]). " +
        "Marketing history and learnings: marketingHistory (text). Sources and uploaded files: sources (text: the files and pages this was written from). Open questions: openQuestions (list). " +
        "Texts may use short Markdown (bullets, bold) and are shown as written in a document. " +
        "Lists are arrays and REPLACE the whole list: to add one item, send the current items plus the new one. value null clears a field.",
      inputSchema: {
        type: "object",
        properties: {
          edits: {
            type: "array",
            minItems: 1,
            maxItems: 40,
            items: { type: "object", properties: { field: { type: "string" }, value: {} }, required: ["field", "value"] },
          },
          statedByUser: { type: "boolean" },
          source: { type: "string", enum: ["website", "google_ads", "merchant", "store"], description: "Only for suggestions: where you found the values." },
        },
        required: ["edits", "statedByUser"],
      },
      execute: async (args) => {
        try {
          const res = await call<{ ok: boolean; error?: string } & Record<string, unknown>>("profile_update", {
            edits: args.edits,
            statedByUser: args.statedByUser === true,
            source: args.source,
          });
          if (!res.ok) return failure(`Not saved: ${res.error}`);
          return text(JSON.stringify({ ...res, ok: undefined }));
        } catch (error) {
          return failure((error as Error).message);
        }
      },
    },

    onboarding_stage: {
      description:
        "First-run onboarding only (your rules say when it applies). The board on the right is locked while the user is being onboarded. " +
        "stage \"filling\": the interview is over (the user gave the context or asked to unlock), you are now doing the final fill: the board stays locked. " +
        "stage \"done\": the Business profile and the Competitor ads are filled in: the board unlocks. The platform refuses \"done\" until the profile overview, " +
        "the competitors and at least one competitor lookup exist (if the competitor data source is unavailable, pass competitorsUnavailable: true).",
      inputSchema: {
        type: "object",
        properties: {
          stage: { type: "string", enum: ["filling", "done"] },
          competitorsUnavailable: { type: "boolean", description: "Only with \"done\": every competitor lookup failed because the data source is unavailable." },
        },
        required: ["stage"],
      },
      execute: async (args) => {
        try {
          const res = await call<{ ok: boolean; error?: string; stage?: string; note?: string }>("onboarding", { stage: args.stage, competitorsUnavailable: args.competitorsUnavailable === true });
          if (!res.ok) return failure(res.error ?? "The stage was not changed.");
          return text(JSON.stringify({ stage: res.stage, note: res.note }));
        } catch (error) {
          return failure((error as Error).message);
        }
      },
    },

    keyword_research: {
      description:
        "Google Keyword Planner on the connected account (Google's own numbers, not estimates from a third party). " +
        "mode \"ideas\": new keyword ideas from ONE seed: keywords (up to 20), url (a product or category page), site (a whole domain: the store's or a competitor's), " +
        "or keywords + url together. mode \"metrics\": search volumes for keywords you already have (up to 1000). " +
        "Each keyword: average monthly searches (last 12 months), competition, the top-of-page bid range in the account currency, " +
        "the last 3 months against the average and the peak month when the year is seasonal, and whether the account already has it or a negative blocks it. " +
        "Countries default to the business profile's markets and the language to its language; pass them to override.",
      inputSchema: {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["ideas", "metrics"] },
          keywords: { type: "array", items: { type: "string" }, description: "ideas: up to 20 seed keywords; metrics: the keywords to measure (up to 1000)." },
          url: { type: "string", description: "ideas: a page to read for ideas." },
          site: { type: "string", description: "ideas: a whole domain, e.g. competitor.com. Not combined with keywords or url." },
          countries: { type: "array", items: { type: "string" }, description: "Country names or two-letter codes, up to 10. Default: the profile's markets." },
          language: { type: "string", description: "One language name or code (e.g. Arabic, en), or \"all\". Default: the profile's language." },
          limit: { type: "number", description: "ideas: how many ideas to return, best first (10–1000, default 300)." },
        },
        required: ["mode"],
      },
      execute: async (args) => {
        try {
          const res = await call<{ ok: boolean; error?: string; research?: unknown }>("keywords", args);
          if (!res.ok) return failure(res.error ?? "Keyword Planner did not answer.");
          return text(await compact(ctx, res.research, "keywords"));
        } catch (error) {
          return failure((error as Error).message);
        }
      },
    },

    keyword_forecast: {
      description:
        "Google Keyword Planner forecast: what a set of keywords would bring with a daily budget (clicks, cost, average cost per click) over the next days. " +
        "Nothing is created in the account. Use it to size a new campaign or a budget plan; say it is Google's forecast, not a promise.",
      inputSchema: {
        type: "object",
        properties: {
          keywords: {
            type: "array",
            minItems: 1,
            maxItems: 200,
            items: { type: "object", properties: { text: { type: "string" }, matchType: { type: "string", enum: ["EXACT", "PHRASE", "BROAD"] } }, required: ["text"] },
          },
          dailyBudget: { type: "number", description: "Daily budget in the account currency." },
          maxCpc: { type: "number", description: "Optional maximum cost per click (manual bidding); without it the forecast uses Maximize clicks." },
          days: { type: "number", description: "Forecast length in days (7–365, default 30)." },
          countries: { type: "array", items: { type: "string" } },
          language: { type: "string" },
        },
        required: ["keywords", "dailyBudget"],
      },
      execute: async (args) => {
        try {
          const res = await call<{ ok: boolean; error?: string; forecast?: unknown }>("keyword_forecast", args);
          if (!res.ok) return failure(res.error ?? "Keyword Planner did not answer.");
          return text(JSON.stringify(res.forecast, null, 1));
        } catch (error) {
          return failure((error as Error).message);
        }
      },
    },

    competitor_ads: {
      description:
        "A competitor's paid search keywords in one country: the searches its Google ads appeared on this month, each with monthly searches, cost per click (USD), " +
        "ad position, the ad text and landing page, and whether the user's account already has the keyword. Source: SE Ranking's estimates from Google's results, " +
        "not the competitor's account. It costs the workspace credits at cost (about 0.2 credits per 1,000 keywords) unless this month's copy already has the site: " +
        "use quoteOnly first when the user did not ask for the lookup themselves. Free product listings are removed. A site that only runs Performance Max, " +
        "Shopping or video ads shows few or no keywords here. It returns paid search keywords ONLY: never organic keywords, backlinks, traffic or anything else, " +
        "whatever parameters are sent, so do not run it for those requests.",
      inputSchema: {
        type: "object",
        properties: {
          domain: { type: "string", description: "The competitor's site, e.g. competitor.com (subdomains included)." },
          country: {
            type: "string",
            description: "One country name or two-letter code, e.g. Lebanon or LB: the one the user named, else the profile's main market. When neither exists, ask; never guess one.",
          },
          pages: { type: "number", description: "1,000 keywords per page (1–5, default 1). Ask for more only when the first page says more are available and the user wants them." },
          quoteOnly: { type: "boolean", description: "Only say what the lookup would cost now; nothing is charged." },
        },
        required: ["domain", "country"],
      },
      execute: async (args) => {
        try {
          const res = await call<{ ok: boolean; error?: string; analysis?: unknown; quote?: unknown }>("competitor_ads", args);
          if (!res.ok) return failure(res.error ?? "Competitor data did not answer.");
          return text(res.quote ? JSON.stringify(res.quote) : await compact(ctx, res.analysis, "competitor-ads"));
        } catch (error) {
          return failure((error as Error).message);
        }
      },
    },

    save_plan: {
      description:
        "Save a plan to the Documents page, where the owner reviews it and applies its steps (one by one or all together), with undo. " +
        "Every step is ONE change in the same edit formats as ads_change (target \"ads\") or merchant_change (target \"merchant\"); Google checks each " +
        "step when the plan is saved, and a plan with a refused step is not saved (fix the step and save again). Steps run in the order given. " +
        "Works in Plan mode and Agent mode; nothing changes until the owner applies a step. To revise a plan, send the whole plan again with its documentId.",
      inputSchema: {
        type: "object",
        properties: {
          documentId: { type: "string", description: "Only to revise a plan you saved earlier (its id). Leave out for a new plan." },
          title: { type: "string", description: "Short title in the user's language." },
          summary: { type: "string", description: "One or two sentences: what the plan does and the expected result." },
          period: { type: "string", description: "The data the plan rests on, e.g. \"Last 30 days (Oct 5 – Nov 3, 2026)\"." },
          overview: { type: "string", description: "Markdown: the goal, the situation in numbers, and the approach." },
          steps: {
            type: "array",
            minItems: 1,
            maxItems: 20,
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "What this step does, e.g. \"Pause 4 keywords that spent with no sales\"." },
                why: { type: "string", description: "Why, with the numbers behind it." },
                target: { type: "string", enum: ["ads", "merchant"] },
                edits: { type: "array", minItems: 1, maxItems: 50, items: { type: "object", additionalProperties: true } },
                risk: { type: "string", enum: ["low", "medium", "high"] },
                expected: { type: "string", description: "The expected effect, e.g. \"≈ $310 a month saved\"." },
              },
              required: ["title", "why", "target", "edits", "risk"],
            },
          },
          notes: { type: "string", description: "Markdown: expected overall effect, risks and how they are handled, what to watch after applying." },
        },
        required: ["title", "summary", "overview", "steps"],
      },
      execute: async (args) => {
        try {
          const res = await call<{ ok: boolean; error?: string; steps?: unknown; document?: { id: string; kind: "plan"; title: string; version: number; steps?: number } }>("doc_plan", args);
          if (!res.ok || !res.document) return failure(`${res.error ?? "The plan was not saved."}${res.steps ? `\n${JSON.stringify(res.steps)}` : ""}`);
          const d = res.document;
          ctx.run.emit({ type: "doc", docId: d.id, kind: "plan", title: d.title, version: d.version, steps: d.steps });
          return text(JSON.stringify({ saved: true, documentId: d.id, version: d.version, steps: d.steps, shown: "The plan is open on the Documents page (Documents → Plans)." }));
        } catch (error) {
          return failure((error as Error).message);
        }
      },
    },

    save_report: {
      description:
        "Save a report (performance report, audit, analysis) to the Documents page, where it opens beside the chat. " +
        "Structure: verdict (up to 3 short lines: health, biggest problem, first fix), kpis (cards), findings ranked by money at stake " +
        "(each with evidence and the fix; the owner can turn any finding into a plan), and sections of blocks. " +
        "Blocks: { kind: \"text\", md } · { kind: \"callout\", tone: info|good|warn|bad, title, text } · { kind: \"table\", columns, rows, align? } · " +
        "{ kind: \"chart\", title, variant: bar|line|donut, format: money|number|percent|ratio, data: [{ label, value }] } (percent as 0–1) · " +
        "{ kind: \"score\", score: 0–100, label, parts: [{ label, score }] } · " +
        "{ kind: \"html\", title, html } for anything the others can't show (a heatmap, a custom layout, an interactive chart): a whole page with its own " +
        "CSS and JavaScript, shown in a sandboxed frame. It can't load anything from the internet except Chart.js from " +
        "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js: put the data inline, draw with Chart.js, SVG or CSS, no external images or fonts, " +
        "no forms, frames or links. Keep each html block under 200,000 characters and keep data tables as table blocks (they export to Excel). " +
        "A block that can't be shown is refused with the reason: fix it and save again. To update a report, send it whole again with its documentId.",
      inputSchema: {
        type: "object",
        properties: {
          documentId: { type: "string", description: "Only to update a report you saved earlier." },
          title: { type: "string" },
          summary: { type: "string", description: "One or two sentences for the Documents list." },
          period: { type: "string", description: "e.g. \"Last 30 days (Oct 5 – Nov 3, 2026)\"." },
          verdict: { type: "array", maxItems: 3, items: { type: "string" } },
          kpis: {
            type: "array",
            maxItems: 8,
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                value: { type: "string", description: "Formatted, with currency, e.g. \"$4,210\"." },
                delta: { type: "number", description: "Change vs the previous period as a fraction (0.12 = +12%)." },
                higherIsBetter: { type: "boolean" },
                hint: { type: "string" },
              },
              required: ["label", "value"],
            },
          },
          findings: {
            type: "array",
            maxItems: 30,
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                severity: { type: "string", enum: ["high", "medium", "low"] },
                impact: { type: "string", description: "Money or results at stake." },
                evidence: { type: "string" },
                fix: { type: "string" },
              },
              required: ["title", "severity", "evidence", "fix"],
            },
          },
          sections: {
            type: "array",
            maxItems: 20,
            items: { type: "object", properties: { title: { type: "string" }, blocks: { type: "array", items: { type: "object", additionalProperties: true } } }, required: ["title", "blocks"] },
          },
        },
        required: ["title", "summary", "verdict"],
      },
      execute: async (args) => {
        try {
          const res = await call<{ ok: boolean; error?: string; document?: { id: string; title: string; version: number } }>("doc_report", args);
          if (!res.ok || !res.document) return failure(res.error ?? "The report was not saved.");
          const d = res.document;
          ctx.run.emit({ type: "doc", docId: d.id, kind: "report", title: d.title, version: d.version });
          return text(JSON.stringify({ saved: true, documentId: d.id, version: d.version, shown: "The report is open on the Documents page (Documents → Reports)." }));
        } catch (error) {
          return failure((error as Error).message);
        }
      },
    },

    read_document: {
      description: "Read a plan or report from the Documents page by its id: its content and, for a plan, each step's state (todo, applied, failed with Google's reason, undone).",
      inputSchema: { type: "object", properties: { documentId: { type: "string" } }, required: ["documentId"] },
      execute: async (args) => {
        try {
          const res = await call<{ ok: boolean; error?: string; document?: unknown }>("doc_read", { documentId: args.documentId });
          if (!res.ok) return failure(res.error ?? "Not found.");
          return text(await compact(ctx, res.document, "document"));
        } catch (error) {
          return failure((error as Error).message);
        }
      },
    },
  };
}

type AdsApproval = { ok: true; approvalId: string } | { ok: false; message: string };

/**
 * Record the change, show its card and wait. Unlike store changes there is no
 * auto-run and no backup file: the platform keeps the inverse when it applies.
 */
async function waitForAdsApproval(
  ctx: ToolContext,
  change: { title: string; reason: string; items: PreviewItem[]; warnings: string[]; label: string; binding: string }
): Promise<AdsApproval> {
  const preview: ApprovalPreview = { items: change.items.slice(0, CARD_ITEMS), more: Math.max(0, change.items.length - CARD_ITEMS) };
  const summary = [change.title, change.reason, ...change.warnings.map((w) => `⚠ ${w}`)].join("\n\n").slice(0, 2000);
  const { data, error } = await ctx.db
    .from("store_agent_approvals")
    .insert({
      chat_id: ctx.run.chatId,
      workspace_id: ctx.run.workspaceId,
      run_id: ctx.run.id,
      kind: "write",
      summary,
      operations: [change.label],
      // The platform recomputes the binding before applying.
      preview: { ...preview, binding: change.binding },
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: `Could not record the change for approval (${error?.message ?? "no row"}). Do not make this change.` };
  const approvalId = data.id as string;

  ctx.run.emit({ type: "approval", approvalId, risk: "write", summary, operations: [change.label], preview, records: change.items.length });
  await setChatStatus(ctx, "awaiting_approval");
  const decision = await ctx.run.waitForApproval(approvalId);
  await setChatStatus(ctx, "running");
  const wroteInstead = decision === "superseded" ? (ctx.run.takeChatReply(approvalId) ?? "") : undefined;
  const status = decision === "superseded" ? "rejected" : decision;
  await ctx.db
    .from("store_agent_approvals")
    .update({ status, decided_by: status === "expired" ? null : ctx.run.userId, decided_at: new Date().toISOString(), undoable: false })
    .eq("id", approvalId);
  ctx.run.emit({ type: "approval_resolved", approvalId, status, auto: false, undoable: false });

  if (status === "approved") return { ok: true, approvalId };
  if (ctx.run.cancelled) return { ok: false, message: "The run was stopped." };
  if (wroteInstead !== undefined) {
    return {
      ok: false,
      message: `The user did not decide on this change; they wrote in the chat instead:\n"${wroteInstead}"\nThe change was not made. Follow their message; if they still want it, propose it again.`,
    };
  }
  if (status === "rejected") (ctx.consent ??= { declinedAt: null, answeredAt: null }).declinedAt = Date.now();
  return {
    ok: false,
    message:
      status === "expired"
        ? "Nobody approved this change in time, so it was not made. Tell the user it is waiting for them and stop."
        : "The user declined this change, so it was not made. Do not propose it again; ask what they would like instead.",
  };
}

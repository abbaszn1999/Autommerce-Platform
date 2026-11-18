// Keyword research at scale: many seeds (keyword lists, pages, competitor sites)
// and long lists to measure, run in rounds that fit Google's limits, merged into
// one file in the chat folder. Resumable: call again with the same name and it
// carries on with what is left. The model only ever sees progress and the top
// of the list; it analyses the file with run_script.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { SDKCustomTool } from "@cursor/sdk";
import { failure, text, writeChatFile, type ToolContext } from "../tool-helpers";
import { callAdsPlatform, type AdsPlatform } from "./platform";

const MAX_UNITS = 400;
const IDEA_KEYWORDS = 20;
const METRIC_KEYWORDS = 1000;
const DEFAULT_SECONDS = 150;
const MAX_SECONDS = 240;
const PAUSE_MS = 300;
const TOP_SHOWN = 40;

export type BatchSeed = { keywords?: string[]; url?: string; site?: string };

export type BatchUnit = {
  id: string;
  kind: "ideas" | "metrics";
  seed: { keywords?: string[]; url?: string; site?: string };
  status: "pending" | "done" | "failed";
  found?: number;
  error?: string;
};

export type BatchState = {
  name: string;
  countries?: string[];
  language?: string;
  limitPerSeed: number;
  units: BatchUnit[];
  updatedAt: string;
};

export type BatchRow = {
  keyword: string;
  searches: number | null;
  competition: string | null;
  bid: [number | null, number | null] | null;
  last3MonthsVsAverage?: string;
  peak?: string;
  inAccount?: boolean;
  blockedByNegative?: boolean;
  /** How many seeds returned it: a keyword many seeds agree on is a core term. */
  seen: number;
};

const clean = (value: unknown, max: number): string[] =>
  [...new Set((Array.isArray(value) ? value : []).map((k) => String(k ?? "").trim().toLowerCase().replace(/\s+/g, " ")).filter((k) => k && k.length <= 80))].slice(0, max);

const unitId = (kind: string, seed: unknown) => `${kind}:${JSON.stringify(seed)}`;

/** The seeds as work units Keyword Planner accepts: ≤20 keywords per ideas call, a page or a site each, ≤1000 keywords per metrics call. */
export function buildUnits(seeds: unknown, measure: unknown): BatchUnit[] {
  const units: BatchUnit[] = [];
  for (const raw of Array.isArray(seeds) ? seeds : []) {
    const seed = (raw ?? {}) as BatchSeed;
    const keywords = clean(seed.keywords, 1000);
    const url = typeof seed.url === "string" ? seed.url.trim() : "";
    const site = typeof seed.site === "string" ? seed.site.trim() : "";
    if (site) {
      const s = { site };
      units.push({ id: unitId("ideas", s), kind: "ideas", seed: s, status: "pending" });
    } else if (url) {
      for (let i = 0; i < Math.max(1, Math.ceil(keywords.length / IDEA_KEYWORDS)); i++) {
        const s = { url, ...(keywords.length ? { keywords: keywords.slice(i * IDEA_KEYWORDS, (i + 1) * IDEA_KEYWORDS) } : {}) };
        units.push({ id: unitId("ideas", s), kind: "ideas", seed: s, status: "pending" });
      }
    } else {
      for (let i = 0; i < keywords.length; i += IDEA_KEYWORDS) {
        const s = { keywords: keywords.slice(i, i + IDEA_KEYWORDS) };
        units.push({ id: unitId("ideas", s), kind: "ideas", seed: s, status: "pending" });
      }
    }
  }
  const list = clean(measure, 20_000);
  for (let i = 0; i < list.length; i += METRIC_KEYWORDS) {
    const s = { keywords: list.slice(i, i + METRIC_KEYWORDS) };
    units.push({ id: unitId("metrics", s), kind: "metrics", seed: s, status: "pending" });
  }
  return units;
}

/** Add rows into the merged list: the same keyword from several seeds is kept once, with how many seeds found it. */
export function mergeRows(into: Map<string, BatchRow>, rows: Omit<BatchRow, "seen">[]): number {
  let added = 0;
  for (const row of rows) {
    const key = row.keyword.toLowerCase();
    const have = into.get(key);
    if (!have) {
      into.set(key, { ...row, seen: 1 });
      added += 1;
    } else {
      have.seen += 1;
      // Metrics measured for the same keyword are the same; fill what an earlier row lacked.
      if (have.searches === null && row.searches !== null) Object.assign(have, row, { seen: have.seen });
      if (row.inAccount) have.inAccount = true;
      if (row.blockedByNegative) have.blockedByNegative = true;
    }
  }
  return added;
}

const stateFile = (name: string) => `google-ads/keyword-batch/${name}.state.json`;
const rowsFile = (name: string) => `google-ads/keyword-batch/${name}.jsonl`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isLimit = (message: string) => /limiting|rate|quota|try again/i.test(message);

async function readIfExists(ctx: ToolContext, relative: string): Promise<string | null> {
  return fs.readFile(path.join(ctx.files.cwd, ...relative.split("/")), "utf8").catch(() => null);
}

export function createKeywordBatchTools(ctx: ToolContext, platform: AdsPlatform): Record<string, SDKCustomTool> {
  return {
    keyword_batch: {
      description:
        "Keyword research at scale in one go: many seeds (groups of up to 20 keywords, product or category pages, your own site, competitor domains) and long lists of keywords to measure (up to thousands), " +
        "run in rounds inside Google's limits and merged, de-duplicated, into one file in this chat's folder (google-ads/keyword-batch/<name>.jsonl, one keyword per line with searches, competition, bid range, trend, peak month, inAccount, blockedByNegative and how many seeds returned it). " +
        "It is resumable: when a call ends with seeds left (time or Google's limits), call it again with the same name and no new seeds to continue. " +
        "It returns only progress and the best keywords; analyse the file with run_script (group by product line, intent, volume bands) and put the findings in the plan. " +
        "Use keyword_research for a quick look at one seed. Countries and language default to the business profile's.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "A short name for this batch, letters, digits and dashes (e.g. perfumes-ae). The same name continues the same batch." },
          seeds: {
            type: "array",
            description: "Ideas seeds. Each: { keywords: [...] } (any number, split into groups of 20), { url: 'https://...' } (a page, optionally with keywords), or { site: 'competitor.com' }.",
            items: { type: "object", properties: { keywords: { type: "array", items: { type: "string" } }, url: { type: "string" }, site: { type: "string" } } },
          },
          measure: { type: "array", items: { type: "string" }, description: "A long list of keywords you already have: their volumes and bids are measured (1000 per call to Google)." },
          countries: { type: "array", items: { type: "string" }, description: "Up to 10 country names or codes. Default: the profile's markets." },
          language: { type: "string", description: "One language, or \"all\". Default: the profile's." },
          limitPerSeed: { type: "number", description: "Ideas per seed, best first (10 to 1000, default 300)." },
          retryFailed: { type: "boolean", description: "Run the seeds that failed earlier again." },
          maxSeconds: { type: "number", description: `How long this call may work (default ${DEFAULT_SECONDS}, at most ${MAX_SECONDS}).` },
        },
        required: ["name"],
      },
      execute: async (args) => {
        const name = String(args.name ?? "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
        if (!name) return failure("Give the batch a short name (letters, digits and dashes).");
        try {
          // 1. State: what exists from earlier calls, plus any new seeds.
          const saved = await readIfExists(ctx, stateFile(name));
          const state: BatchState = saved
            ? (JSON.parse(saved) as BatchState)
            : { name, countries: undefined, language: undefined, limitPerSeed: 300, units: [], updatedAt: "" };
          if (Array.isArray(args.countries) && args.countries.length) state.countries = args.countries.map(String).slice(0, 10);
          if (typeof args.language === "string" && args.language.trim()) state.language = args.language.trim();
          if (Number.isFinite(Number(args.limitPerSeed)) && Number(args.limitPerSeed) > 0) state.limitPerSeed = Math.min(1000, Math.max(10, Math.round(Number(args.limitPerSeed))));
          const known = new Set(state.units.map((u) => u.id));
          for (const unit of buildUnits(args.seeds, args.measure)) if (!known.has(unit.id)) state.units.push(unit);
          if (state.units.length > MAX_UNITS) return failure(`That is more than ${MAX_UNITS} calls to Google in one batch. Split it into several batches with different names.`);
          if (args.retryFailed === true) for (const unit of state.units) if (unit.status === "failed") unit.status = "pending";
          if (!state.units.length) return failure("Nothing to run: give seeds, or a list to measure.");

          // 2. Rows so far.
          const merged = new Map<string, BatchRow>();
          for (const line of (await readIfExists(ctx, rowsFile(name)))?.split("\n") ?? []) {
            if (!line.trim()) continue;
            try {
              const row = JSON.parse(line) as BatchRow;
              merged.set(row.keyword.toLowerCase(), row);
            } catch {
              /* a half-written line is dropped */
            }
          }

          // 3. Work through what is pending until the time is up or Google says stop.
          const seconds = Math.min(MAX_SECONDS, Math.max(20, Math.round(Number(args.maxSeconds)) || DEFAULT_SECONDS));
          const deadline = Date.now() + seconds * 1000;
          let stoppedBy: "time" | "limit" | null = null;
          for (const unit of state.units) {
            if (unit.status !== "pending") continue;
            if (ctx.run.cancelled) break;
            if (Date.now() > deadline) {
              stoppedBy = "time";
              break;
            }
            const body: Record<string, unknown> = {
              workspaceId: ctx.run.workspaceId,
              chatId: ctx.run.chatId,
              mode: unit.kind,
              ...unit.seed,
              ...(state.countries ? { countries: state.countries } : {}),
              ...(state.language ? { language: state.language } : {}),
              limit: state.limitPerSeed,
            };
            try {
              const res = await callAdsPlatform<{ ok: boolean; error?: string; research?: { keywords?: Omit<BatchRow, "seen">[] } }>(platform, {
                action: "keywords",
                userId: ctx.run.userId,
                body,
                signal: ctx.run.signal,
              });
              if (!res.ok) {
                const message = res.error ?? "Keyword Planner did not answer.";
                if (isLimit(message)) {
                  stoppedBy = "limit";
                  break;
                }
                unit.status = "failed";
                unit.error = message.slice(0, 300);
              } else {
                const rows = res.research?.keywords ?? [];
                mergeRows(merged, rows);
                unit.status = "done";
                unit.found = rows.length;
                delete unit.error;
              }
            } catch (error) {
              unit.status = "failed";
              unit.error = (error as Error).message.slice(0, 300);
            }
            await sleep(PAUSE_MS);
          }

          // 4. Save, best first.
          const rows = [...merged.values()].sort((a, b) => (b.searches ?? -1) - (a.searches ?? -1));
          state.updatedAt = new Date().toISOString();
          await writeChatFile(ctx, rowsFile(name), rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
          await writeChatFile(ctx, stateFile(name), JSON.stringify(state, null, 1));

          const count = (status: BatchUnit["status"]) => state.units.filter((u) => u.status === status).length;
          const pending = count("pending");
          return text(
            JSON.stringify({
              batch: name,
              file: rowsFile(name),
              progress: { done: count("done"), pending, failed: count("failed"), total: state.units.length },
              keywords: rows.length,
              withVolume: rows.filter((r) => (r.searches ?? 0) > 0).length,
              ...(pending
                ? {
                    next:
                      stoppedBy === "limit"
                        ? "Google is limiting Keyword Planner right now. Wait a minute, then call keyword_batch again with the same name to continue."
                        : "Time for this call ran out. Call keyword_batch again with the same name to continue.",
                  }
                : { next: "Every seed has run. Analyse the file with run_script." }),
              failed: state.units.filter((u) => u.status === "failed").slice(0, 10).map((u) => ({ seed: u.seed.site ?? u.seed.url ?? `${u.seed.keywords?.length ?? 0} keywords`, error: u.error })),
              top: rows.slice(0, TOP_SHOWN),
            })
          );
        } catch (error) {
          return failure((error as Error).message);
        }
      },
    },
  };
}

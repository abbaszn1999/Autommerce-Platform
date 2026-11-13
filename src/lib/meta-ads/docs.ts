// Agent documents for the Meta Ads workspace: plans, reports, audits and other
// deliverables the agent writes into tabs beside the chat. Built from typed blocks so numbers can be
// live, sections can be edited one at a time, and every edit is a version.

import { gid } from "./mutations";
import type { MetricKey, MutateOp } from "./types";

/** The two folders on the Documents page: what the agent plans to do, and what it reports on. */
export type DocFolder = "REPORTS" | "PLANS";

export const DOC_FOLDERS: Record<DocFolder, { label: string; emoji: string; blurb: string }> = {
  REPORTS: { label: "Reports", emoji: "📊", blurb: "Reports, audits and research the agent wrote, plus ready templates to start from" },
  PLANS: { label: "Plans", emoji: "🗺️", blurb: "Campaign, budget, ad copy and experiment plans the agent built for you" },
};

export type DocType = "PLAN" | "REPORT" | "AUDIT" | "BUDGET" | "CREATIVE_BRIEF" | "AUDIENCES" | "FEED" | "EXPERIMENT" | "COMPETITORS";

export const DOC_TYPES: Record<DocType, { folder: DocFolder; label: string; emoji: string; blurb: string; prompt: string }> = {
  PLAN: { folder: "PLANS", label: "Campaign plan", emoji: "📋", blurb: "Objective, budget split, ad sets, creative angles, timeline and steps", prompt: "Make me a Ramadan campaign plan" },
  REPORT: { folder: "REPORTS", label: "Performance report", emoji: "📈", blurb: "Key numbers, trends, winners and losers, recommendations", prompt: "Write my monthly performance report" },
  AUDIT: { folder: "REPORTS", label: "Account audit", emoji: "🔍", blurb: "Health score, issues by impact and the fix for each", prompt: "Write a full audit report of my Meta account" },
  BUDGET: { folder: "PLANS", label: "Budget plan", emoji: "💰", blurb: "How to split a budget across campaigns and ad sets, with learning-safe steps", prompt: "Plan how to spend $12,000 next month" },
  CREATIVE_BRIEF: { folder: "PLANS", label: "Creative brief", emoji: "🎬", blurb: "Concepts, hooks and copy variants by audience, ready to produce", prompt: "Write a creative brief for new running shoe concepts" },
  AUDIENCES: { folder: "REPORTS", label: "Audience review", emoji: "👥", blurb: "Overlaps, exclusions, lookalikes and segments, with fixes", prompt: "Review my audiences and exclusions" },
  FEED: { folder: "REPORTS", label: "Catalog review", emoji: "🛍️", blurb: "Products with issues, why, and catalog fixes", prompt: "Review my product catalog" },
  EXPERIMENT: { folder: "PLANS", label: "Experiment plan", emoji: "🧪", blurb: "Hypothesis, split, duration and success criteria, including lift studies", prompt: "Plan a creative A/B test for UGC vs. product images" },
  COMPETITORS: { folder: "REPORTS", label: "Competitor analysis", emoji: "🏁", blurb: "What competitors run in the Ads Library, and your openings", prompt: "Analyse my competitors in the Ads Library" },
};
export type ValueFormat = "money" | "number" | "percent" | "ratio" | "text";

export type ChecklistItem = {
  id: string;
  text: string;
  detail?: string;
  /** Changes this step makes; running it creates a pending change. */
  ops?: MutateOp[];
  risk?: "LOW" | "MEDIUM" | "HIGH";
  /** Pending change created from this step. */
  changeId?: string;
  done?: boolean;
};

export type DocBlock =
  | { kind: "text"; md: string }
  | { kind: "callout"; tone: "info" | "good" | "warn" | "bad"; title: string; text: string }
  | {
      kind: "kpis";
      items: {
        label: string;
        value?: string;
        /** Live: computed from the account at render time. */
        metric?: MetricKey;
        campaignIds?: string[];
        delta?: number;
        hint?: string;
      }[];
    }
  | {
      kind: "chart";
      title: string;
      variant: "line" | "bar" | "donut";
      format: ValueFormat;
      data?: { label: string; value: number; value2?: number }[];
      seriesNames?: [string, string?];
      /** Live daily series from the account. */
      live?: { metric: MetricKey; metric2?: MetricKey; campaignIds?: string[] };
    }
  | { kind: "table"; columns: string[]; rows: (string | number)[][]; align?: ("left" | "right")[]; highlightLast?: boolean }
  | { kind: "tree"; items: { name: string; meta: string; children: { name: string; meta?: string; chips?: string[] }[] }[] }
  | { kind: "ads"; items: { audience?: string; primaryTexts: string[]; headlines: string[]; cta?: string; url: string }[] }
  | { kind: "timeline"; phases: { label: string; when: string; focus: string; items: string[]; budgetShare?: number }[] }
  | { kind: "score"; score: number; label: string; parts: { label: string; score: number }[] }
  | { kind: "checklist"; items: ChecklistItem[] };

export type DocSection = { id: string; title: string; blocks: DocBlock[] };

export type DocVersion = { version: number; at: string; author: "AGENT" | "YOU"; note: string; sections: DocSection[]; changedSectionIds: string[] };

export type DocComment = {
  id: string;
  sectionId: string;
  author: "YOU" | "AGENT";
  text: string;
  at: string;
  resolved?: boolean;
  /** Agent replies thread under the comment. */
  replies: { author: "YOU" | "AGENT"; text: string; at: string }[];
};

export type AgentDoc = {
  id: string;
  type: DocType;
  title: string;
  subtitle?: string;
  status: "DRAFT" | "APPROVED" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
  version: number;
  sections: DocSection[];
  versions: DocVersion[];
  /** Sections the last version changed, highlighted until viewed. */
  changedSectionIds: string[];
  comments: DocComment[];
  /** Specialists who worked on it. */
  team: string[];
  schedule?: { frequency: "WEEKLY" | "MONTHLY"; recipients: string[]; nextRun: string };
  shareUrl?: string;
  /** Inputs the generator used, so edits can regenerate. */
  inputs?: Record<string, string | number>;
};

export function section(title: string, ...blocks: DocBlock[]): DocSection {
  return { id: gid("sec"), title, blocks };
}

export function newDoc(type: DocType, title: string, sections: DocSection[], extra: Partial<AgentDoc> = {}): AgentDoc {
  const now = new Date().toISOString();
  return {
    id: gid("doc"),
    type,
    title,
    status: "DRAFT",
    createdAt: now,
    updatedAt: now,
    version: 1,
    sections,
    versions: [{ version: 1, at: now, author: "AGENT", note: "First draft", sections, changedSectionIds: [] }],
    changedSectionIds: [],
    comments: [],
    team: [],
    ...extra,
  };
}

/** Sections whose content differs between two versions (matched by title). */
export function changedSections(before: DocSection[], after: DocSection[]): string[] {
  const prev = new Map(before.map((s) => [s.title, JSON.stringify(s.blocks)]));
  return after.filter((s) => prev.get(s.title) !== JSON.stringify(s.blocks)).map((s) => s.id);
}

export function reviseDoc(doc: AgentDoc, sections: DocSection[], note: string, author: "AGENT" | "YOU" = "AGENT", extra: Partial<AgentDoc> = {}): AgentDoc {
  const version = doc.version + 1;
  const at = new Date().toISOString();
  const changed = changedSections(doc.sections, sections);
  return {
    ...doc,
    ...extra,
    sections,
    version,
    updatedAt: at,
    changedSectionIds: changed,
    versions: [...doc.versions, { version, at, author, note, sections, changedSectionIds: changed }],
  };
}

export function docToMarkdown(doc: AgentDoc): string {
  const out: string[] = [`# ${doc.title}`, doc.subtitle ?? "", ""];
  for (const s of doc.sections) {
    out.push(`## ${s.title}`, "");
    for (const b of s.blocks) {
      if (b.kind === "text") out.push(b.md, "");
      if (b.kind === "callout") out.push(`> **${b.title}** ${b.text}`, "");
      if (b.kind === "table") out.push(`| ${b.columns.join(" | ")} |`, `| ${b.columns.map(() => "---").join(" | ")} |`, ...b.rows.map((r) => `| ${r.join(" | ")} |`), "");
      if (b.kind === "checklist") out.push(...b.items.map((i) => `- [${i.done ? "x" : " "}] ${i.text}`), "");
      if (b.kind === "timeline") out.push(...b.phases.map((p) => `- **${p.label}** (${p.when}): ${p.focus}`), "");
    }
  }
  return out.join("\n");
}


// The business profile and memory are shared with the Google Ads agent: one per workspace.
export {
  DEFAULT_PROFILE,
  PROFILE_SECTIONS,
  emptyProfile,
  profileCompleteness,
  seedMemories,
  type AgentMemory,
  type BrandGuidelines,
  type BusinessProfile,
  type Competitor,
  type PaletteColor,
} from "@/lib/google-ads/docs";
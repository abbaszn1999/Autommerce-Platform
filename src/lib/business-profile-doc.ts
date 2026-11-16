// The business knowledge document: one Markdown file per workspace with a fixed
// set of headings, the same for every business. People edit it like a document
// and Vera writes into it; the headings cannot be renamed, removed or reordered
// (whatever is saved is put back into this template). Pure: used by the page,
// the platform and the agent service.

/** The document's headings, in order. */
export type ProfileSection =
  | "facts"
  | "overview"
  | "names"
  | "markets"
  | "economics"
  | "catalog"
  | "positioning"
  | "offers"
  | "competitors"
  | "seasonality"
  | "guardrails"
  | "brand"
  | "history"
  | "sources"
  | "questions";

export type SectionDef = {
  id: ProfileSection;
  /** The heading, exactly as it appears in the document. */
  label: string;
  /** Shown under the heading on the page. */
  hint: string;
  /** What belongs under it: the agent's brief for writing it. */
  guide: string;
};

export const SECTIONS: SectionDef[] = [
  { id: "facts", label: "Key facts", hint: "The basics every agent needs first.", guide: "Business name, website, languages, countries, founding year, size, business model, contact. Short facts, one per line." },
  { id: "overview", label: "Business overview", hint: "What the business is and who it sells to.", guide: "What the business is, what it sells, its story, how it makes money, and what it stands for. A few clear paragraphs." },
  { id: "names", label: "Brand and search names", hint: "Every spelling and language people use to search for you.", guide: "The brand name in every language and spelling, product-line names, common misspellings, and how customers search for the brand." },
  { id: "markets", label: "Markets and customers", hint: "Where you sell, and who buys.", guide: "Countries sold and shipped to (and any not served), languages per market, the target audience, their problems and what they search for." },
  { id: "economics", label: "Goals and economics", hint: "Vera judges every plan and change against these numbers.", guide: "Notes behind the numbers: how the margin works, the goal and its time frame, budget rules, seasonality of cash. The numbers themselves are in the block above." },
  { id: "catalog", label: "Products and catalog", hint: "What you sell and what to push.", guide: "A written brief, not a list of every item: main categories, price range, brands carried, best sellers, products to push and why, what to avoid. Links to key product or category pages are welcome." },
  { id: "positioning", label: "Positioning", hint: "Why customers choose you.", guide: "Unique selling proposition, key selling points, competitive advantages, and proof (reviews, awards, certifications, guarantees, numbers)." },
  { id: "offers", label: "Offers, shipping and returns", hint: "What customers are promised.", guide: "Delivery times and costs, the returns policy, warranty, payment options, standing promotions and discounts, as customers see them." },
  { id: "competitors", label: "Competitors", hint: "Who you compete with.", guide: "Who the competitors are, how each is positioned, their strengths and weaknesses against this business, and what their ads show. Their paid keywords are on the Competitor ads tab." },
  { id: "seasonality", label: "Seasonality", hint: "Timing to plan around.", guide: "Peak and slow seasons, events, holidays and sales periods, with the months and how demand moves." },
  { id: "guardrails", label: "Guardrails", hint: "What must never be advertised or claimed.", guide: "Products, words and claims never to use, regulated topics, legal limits, brand-safety rules, countries to avoid." },
  { id: "brand", label: "Brand guidelines", hint: "Vera follows these when she writes ads and picks images.", guide: "Brand identity, tone of voice (with examples), visual direction, colour palette with hex codes, fonts, and the logo (a link)." },
  { id: "history", label: "Marketing history and learnings", hint: "What was tried and what worked.", guide: "Past campaigns and channels, what worked and what did not, results with dates and numbers. Grows as Vera learns." },
  { id: "sources", label: "Sources and uploaded files", hint: "Where this document comes from.", guide: "Every file the owner uploaded and every page used to write this document, one line each with what it contains." },
  { id: "questions", label: "Open questions", hint: "What Vera still needs to know.", guide: "What is still unknown and who can answer it. Remove a question once it is answered and written in its section." },
];

export const DOC_TITLE = "Business knowledge base";

/**
 * The most the document can hold. The database keeps the whole profile under
 * 100 KB, so this stays below it (in bytes: Arabic and other scripts take two).
 */
export const DOC_MAX_BYTES = 85_000;

export const docBytes = (text: string): number => new TextEncoder().encode(text).length;

const LABEL_TO_ID = new Map(SECTIONS.map((s) => [s.label.toLowerCase(), s.id]));

/** A heading's text as a section id ("1. Business overview:" counts), or null for any other heading. */
function sectionOf(text: string): ProfileSection | null {
  const clean = text.replace(/^\d+[.)]?\s+/, "").replace(/[:：]\s*$/, "").trim().toLowerCase();
  return LABEL_TO_ID.get(clean) ?? null;
}

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^(#{1,2})\s+(.*?)\s*#*\s*$/;

const tidy = (lines: string[]) => lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();

/** Level 1 and 2 headings inside a section are shown as level 3: the document's own headings stay the only ones. */
export function demoteHeadings(text: string): string {
  let fenced = false;
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      if (FENCE.test(line)) fenced = !fenced;
      const m = !fenced && HEADING.exec(line);
      return m ? `### ${m[2]}` : line;
    })
    .join("\n");
}

/** The document's text split under its fixed headings. Anything before the first heading goes under Key facts. */
export function parseDocument(markdown: string): Record<ProfileSection, string> {
  const buckets = Object.fromEntries(SECTIONS.map((s) => [s.id, [] as string[]])) as Record<ProfileSection, string[]>;
  const before: string[] = [];
  const seen = new Set<ProfileSection>();
  let current: ProfileSection | null = null;
  let fenced = false;
  let titleChecked = false;
  for (const line of markdown.replace(/\r\n/g, "\n").split("\n")) {
    if (FENCE.test(line)) fenced = !fenced;
    const m = !fenced ? HEADING.exec(line) : null;
    if (m) {
      const id = sectionOf(m[2]!);
      if (id && !seen.has(id)) {
        seen.add(id);
        current = id;
        titleChecked = true;
        continue;
      }
      // The document's own title, or a heading that is not one of ours: kept as text under the section it is in.
      if (m[1] === "#" && !titleChecked && !current && m[2]!.trim().toLowerCase() === DOC_TITLE.toLowerCase()) {
        titleChecked = true;
        continue;
      }
      titleChecked = true;
      (current ? buckets[current] : before).push(`### ${m[2]}`);
      continue;
    }
    if (line.trim()) titleChecked = true;
    (current ? buckets[current] : before).push(line);
  }
  buckets.facts.unshift(...before, ...(before.length && buckets.facts.length ? [""] : []));
  return Object.fromEntries(SECTIONS.map((s) => [s.id, tidy(buckets[s.id])])) as Record<ProfileSection, string>;
}

/** The sections put back together in the fixed order, every heading present. */
export function buildDocument(sections: Partial<Record<ProfileSection, string>>): string {
  const parts = [`# ${DOC_TITLE}`];
  for (const s of SECTIONS) {
    parts.push(`## ${s.label}`);
    const body = (sections[s.id] ?? "").trim();
    if (body) parts.push(body);
  }
  return `${parts.join("\n\n")}\n`;
}

/** Whatever was saved, in the template: headings fixed and in order, text kept. */
export const normalizeDocument = (markdown: string): string => buildDocument(parseDocument(markdown));

export const emptyDocument = (): string => buildDocument({});

export function isDocumentEmpty(markdown: string | null | undefined): boolean {
  return !markdown || Object.values(parseDocument(markdown)).every((t) => !t);
}

export function getSection(markdown: string | null | undefined, id: ProfileSection): string {
  return markdown ? parseDocument(markdown)[id] : "";
}

/** Replace one section's text. */
export function setSection(markdown: string | null | undefined, id: ProfileSection, text: string): string {
  const sections = parseDocument(markdown ?? "");
  sections[id] = demoteHeadings(text).trim();
  return buildDocument(sections);
}

/** Add text at the end of one section. */
export function appendToSection(markdown: string | null | undefined, id: ProfileSection, text: string): string {
  const sections = parseDocument(markdown ?? "");
  sections[id] = [sections[id], demoteHeadings(text).trim()].filter(Boolean).join("\n\n");
  return buildDocument(sections);
}

/** Which sections have any text. */
export function sectionsFilled(markdown: string | null | undefined): Record<ProfileSection, boolean> {
  const parsed = parseDocument(markdown ?? "");
  return Object.fromEntries(SECTIONS.map((s) => [s.id, !!parsed[s.id]])) as Record<ProfileSection, boolean>;
}

/** The sections whose text differs between two versions (their labels). */
export function changedSections(before: string | null | undefined, after: string | null | undefined): string[] {
  const a = parseDocument(before ?? "");
  const b = parseDocument(after ?? "");
  return SECTIONS.filter((s) => a[s.id] !== b[s.id]).map((s) => s.label);
}

export const isProfileSection = (v: unknown): v is ProfileSection => typeof v === "string" && SECTIONS.some((s) => s.id === v);

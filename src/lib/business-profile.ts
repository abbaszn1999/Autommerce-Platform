// The workspace's business profile: what every agent knows about the business
// (Vera on the Google Ads page, the Store Assistant). Pure: the field list, the
// checks on every value, the rules for who may set what, and the short brief
// the agents read. Used by the platform and by the agent service.

export type Competitor = { name: string; url: string };
export type PaletteColor = { name: string; hex: string; role: string };

type Kind = "text" | "longtext" | "url" | "list" | "choice" | "percent" | "ratio" | "money" | "competitors" | "palette";

export type ProfileSection = "business" | "markets" | "economics" | "positioning" | "guardrails" | "brand";

type FieldDef = {
  label: string;
  kind: Kind;
  section: ProfileSection;
  /** Shown under the field on the page, and to the agent. */
  hint?: string;
  /** Money and goals: only the owner knows them, so an agent never suggests them. */
  ownerOnly?: boolean;
  choices?: readonly { value: string; label: string }[];
  max?: number;
};

export const GOALS = [
  { value: "profit", label: "Profit: the best return on ad spend" },
  { value: "growth", label: "Growth: more sales, even at a higher cost per sale" },
  { value: "new_customers", label: "New customers" },
] as const;

export const PROFILE_FIELDS = {
  businessName: { label: "Business name", kind: "text", section: "business", max: 120 },
  website: { label: "Website", kind: "url", section: "business" },
  languages: { label: "Languages", kind: "list", section: "business", hint: "The website's languages, and the languages ads are written in." },
  brandTerms: { label: "Brand names", kind: "list", section: "business", hint: "Every way people search for the brand, in every language and spelling." },
  markets: { label: "Countries you sell and ship to", kind: "list", section: "markets", hint: "Ads outside these countries waste money." },
  categories: { label: "Product categories", kind: "list", section: "markets" },
  focusProducts: { label: "Products to push", kind: "list", section: "markets", hint: "Best sellers or products you want to grow." },
  goal: { label: "Main goal", kind: "choice", section: "economics", ownerOnly: true, choices: GOALS },
  margin: { label: "Gross margin", kind: "percent", section: "economics", ownerOnly: true, hint: "After product cost, before ads. Break-even ROAS = 1 ÷ margin." },
  targetRoas: { label: "Target ROAS", kind: "ratio", section: "economics", ownerOnly: true, hint: "Sales per 1 spent on ads, e.g. 4 = 400%." },
  monthlyBudgetCap: { label: "Monthly budget cap", kind: "money", section: "economics", ownerOnly: true, hint: "Vera warns before any change that would go above it." },
  averageOrderValue: { label: "Average order value", kind: "money", section: "economics" },
  keySellingPoints: { label: "Key selling points", kind: "list", section: "positioning" },
  competitiveAdvantages: { label: "Competitive advantages", kind: "list", section: "positioning" },
  competitors: { label: "Competitors", kind: "competitors", section: "positioning" },
  shippingReturns: { label: "Shipping and returns", kind: "longtext", section: "positioning", max: 1000, hint: "Delivery times, costs and the returns policy, as customers see them." },
  peakSeasons: { label: "Peak seasons", kind: "list", section: "guardrails" },
  neverAdvertise: { label: "Never advertise", kind: "list", section: "guardrails", hint: "Products, words or claims Vera must never use." },
  brandIdentity: { label: "Identity", kind: "longtext", section: "brand", max: 1500 },
  brandVoice: { label: "Brand voice", kind: "longtext", section: "brand", max: 1500 },
  visualDirection: { label: "Visual direction", kind: "longtext", section: "brand", max: 1500 },
  logoUrl: { label: "Logo", kind: "url", section: "brand" },
  palette: { label: "Colour palette", kind: "palette", section: "brand" },
} as const satisfies Record<string, FieldDef>;

export type ProfileField = keyof typeof PROFILE_FIELDS;
export const FIELD_KEYS = Object.keys(PROFILE_FIELDS) as ProfileField[];
export const isProfileField = (v: unknown): v is ProfileField => typeof v === "string" && Object.prototype.hasOwnProperty.call(PROFILE_FIELDS, v);
const def = (f: ProfileField): FieldDef => PROFILE_FIELDS[f];

export type ProfileValue = string | number | string[] | Competitor[] | PaletteColor[];
export type ProfileValues = Partial<Record<ProfileField, ProfileValue>>;

/** Where a value came from. */
export type ProfileSource = "owner" | "chat" | "website" | "google_ads" | "merchant" | "store";
export const PROFILE_SOURCES: readonly ProfileSource[] = ["owner", "chat", "website", "google_ads", "merchant", "store"];
export type FieldMeta = { source: ProfileSource; status: "confirmed" | "suggested"; at: string };
export type ProfileMeta = Partial<Record<ProfileField, FieldMeta>>;

export type BusinessProfileData = { values: ProfileValues; meta: ProfileMeta; updatedAt: string | null };

export const SECTIONS: { id: ProfileSection; label: string; hint: string }[] = [
  { id: "business", label: "Business", hint: "Who you are, and how people search for you." },
  { id: "markets", label: "Markets & catalog", hint: "Where you sell and what you sell." },
  { id: "economics", label: "Economics", hint: "Vera judges every plan and change against these numbers." },
  { id: "positioning", label: "Positioning", hint: "Why customers choose you, and who you compete with." },
  { id: "guardrails", label: "Guardrails", hint: "Timing to plan around, and what must never be advertised." },
  { id: "brand", label: "Brand guidelines", hint: "Vera follows these when she writes ads and picks images." },
];

/**
 * What an agent must know before it advises on money: who the business is,
 * where it sells, the goal, the budget, and either the margin or a target ROAS.
 */
export const REQUIRED: readonly (ProfileField | readonly ProfileField[])[] = ["businessName", "website", "markets", "goal", ["margin", "targetRoas"], "monthlyBudgetCap"];

export class ProfileEditError extends Error {}

const LIST_MAX = 30;
const ITEM_MAX = 200;
const clean = (s: string) => s.replace(/\s+/g, " ").trim();

function toUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const withScheme = /^https?:\/\//i.test(s) ? s : /^[\w-]+(\.[\w-]+)+([/?#].*)?$/.test(s) ? `https://${s}` : "";
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString().replace(/\/$/, "") : null;
  } catch {
    return null;
  }
}

function toNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const n = Number(raw.replace(/[%,\s×x]/gi, ""));
  return raw.trim() && Number.isFinite(n) ? n : null;
}

function toList(raw: unknown): string[] {
  const items = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[\n,،]/) : null;
  if (!items) throw new ProfileEditError("must be a list of short texts");
  const out: string[] = [];
  for (const item of items) {
    if (typeof item !== "string") throw new ProfileEditError("must be a list of short texts");
    const s = clean(item).slice(0, ITEM_MAX);
    if (s && !out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  if (out.length > LIST_MAX) throw new ProfileEditError(`can hold at most ${LIST_MAX} items`);
  return out;
}

/**
 * The stored form of one value, or null to clear the field. Lenient about how
 * people write numbers (40%, 0.4, "4x"), strict about what is stored.
 */
export function normalizeValue(field: ProfileField, raw: unknown): ProfileValue | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const d = def(field);
  const fail = (why: string): never => {
    throw new ProfileEditError(`${d.label} ${why}.`);
  };
  switch (d.kind) {
    case "text":
    case "longtext": {
      if (typeof raw !== "string") return fail("must be text");
      const s = d.kind === "text" ? clean(raw) : raw.trim().replace(/\n{3,}/g, "\n\n");
      if (s.length > (d.max ?? 200)) fail(`is too long (at most ${d.max ?? 200} characters)`);
      return s || null;
    }
    case "url": {
      if (typeof raw !== "string") return fail("must be a web address");
      return toUrl(raw) ?? fail("must be a web address starting with https://");
    }
    case "list": {
      const list = toList(raw);
      return list.length ? list : null;
    }
    case "choice": {
      const v = typeof raw === "string" ? raw.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";
      return d.choices?.some((c) => c.value === v) ? v : fail(`must be one of: ${d.choices?.map((c) => c.value).join(", ")}`);
    }
    case "percent": {
      // 40, "40%" and 0.4 all mean 40%. Stored as a share (0.4).
      const n = toNumber(raw);
      if (n === null) return fail("must be a percentage, e.g. 40%");
      const share = n > 1 ? n / 100 : n;
      return share >= 0.01 && share <= 0.95 ? Math.round(share * 1000) / 1000 : fail("must be between 1% and 95%");
    }
    case "ratio": {
      // 4, "4x" and "400%" all mean a ROAS of 4.
      const n = toNumber(raw);
      if (n === null) return fail("must be a number, e.g. 4 for 400%");
      const ratio = (typeof raw === "string" && raw.includes("%")) || n >= 50 ? n / 100 : n;
      return ratio >= 0.2 && ratio <= 40 ? Math.round(ratio * 100) / 100 : fail("must be between 0.2 and 40 (20% to 4000%)");
    }
    case "money": {
      const n = toNumber(raw);
      return n !== null && n > 0 && n <= 1e9 ? Math.round(n * 100) / 100 : fail("must be an amount above zero");
    }
    case "competitors": {
      if (!Array.isArray(raw)) return fail("must be a list of { name, url }");
      const out: Competitor[] = [];
      for (const c of raw) {
        const o = (typeof c === "string" ? { name: c } : c) as Record<string, unknown> | null;
        const name = typeof o?.name === "string" ? clean(o.name).slice(0, 120) : "";
        if (!name) fail("each need a name");
        const url = typeof o?.url === "string" && o.url.trim() ? toUrl(o.url) : "";
        if (url === null) fail(`have a bad web address for ${name}`);
        if (!out.some((x) => x.name.toLowerCase() === name.toLowerCase())) out.push({ name, url: url ?? "" });
      }
      if (out.length > 15) fail("can hold at most 15 competitors");
      return out.length ? out : null;
    }
    case "palette": {
      if (!Array.isArray(raw)) return fail("must be a list of { name, hex, role }");
      const out: PaletteColor[] = [];
      for (const c of raw) {
        const o = (c ?? {}) as Record<string, unknown>;
        const hex = typeof o.hex === "string" ? o.hex.trim().toUpperCase() : "";
        if (!/^#[0-9A-F]{6}$/.test(hex)) fail("colours need a hex code like #400095");
        out.push({ name: typeof o.name === "string" ? clean(o.name).slice(0, 60) : hex, hex, role: typeof o.role === "string" ? clean(o.role).slice(0, 60) : "" });
      }
      if (out.length > 10) fail("can hold at most 10 colours");
      return out.length ? out : null;
    }
  }
}

/** Equal values, whatever order the database kept object keys in. */
export function sameValue(a: unknown, b: unknown): boolean {
  const stable = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable((v as Record<string, unknown>)[k])])) : v;
  return JSON.stringify(stable(a ?? null)) === JSON.stringify(stable(b ?? null));
}

export type ProfileEdit = { field: ProfileField; value: unknown };
export type ProfileChange = { field: ProfileField; before: ProfileValue | null; after: ProfileValue | null; beforeMeta: FieldMeta | null; afterMeta: FieldMeta | null };

/**
 * Who is editing. The owner (on the page, or in chat in their own words)
 * confirms values. An agent's own findings are only suggestions: they fill
 * empty or suggested fields, never replace what the owner confirmed, and never
 * touch the owner-only fields.
 */
export type Editor = { source: ProfileSource; status: "confirmed" | "suggested" };

export function planProfileEdits(current: BusinessProfileData, edits: ProfileEdit[], editor: Editor, now = new Date().toISOString()) {
  if (!edits.length) throw new ProfileEditError("Nothing to change.");
  if (edits.length > FIELD_KEYS.length) throw new ProfileEditError("Too many edits at once.");
  const values: ProfileValues = { ...current.values };
  const meta: ProfileMeta = { ...current.meta };
  const changes: ProfileChange[] = [];
  const skipped: { field: ProfileField; reason: string }[] = [];

  for (const edit of edits) {
    if (!isProfileField(edit.field)) throw new ProfileEditError(`Unknown field "${String(edit.field)}". Fields: ${FIELD_KEYS.join(", ")}.`);
    const { field } = edit;
    if (changes.some((c) => c.field === field)) throw new ProfileEditError(`${def(field).label} is edited twice.`);
    const after = normalizeValue(field, edit.value);
    const before = values[field] ?? null;
    const beforeMeta = meta[field] ?? null;

    if (editor.status === "suggested") {
      if (def(field).ownerOnly) {
        skipped.push({ field, reason: "only the owner can set this; ask them" });
        continue;
      }
      if (beforeMeta?.status === "confirmed" && before !== null) {
        skipped.push({ field, reason: "the owner already confirmed a value; tell them what you found instead" });
        continue;
      }
      if (after === null) {
        skipped.push({ field, reason: "a suggestion cannot clear a field" });
        continue;
      }
    }
    const same = sameValue(before, after);
    // Confirming an unchanged suggestion is still a change (its status moves).
    if (same && (beforeMeta?.status === editor.status || after === null)) continue;

    const afterMeta: FieldMeta | null = after === null ? null : { source: editor.source, status: editor.status, at: now };
    if (after === null) {
      delete values[field];
      delete meta[field];
    } else {
      values[field] = after;
      meta[field] = afterMeta!;
    }
    changes.push({ field, before, after, beforeMeta, afterMeta });
  }
  return { next: { values, meta }, changes, skipped };
}

/** The required fields still empty (a pair counts as one: margin or target ROAS). */
export function missingRequired(values: ProfileValues): string[] {
  return REQUIRED.filter((r) => (typeof r === "string" ? values[r] == null : r.every((f) => values[f] == null))).map((r) =>
    typeof r === "string" ? def(r).label : r.map((f) => def(f).label).join(" or ")
  );
}

export function completeness(values: ProfileValues) {
  const sections = SECTIONS.map((s) => {
    const fields = FIELD_KEYS.filter((f) => def(f).section === s.id);
    return { ...s, filled: fields.filter((f) => values[f] != null).length, total: fields.length };
  });
  return { sections, filled: sections.reduce((n, s) => n + s.filled, 0), total: FIELD_KEYS.length, missing: missingRequired(values) };
}

/** A value as one line of text, for the agents and the change history. */
export function formatValue(field: ProfileField, value: ProfileValue | null | undefined, currency = ""): string {
  if (value == null) return "(empty)";
  const d = def(field);
  switch (d.kind) {
    case "percent":
      return `${Math.round(Number(value) * 1000) / 10}%`;
    case "ratio":
      return `${value}× (${Math.round(Number(value) * 100)}%)`;
    case "money":
      return `${Number(value).toLocaleString("en")}${currency ? ` ${currency}` : ""}`;
    case "choice":
      return d.choices?.find((c) => c.value === value)?.label ?? String(value);
    case "list":
      return (value as string[]).join("; ");
    case "competitors":
      return (value as Competitor[]).map((c) => (c.url ? `${c.name} (${c.url})` : c.name)).join("; ");
    case "palette":
      return (value as PaletteColor[]).map((c) => `${c.name} ${c.hex}${c.role ? ` (${c.role})` : ""}`).join("; ");
    default:
      return String(value);
  }
}

/**
 * The profile as the agents read it at the start of every chat: every filled
 * field (long texts shortened), what is only suggested, and what is missing.
 */
export function profileBrief(profile: BusinessProfileData, currency = ""): string {
  const lines: string[] = [];
  for (const f of FIELD_KEYS) {
    const v = profile.values[f];
    if (v == null) continue;
    let text = formatValue(f, v, currency);
    if (text.length > 400) text = `${text.slice(0, 400)}… (full text: business_profile)`;
    const suggested = profile.meta[f]?.status === "suggested" ? ` [suggested from ${profile.meta[f]!.source}, not confirmed by the owner]` : "";
    lines.push(`- ${def(f).label}: ${text}${suggested}`);
  }
  const margin = profile.values.margin;
  if (typeof margin === "number") lines.push(`- Break-even ROAS (from the margin): ${(1 / margin).toFixed(2)}×`);
  const missing = missingRequired(profile.values);
  if (!lines.length) lines.push("- (empty: nothing filled in yet)");
  if (missing.length) lines.push(`\nStill missing (required): ${missing.join(", ")}.`);
  return lines.join("\n");
}

/** Every field with its value, source and status, for the agent's read tool. */
export function profileForAgent(profile: BusinessProfileData, currency = "") {
  return {
    fields: FIELD_KEYS.map((f) => ({
      field: f,
      label: def(f).label,
      section: def(f).section,
      ownerOnly: !!def(f).ownerOnly,
      value: profile.values[f] ?? null,
      text: formatValue(f, profile.values[f], currency),
      status: profile.values[f] == null ? "empty" : (profile.meta[f]?.status ?? "confirmed"),
      source: profile.meta[f]?.source ?? null,
      ...(def(f).hint ? { hint: def(f).hint } : {}),
    })),
    missingRequired: missingRequired(profile.values),
    updatedAt: profile.updatedAt,
  };
}

export const fieldLabel = (f: ProfileField) => def(f).label;
export const fieldDef = (f: ProfileField): FieldDef => def(f);

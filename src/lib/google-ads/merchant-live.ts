// Merchant Center products as Google reports them, and the plan for an approved
// product fix. Pure: no network, so every rule here is tested on its own.
//
// Fixes never touch the merchant's own feed. Autommerce supplies the new values
// through its own supplemental data source in their account, which Merchant Center
// lays over the feed; undo puts back exactly what Autommerce supplied before
// (or removes its values altogether).

export type MerchantIssue = {
  code: string;
  severity: "DISAPPROVED" | "DEMOTED" | "NOT_IMPACTED";
  /** Product attribute the issue is about ("image link"), when Google names one. */
  attribute?: string;
  description: string;
  detail?: string;
  documentation?: string;
  /** "merchant_action": the merchant must fix it; "pending_processing": Google is still working on it. */
  resolution?: string;
  destinations: string[];
};

export type MerchantProductStatus = "APPROVED" | "LIMITED" | "DISAPPROVED" | "PENDING";

export type MerchantProduct = {
  /** "en~US~SKU1": content language, feed label and offer id, as Google names the product. */
  id: string;
  offerId: string;
  contentLanguage: string;
  feedLabel: string;
  title: string;
  description: string;
  brand: string;
  gtin: string;
  mpn: string;
  link: string;
  imageLink: string;
  googleProductCategory: string;
  price?: number;
  salePrice?: number;
  currency: string;
  availability: string;
  condition: string;
  status: MerchantProductStatus;
  issues: MerchantIssue[];
  updatedAt?: string;
};

export type MerchantAccountIssue = { title: string; detail: string; severity: string; documentation?: string };

export type MerchantSnapshot = {
  merchantId: string;
  products: MerchantProduct[];
  accountIssues: MerchantAccountIssue[];
  /** More products exist than were read. */
  truncated: boolean;
  fetchedAt: string;
};

/** Attributes a fix may set. Prices and availability stay with the store: they must match its website. */
export const MERCHANT_FIELDS = ["title", "description", "brand", "gtin", "mpn", "imageLink", "googleProductCategory"] as const;
export type MerchantField = (typeof MERCHANT_FIELDS)[number];
export type MerchantAttributes = Partial<Record<MerchantField, string>>;

export const FIELD_LABEL: Record<MerchantField, string> = {
  title: "Title",
  description: "Description",
  brand: "Brand",
  gtin: "GTIN",
  mpn: "MPN",
  imageLink: "Image link",
  googleProductCategory: "Google product category",
};

export type MerchantOp =
  | { kind: "product.update"; productId: string; set: MerchantAttributes }
  /** Undo only: what Autommerce supplied for the product before (null: nothing). */
  | { kind: "product.restore"; productId: string; offerId: string; contentLanguage: string; feedLabel: string; attributes: MerchantAttributes | null };

export const MAX_MERCHANT_PRODUCTS = 50;

export class MerchantPlanError extends Error {}

// ─── Reading ────────────────────────────────────────────────────────────────

type ApiIssue = { code?: string; severity?: string; attribute?: string | null; description?: string; detail?: string; documentation?: string; resolution?: string; reporting_context?: string };
type ApiDestination = { reporting_context?: string; approved_countries?: string[]; disapproved_countries?: string[]; pending_countries?: string[] };
type ApiMoney = { amount_micros?: string | number; currency_code?: string } | null;
export type ApiProduct = {
  name?: string;
  offer_id?: string;
  content_language?: string;
  feed_label?: string;
  product_attributes?: Record<string, unknown> | null;
  product_status?: { destination_statuses?: ApiDestination[]; item_level_issues?: ApiIssue[]; last_update_date?: string } | null;
};

const str = (v: unknown) => (typeof v === "string" ? v : "");
const amount = (m: ApiMoney | undefined) => (m?.amount_micros != null && m.amount_micros !== "" ? Number(m.amount_micros) / 1_000_000 : undefined);
/** Composio returns most attributes in snake_case and a few in camelCase. */
const attr = (a: Record<string, unknown>, snake: string, camel: string) => a[snake] ?? a[camel];

export function mapProduct(p: ApiProduct): MerchantProduct | null {
  const id = str(p.name).split("/products/")[1];
  if (!id) return null;
  const a = p.product_attributes ?? {};
  const status = p.product_status ?? {};
  const destinations = status.destination_statuses ?? [];
  const byCode = new Map<string, MerchantIssue>();
  for (const i of status.item_level_issues ?? []) {
    const code = str(i.code);
    if (!code) continue;
    const seen = byCode.get(code);
    if (seen) {
      if (i.reporting_context && !seen.destinations.includes(i.reporting_context)) seen.destinations.push(i.reporting_context);
      continue;
    }
    byCode.set(code, {
      code,
      severity: i.severity === "DISAPPROVED" ? "DISAPPROVED" : i.severity === "DEMOTED" ? "DEMOTED" : "NOT_IMPACTED",
      attribute: i.attribute ?? undefined,
      description: str(i.description) || code,
      detail: i.detail || undefined,
      documentation: i.documentation || undefined,
      resolution: i.resolution || undefined,
      destinations: i.reporting_context ? [i.reporting_context] : [],
    });
  }
  const issues = [...byCode.values()];
  const price = (attr(a, "price", "price") as ApiMoney) ?? null;
  const gtins = attr(a, "gtins", "gtins");
  return {
    id,
    offerId: str(p.offer_id),
    contentLanguage: str(p.content_language),
    feedLabel: str(p.feed_label),
    title: str(a.title),
    description: str(a.description),
    brand: str(a.brand),
    gtin: Array.isArray(gtins) ? str(gtins[0]) : str(attr(a, "gtin", "gtin")),
    mpn: str(a.mpn),
    link: str(a.link),
    imageLink: str(attr(a, "image_link", "imageLink")),
    googleProductCategory: str(attr(a, "google_product_category", "googleProductCategory")),
    price: amount(price),
    salePrice: amount(attr(a, "sale_price", "salePrice") as ApiMoney),
    currency: str(price?.currency_code),
    availability: str(a.availability),
    condition: str(a.condition),
    status: productStatus(destinations, issues),
    issues,
    updatedAt: status.last_update_date || undefined,
  };
}

/** Serving anywhere is approved (limited when an issue demotes it); nowhere and refused is disapproved. */
export function productStatus(destinations: ApiDestination[], issues: MerchantIssue[]): MerchantProductStatus {
  const approved = destinations.some((d) => (d.approved_countries ?? []).length > 0);
  if (approved) return issues.some((i) => i.severity !== "NOT_IMPACTED") ? "LIMITED" : "APPROVED";
  if (destinations.some((d) => (d.disapproved_countries ?? []).length > 0)) return "DISAPPROVED";
  return "PENDING";
}

// ─── Planning a fix ─────────────────────────────────────────────────────────

const LIMITS: Record<MerchantField, number> = { title: 150, description: 5000, brand: 70, gtin: 14, mpn: 70, imageLink: 2000, googleProductCategory: 750 };

/** GTIN-8/12/13/14 with a correct check digit. */
export function validGtin(gtin: string): boolean {
  if (!/^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(gtin)) return false;
  const digits = gtin.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((s, d, i) => s + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

function cleanValue(field: MerchantField, raw: unknown): string {
  if (typeof raw !== "string") throw new MerchantPlanError(`${FIELD_LABEL[field]} must be text.`);
  // Descriptions keep their line breaks; one-line fields don't.
  const value = (field === "description" ? raw : raw.replace(/\s+/g, " ")).trim();
  if (!value) throw new MerchantPlanError(`${FIELD_LABEL[field]} can't be empty.`);
  if (value.length > LIMITS[field]) throw new MerchantPlanError(`${FIELD_LABEL[field]} is longer than Google allows (${LIMITS[field]} characters).`);
  if (field === "gtin" && !validGtin(value)) throw new MerchantPlanError(`"${value}" isn't a valid GTIN (8, 12, 13 or 14 digits with a correct check digit).`);
  if (field === "imageLink") {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new MerchantPlanError("The image link isn't a valid URL.");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new MerchantPlanError("The image link must start with https://.");
  }
  return value;
}

export type MerchantWrite = { productId: string; offerId: string; contentLanguage: string; feedLabel: string; attributes: MerchantAttributes | null };
export type MerchantPlanItem = { id: string; label: string; changes: Array<{ field: string; before?: string; after?: string }> };
export type MerchantPlan = { writes: MerchantWrite[]; inverse: MerchantOp[]; items: MerchantPlanItem[]; warnings: string[] };

/**
 * Check a fix against the products as Google has them now and what Autommerce
 * already supplies (`overrides`), and work out what to write and how to undo it.
 */
export function planMerchantChange(ops: MerchantOp[], products: Map<string, MerchantProduct>, overrides: Map<string, MerchantAttributes>): MerchantPlan {
  if (!ops.length) throw new MerchantPlanError("The change has no edits.");
  const ids = new Set(ops.map((o) => o.productId));
  if (ids.size !== ops.length) throw new MerchantPlanError("Each product may appear once in a change; put all its edits together.");
  if (ops.length > MAX_MERCHANT_PRODUCTS) throw new MerchantPlanError(`At most ${MAX_MERCHANT_PRODUCTS} products per change.`);

  const plan: MerchantPlan = { writes: [], inverse: [], items: [], warnings: [] };
  for (const op of ops) {
    if (op.kind === "product.restore") {
      plan.writes.push({ productId: op.productId, offerId: op.offerId, contentLanguage: op.contentLanguage, feedLabel: op.feedLabel, attributes: op.attributes });
      continue;
    }
    if (op.kind !== "product.update") throw new MerchantPlanError(`Unknown edit "${(op as { kind?: string }).kind}".`);
    const product = products.get(op.productId);
    if (!product) throw new MerchantPlanError(`Product ${op.productId} isn't in this Merchant Center account.`);
    const set = op.set && typeof op.set === "object" ? op.set : {};
    const fields = Object.keys(set) as MerchantField[];
    if (!fields.length) throw new MerchantPlanError(`No new values for ${product.title || product.offerId}.`);
    const previous = overrides.get(product.id) ?? null;
    const next: MerchantAttributes = { ...(previous ?? {}) };
    const changes: MerchantPlanItem["changes"] = [];
    for (const field of fields) {
      if (!MERCHANT_FIELDS.includes(field)) {
        throw new MerchantPlanError(
          field === ("price" as string) || field === ("salePrice" as string) || field === ("availability" as string)
            ? "Prices and availability must be changed in the store itself, so they match the website."
            : `"${field}" can't be changed here. Allowed: ${MERCHANT_FIELDS.join(", ")}.`
        );
      }
      const value = cleanValue(field, set[field]);
      const current = product[field];
      if (value === current) continue;
      next[field] = value;
      changes.push({ field: FIELD_LABEL[field], before: current || "(empty)", after: value });
    }
    if (!changes.length) throw new MerchantPlanError(`${product.title || product.offerId} already has these values.`);
    plan.writes.push({ productId: product.id, offerId: product.offerId, contentLanguage: product.contentLanguage, feedLabel: product.feedLabel, attributes: next });
    plan.inverse.push({ kind: "product.restore", productId: product.id, offerId: product.offerId, contentLanguage: product.contentLanguage, feedLabel: product.feedLabel, attributes: previous });
    plan.items.push({ id: product.id, label: `Product · ${product.title || product.offerId}`, changes });
  }
  if (plan.items.length) plan.warnings.push("Merchant Center takes a few minutes to process the new values; the product's status updates after that.");
  return plan;
}

/** Attributes in the Merchant API's shape, for our supplemental data source. */
export function toApiAttributes(a: MerchantAttributes): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (a.title) out.title = a.title;
  if (a.description) out.description = a.description;
  if (a.brand) out.brand = a.brand;
  if (a.gtin) out.gtins = [a.gtin];
  if (a.mpn) out.mpn = a.mpn;
  if (a.imageLink) out.image_link = a.imageLink;
  if (a.googleProductCategory) out.google_product_category = a.googleProductCategory;
  return out;
}

// ─── For the agent ──────────────────────────────────────────────────────────

/** What the agent needs to find and fix problems, without the noise. */
export function merchantOverview(s: MerchantSnapshot) {
  const count = (status: MerchantProductStatus) => s.products.filter((p) => p.status === status).length;
  const issueCounts = new Map<string, { description: string; severity: string; attribute?: string; resolution?: string; products: number }>();
  for (const p of s.products)
    for (const i of p.issues) {
      const seen = issueCounts.get(i.code) ?? { description: i.description, severity: i.severity, attribute: i.attribute, resolution: i.resolution, products: 0 };
      seen.products++;
      issueCounts.set(i.code, seen);
    }
  return {
    merchantId: s.merchantId,
    products: s.products.length,
    truncated: s.truncated,
    status: { approved: count("APPROVED"), limited: count("LIMITED"), disapproved: count("DISAPPROVED"), pending: count("PENDING") },
    accountIssues: s.accountIssues,
    issues: [...issueCounts.entries()].map(([code, v]) => ({ code, ...v })).sort((a, b) => b.products - a.products),
    productList: s.products.map((p) => ({
      id: p.id,
      offerId: p.offerId,
      title: p.title,
      description: p.description.length > 160 ? `${p.description.slice(0, 160)}…` : p.description,
      brand: p.brand,
      gtin: p.gtin,
      mpn: p.mpn,
      imageLink: p.imageLink,
      link: p.link,
      googleProductCategory: p.googleProductCategory,
      price: p.price,
      salePrice: p.salePrice,
      currency: p.currency,
      availability: p.availability,
      status: p.status,
      issues: p.issues.map((i) => `${i.severity}: ${i.description}${i.attribute ? ` (${i.attribute})` : ""}${i.resolution === "pending_processing" ? " — Google is still processing" : ""}`),
    })),
  };
}

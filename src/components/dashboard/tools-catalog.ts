import {
  FolderTree,
  Upload,
  Image as ImageIcon,
  LayoutGrid,
  Boxes,
  Search,
  Bot,
  CreditCard,
  Users,
  Settings,
  Crown,
  type LucideIcon,
} from "lucide-react";

/** How a tool is paid for. Drives the badge shown on its card. */
export type ToolBilling = "credits" | "free";

export type ToolCategory = "agents" | "visual" | "growth" | "data" | "account";

export interface ToolDefinition {
  /** Path segment appended to /w/[slug] — empty string means the workspace root. */
  path: string;
  name: string;
  /** One line, merchant-facing: what this does for them. */
  blurb: string;
  icon: LucideIcon;
  category: ToolCategory;
  billing: ToolBilling;
  /** True when the tool cannot run without a connected store. */
  needsIntegration?: boolean;
  /** Hidden everywhere in the app for now (the page still exists). */
  hidden?: boolean;
  /** Only visible to admins/owners ("admin") or owners ("owner"). */
  requiresRole?: "admin" | "owner";
  /** Extra keywords so search finds the tool by what it does, not just its name. */
  keywords?: string[];
}

/** Every tool in the workspace, in the order they should be showcased. */
export const TOOLS: ToolDefinition[] = [
  // ── AI agents (the headline features) ──
  {
    path: "/store-assistant",
    name: "Store assistant",
    blurb:
      "Chat with an agent that can read and rewrite products and categories straight in your store.",
    icon: Bot,
    category: "agents",
    billing: "credits",
    needsIntegration: true,
    keywords: ["chat", "copilot", "assistant", "agent", "edit products"],
  },
  {
    path: "/market-research",
    name: "Market research",
    blurb:
      "A six-stage SEO agent: finds niches and keywords, then writes collection pages and their on-page SEO into your store.",
    icon: Search,
    category: "agents",
    billing: "free",
    needsIntegration: true,
    keywords: ["seo", "keywords", "collections", "on-page", "content", "niche"],
  },
  // ── Visual AI ──
  {
    path: "/products-gallery",
    name: "Products Gallery",
    blurb:
      "Generates clean product photography for every row in your catalog, then exports the whole gallery.",
    icon: LayoutGrid,
    category: "visual",
    billing: "credits",
    keywords: ["images", "photos", "photography", "generate", "gallery"],
  },
  {
    path: "/products-visualizer",
    name: "Products Visualizer",
    blurb:
      "Writes rich product descriptions and pairs them with staged lifestyle imagery you can lay out yourself.",
    icon: Boxes,
    category: "visual",
    billing: "credits",
    keywords: ["descriptions", "lifestyle", "copy", "visuals", "render"],
  },
  {
    path: "/image-classify",
    name: "Image Classification",
    blurb:
      "Drop in a folder of product images and have them matched to the right SKU or category.",
    icon: ImageIcon,
    category: "visual",
    billing: "credits",
    keywords: ["classify", "sku", "match", "vision", "sort images"],
  },

  // ── Catalog / data ──
  {
    path: "/catalog-intelligence",
    name: "Catalog Intelligence",
    blurb:
      "Upload a messy spreadsheet and let a web-searching agent map the columns and fill the gaps.",
    icon: Upload,
    category: "data",
    billing: "credits",
    keywords: ["import", "excel", "csv", "spreadsheet", "enrich", "mapping"],
  },
  {
    path: "/categories",
    name: "Categories",
    blurb: "Build and reorder the category tree that every agent classifies against.",
    icon: FolderTree,
    category: "data",
    billing: "free",
    keywords: ["taxonomy", "tree", "structure", "collections"],
  },

  // ── Growth extras ──
  {
    path: "/usage",
    name: "Usage",
    blurb: "Every AI credit you have spent, broken down by operation and by team member.",
    icon: CreditCard,
    category: "growth",
    billing: "free",
    keywords: ["credits", "spend", "history", "analytics", "report"],
  },

  // ── Workspace / account ──
  {
    path: "/settings",
    name: "Settings",
    blurb:
      "Connect your store and manage workspace basics — this is what unlocks the store-aware agents.",
    icon: Settings,
    category: "account",
    billing: "free",
    requiresRole: "admin",
    keywords: ["integration", "shopify", "woocommerce", "connect", "store"],
  },
  {
    path: "/team",
    name: "Team",
    blurb: "Invite teammates and decide who can view, edit or administer this workspace.",
    icon: Users,
    category: "account",
    billing: "free",
    requiresRole: "admin",
    keywords: ["members", "invite", "roles", "permissions"],
  },
  {
    path: "/subscription",
    name: "Subscription",
    blurb: "Change your plan or buy extra AI credits at any amount you like.",
    icon: Crown,
    category: "account",
    billing: "free",
    requiresRole: "owner",
    keywords: ["plan", "billing", "upgrade", "credits", "buy"],
  },
];

/** Filters the catalog down to what this user is actually allowed to open. */
export function visibleTools(opts: {
  canAdmin: boolean;
  isOwner: boolean;
}): ToolDefinition[] {
  return TOOLS.filter((tool) => {
    if (tool.hidden) return false;
    if (tool.requiresRole === "owner") return opts.isOwner;
    if (tool.requiresRole === "admin") return opts.canAdmin;
    return true;
  });
}

/** Loose text match across name, blurb and keywords. */
export function matchesQuery(tool: ToolDefinition, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [tool.name, tool.blurb, ...(tool.keywords ?? [])]
    .join(" ")
    .toLowerCase();
  return q.split(/\s+/).every((word) => haystack.includes(word));
}

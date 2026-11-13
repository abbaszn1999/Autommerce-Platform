// Demo data for the Meta Ads prototype: one Business portfolio with a mature
// store ad account, a small second account and an empty one. Deterministic, so
// screens look the same on every load. Replaced by the server adapter once the
// Marketing API is connected.

import { addDays, isoDay } from "./metrics";
import type {
  AdSet,
  AdSetTargeting,
  Alert,
  BusinessPortfolio,
  CatalogAccount,
  CreativeAsset,
  CreativeConcept,
  MetaAccount,
  MetaAccountData,
  MetaAd,
  MetaAudience,
  MetaCampaign,
  MetaDailyPoint,
  MetaIdentity,
  MetaPortfolioChoice,
  MetaProduct,
  Objective,
  OrganicPost,
  PostFormat,
  PostPlatform,
  PostStatus,
  Opportunity,
  PlacementKey,
} from "./types";

export const DEMO_FACEBOOK_EMAIL = "marketing@stride-demo.com";
export const DEMO_DOMAIN = "stride-demo.com";

export const PORTFOLIO: BusinessPortfolio = { id: "bp_20481", name: "Stride Group", verified: true };

export const DEMO_PAGE: MetaIdentity = { id: "pg_1042", name: "Stride Sportswear", handle: "@stridesportswear", followers: 184_300 };
export const DEMO_INSTAGRAM: MetaIdentity = { id: "ig_5511", name: "Stride Sportswear", handle: "@stride.sportswear", followers: 312_900 };
export const DEMO_PAGES: MetaIdentity[] = [DEMO_PAGE, { id: "pg_1043", name: "Stride Kids", handle: "@stridekids", followers: 28_400 }];
export const DEMO_INSTAGRAMS: MetaIdentity[] = [DEMO_INSTAGRAM, { id: "ig_5512", name: "Stride Kids", handle: "@stride.kids", followers: 41_700 }];

/** Catalogs the demo Facebook user can reach in Commerce Manager. The first one is linked to the main ad account. */
export const CATALOG_ACCOUNTS: CatalogAccount[] = [
  { catalogId: "cat_7701", name: "Stride Store Catalog", website: "stride-demo.com", productCount: 214 },
  { catalogId: "cat_7702", name: "Stride Egypt Catalog", website: "eg.stride-demo.com", productCount: 96 },
];

const MAIN_ID = "act_4412907731";
const SECOND_ID = "act_5520188314";
const EMPTY_ID = "act_6630255901";

export const MAIN_ACCOUNT: MetaAccount = {
  accountId: MAIN_ID,
  name: "Stride Sportswear – Meta KSA & UAE",
  currency: "USD",
  timeZone: "Asia/Riyadh",
  businessId: PORTFOLIO.id,
  opportunityScore: 62,
  pageId: DEMO_PAGE.id,
  instagramId: DEMO_INSTAGRAM.id,
  datasetId: "ds_1893",
  catalogId: "cat_7701",
};

export const SECOND_ACCOUNT: MetaAccount = {
  accountId: SECOND_ID,
  name: "Stride Kids – Meta GCC",
  currency: "USD",
  timeZone: "Asia/Dubai",
  businessId: PORTFOLIO.id,
  opportunityScore: 71,
  pageId: "pg_1043",
  instagramId: "ig_5512",
};

export const EMPTY_ACCOUNT: MetaAccount = {
  accountId: EMPTY_ID,
  name: "Stride Pilot – New account",
  currency: "USD",
  timeZone: "Asia/Riyadh",
  businessId: PORTFOLIO.id,
  opportunityScore: 0,
};

export const PORTFOLIO_CHOICES: MetaPortfolioChoice[] = [{ portfolio: PORTFOLIO, accounts: [MAIN_ACCOUNT, SECOND_ACCOUNT, EMPTY_ACCOUNT] }];

// ─── Deterministic random ───────────────────────────────────────────────────

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type SeriesProfile = {
  seed: number;
  objective: Objective;
  /** Daily spend the campaign aims for. */
  budget: number;
  cpm: number;
  ctr: number;
  /** Impressions per person reached, per day. */
  freq: number;
  lpvRate: number;
  atcRate: number;
  cvr: number;
  aov: number;
  leadRate?: number;
  hook: number;
  hold: number;
  engRate: number;
  /** Daily growth across the window. */
  trend: number;
  startedDaysAgo: number;
  pausedDaysAgo?: number;
};

const DAYS = 120;

function series(p: SeriesProfile, today: string): MetaDailyPoint[] {
  const rand = rng(p.seed);
  const points: MetaDailyPoint[] = [];
  for (let i = DAYS; i >= 1; i--) {
    const date = addDays(today, -i);
    const blank = { date, spend: 0, impressions: 0, reach: 0, linkClicks: 0, landingPageViews: 0, results: 0, purchases: 0, purchaseValue: 0, leads: 0, addToCart: 0, video3s: 0, thruPlays: 0, engagements: 0 };
    if (i > p.startedDaysAgo || (p.pausedDaysAgo !== undefined && i <= p.pausedDaysAgo)) {
      points.push(blank);
      continue;
    }
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    // Gulf weekend: Friday and Saturday shop more.
    const weekly = dow === 5 || dow === 6 ? 1.14 : dow === 0 ? 1.04 : 0.96;
    const growth = 1 + p.trend * (DAYS - i);
    const spend = Math.round(p.budget * (0.92 + rand() * 0.08) * 100) / 100;
    const cpm = p.cpm * (0.9 + rand() * 0.2) / weekly / growth;
    const impressions = Math.round((spend / cpm) * 1000);
    const linkClicks = Math.round(impressions * p.ctr * (0.9 + rand() * 0.2));
    const landingPageViews = Math.round(linkClicks * p.lpvRate * (0.95 + rand() * 0.1));
    const addToCart = Math.round(landingPageViews * p.atcRate * (0.8 + rand() * 0.4));
    const purchases = Math.round(landingPageViews * p.cvr * (0.75 + rand() * 0.5) * 10) / 10;
    const purchaseValue = Math.round(purchases * p.aov * (0.85 + rand() * 0.3) * 100) / 100;
    const leads = Math.round((p.leadRate ?? 0) * linkClicks * (0.75 + rand() * 0.5) * 10) / 10;
    const video3s = Math.round(impressions * p.hook * (0.9 + rand() * 0.2));
    const thruPlays = Math.round(video3s * p.hold * (0.9 + rand() * 0.2));
    const engagements = Math.round(impressions * p.engRate * (0.85 + rand() * 0.3));
    const reach = Math.round(impressions / (p.freq * (0.92 + rand() * 0.16)));
    const results =
      p.objective === "SALES" ? purchases : p.objective === "LEADS" ? leads : p.objective === "TRAFFIC" ? landingPageViews : p.objective === "AWARENESS" ? reach : p.objective === "ENGAGEMENT" ? engagements : linkClicks;
    points.push({ date, spend, impressions, reach, linkClicks, landingPageViews, results, purchases, purchaseValue, leads, addToCart, video3s, thruPlays, engagements });
  }
  return points;
}

// ─── Builders ───────────────────────────────────────────────────────────────

/** The day the demo data is built for; default creation dates are relative to it so ages stay realistic. */
let REF = isoDay(new Date());
const daysAgoIso = (n: number) => `${addDays(REF, -n)}T09:00:00Z`;

const LOCS = [
  { id: "2682", name: "Saudi Arabia", kind: "Country" as const },
  { id: "2784", name: "United Arab Emirates", kind: "Country" as const },
];

function targeting(t: Partial<AdSetTargeting> = {}): AdSetTargeting {
  return { advantageAudience: false, locations: LOCS, ageMin: 18, ageMax: 65, genders: "ALL", languages: ["Arabic", "English"], includeAudienceIds: [], excludeAudienceIds: [], detailed: [], ...t };
}

function campaign(c: Partial<MetaCampaign> & Pick<MetaCampaign, "id" | "name" | "objective">): MetaCampaign {
  return {
    advantageState: "MANUAL",
    buyingType: "AUCTION",
    specialAdCategories: [],
    status: "ACTIVE",
    delivery: "ACTIVE",
    bidStrategy: "LOWEST_COST_WITHOUT_CAP",
    startDate: "2026-05-01",
    labels: [],
    createdAt: daysAgoIso(100),
    ...c,
  };
}

function adSet(s: Partial<AdSet> & Pick<AdSet, "id" | "campaignId" | "name">): AdSet {
  return {
    status: "ACTIVE",
    delivery: "ACTIVE",
    conversionLocation: "WEBSITE",
    optimizationGoal: "OFFSITE_CONVERSIONS",
    promotedObject: { datasetId: "ds_1893", event: "PURCHASE" },
    attribution: "CLICK_7_VIEW_1",
    startDate: "2026-05-01",
    targeting: targeting(),
    placements: { advantage: true, manual: [] },
    learning: { phase: "SUCCESS", events: 120, target: 50 },
    createdAt: daysAgoIso(90),
    ...s,
  };
}

const COPY = {
  heat: { texts: ["Built for 40°C runs. Heat-tested comfort that keeps up in the Gulf summer.", "Your long run doesn't stop for the weather. Neither should your shoes."], heads: ["Built for the heat", "Run cooler. Run longer."] },
  ugc: { texts: ["I ran Riyadh at noon in these. Here's what happened.", "Real runners, real heat. Free 2-day delivery across KSA and UAE."], heads: ["See why runners switch", "Free 2-day delivery"] },
  founder: { texts: ["We built Stride in the Gulf for people who train in the heat."], heads: ["Made for Gulf runners"] },
  offer: { texts: ["Free delivery in 2 days. 30-day free returns. Shop Stride today.", "Try them. Love them or send them back, free."], heads: ["Free delivery. Free returns.", "Shop Stride"] },
  detail: { texts: ["Meet Glide 3: our lightest, coolest running shoe yet."], heads: ["Meet Glide 3", "Lightweight comfort"] },
  ramadan: { texts: ["Ramadan nights are for moving. Stride is with you."], heads: ["Move this Ramadan"] },
};

function ad(a: Partial<MetaAd> & Pick<MetaAd, "id" | "adSetId" | "name" | "format"> & { copy?: { texts: string[]; heads: string[] } }): MetaAd {
  const { copy, ...rest } = a;
  const c = copy ?? COPY.heat;
  return {
    status: "ACTIVE",
    delivery: "ACTIVE",
    review: "APPROVED",
    identity: { pageName: DEMO_PAGE.name, instagramHandle: DEMO_INSTAGRAM.handle },
    primaryTexts: c.texts,
    headlines: c.heads,
    cta: "SHOP_NOW",
    link: `https://${DEMO_DOMAIN}/collections/running`,
    urlParams: "utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.name}}",
    mediaIds: [],
    enhancements: { TEXT_IMPROVEMENTS: true, VISUAL_TOUCH_UPS: true },
    rankings: { quality: "AVERAGE", engagement: "AVERAGE", conversion: "AVERAGE" },
    createdAt: daysAgoIso(40),
    ...rest,
  };
}

// ─── Shared static pieces ───────────────────────────────────────────────────

const CONCEPTS: CreativeConcept[] = [
  { id: "cn_heat", name: "Heat-tested", angle: "Product proof", hook: "Built for 40°C runs" },
  { id: "cn_ugc", name: "First run (UGC)", angle: "Social proof", hook: "I ran Riyadh at noon in these" },
  { id: "cn_founder", name: "Founder story", angle: "Brand", hook: "Why we built Stride in the Gulf" },
  { id: "cn_offer", name: "Free delivery & returns", angle: "Offer", hook: "Free 2-day delivery. 30-day returns." },
  { id: "cn_detail", name: "Glide 3 detail", angle: "Product detail", hook: "Meet Glide 3" },
  { id: "cn_ramadan", name: "Ramadan brand film", angle: "Seasonal", hook: "Ramadan nights are for moving" },
];

function cr(id: string, name: string, kind: CreativeAsset["kind"], ratio: CreativeAsset["ratio"], conceptId: string, daysOld: number, durationSec?: number, today = isoDay(new Date())): CreativeAsset {
  return { id, name, kind, ratio, conceptId, durationSec, createdAt: `${addDays(today, -daysOld)}T09:00:00Z` };
}

function creatives(today: string): CreativeAsset[] {
  return [
    cr("cr_heat_v", "Heat test – runner at noon", "VIDEO", "9:16", "cn_heat", 14, 22, today),
    cr("cr_heat_i", "Heat test – shoe on hot asphalt", "IMAGE", "4:5", "cn_heat", 40, undefined, today),
    cr("cr_ugc_v1", "UGC – Layla's first run", "VIDEO", "9:16", "cn_ugc", 21, 18, today),
    cr("cr_ugc_v2", "UGC – Omar, 10K unboxing", "VIDEO", "9:16", "cn_ugc", 9, 25, today),
    cr("cr_ugc_i", "UGC – before the run", "IMAGE", "1:1", "cn_ugc", 55, undefined, today),
    cr("cr_founder_v", "Founder – why Stride", "VIDEO", "1:1", "cn_founder", 70, 41, today),
    cr("cr_offer_i1", "Offer – free delivery badge", "IMAGE", "1:1", "cn_offer", 98, undefined, today),
    cr("cr_offer_i2", "Offer – free returns", "IMAGE", "4:5", "cn_offer", 62, undefined, today),
    cr("cr_detail_c1", "Glide 3 – side view", "IMAGE", "1:1", "cn_detail", 35, undefined, today),
    cr("cr_detail_c2", "Glide 3 – sole", "IMAGE", "1:1", "cn_detail", 35, undefined, today),
    cr("cr_detail_c3", "Glide 3 – upper mesh", "IMAGE", "1:1", "cn_detail", 35, undefined, today),
    cr("cr_ramadan_v", "Ramadan film – 30s", "VIDEO", "9:16", "cn_ramadan", 26, 30, today),
    cr("cr_ramadan_v2", "Ramadan film – cutdown", "VIDEO", "1:1", "cn_ramadan", 26, 15, today),
  ];
}

const aud = (a: Partial<MetaAudience> & Pick<MetaAudience, "id" | "name" | "kind" | "size" | "source">, today: string): MetaAudience => ({
  status: "READY",
  updatedAt: `${addDays(today, -2)}T08:00:00Z`,
  ...a,
});

function audiences(today: string): MetaAudience[] {
  return [
    aud({ id: "aud_web30", name: "Website visitors – 30 days", kind: "WEBSITE", size: 412_000, source: "Pixel + Conversions API", retentionDays: 30 }, today),
    aud({ id: "aud_atc14", name: "Added to cart – 14 days", kind: "WEBSITE", size: 38_500, source: "Pixel + Conversions API", retentionDays: 14 }, today),
    aud({ id: "aud_purchasers", name: "Purchasers – 180 days", kind: "WEBSITE", size: 61_200, source: "Pixel + Conversions API", retentionDays: 180 }, today),
    aud({ id: "aud_customers", name: "Customer list – VIP", kind: "CUSTOMER_LIST", size: 18_900, source: "customers_vip_2026.csv (match rate 71%)" }, today),
    aud({ id: "aud_ig_eng", name: "Instagram engagers – 90 days", kind: "ENGAGEMENT", size: 226_000, source: "@stride.sportswear", retentionDays: 90 }, today),
    aud({ id: "aud_video50", name: "Video viewers 50% – 60 days", kind: "ENGAGEMENT", size: 154_000, source: "Brand videos", retentionDays: 60 }, today),
    aud({ id: "aud_lead_open", name: "Lead form openers – 90 days", kind: "ENGAGEMENT", size: 4_100, source: "Corporate orders form", retentionDays: 90, status: "TOO_SMALL" }, today),
    aud({ id: "aud_catalog30", name: "Catalog viewers – 30 days", kind: "CATALOG", size: 187_000, source: "Stride Store Catalog", retentionDays: 30 }, today),
    aud({ id: "aud_lal1_ksa", name: "LAL 1% – Purchasers (KSA)", kind: "LOOKALIKE", size: 330_000, source: "Source: Purchasers – 180 days", lookalikePct: 1, seedAudienceId: "aud_purchasers" }, today),
    aud({ id: "aud_lal3_gcc", name: "LAL 3% – Purchasers (KSA, UAE)", kind: "LOOKALIKE", size: 1_240_000, source: "Source: Purchasers – 180 days", lookalikePct: 3, seedAudienceId: "aud_purchasers" }, today),
    aud({ id: "aud_runners", name: "Runners GCC 25–44", kind: "SAVED", size: 2_100_000, source: "Interests: Running, Marathon, Nike Run Club" }, today),
  ];
}

function products(): MetaProduct[] {
  const p = (id: string, title: string, brand: string, category: string, price: number, extra: Partial<MetaProduct> = {}): MetaProduct => ({
    id,
    title,
    brand,
    category,
    price,
    availability: "IN_STOCK",
    status: "ACTIVE",
    issues: [],
    share: 10,
    efficiency: 1,
    ...extra,
  });
  return [
    p("pr_glide3", "Glide 3 Running Shoe", "Stride", "Running shoes", 129, { share: 34, efficiency: 1.3 }),
    p("pr_glide3_trail", "Glide 3 Trail", "Stride", "Running shoes", 139, { share: 14, efficiency: 1.0 }),
    p("pr_heat_tee", "Heat Tee – Breathable", "Stride", "Gym wear", 35, { share: 12, efficiency: 0.9 }),
    p("pr_leggings", "Compression Leggings", "Stride", "Gym wear", 59, {
      share: 14,
      efficiency: 0.7,
      status: "ISSUES",
      issues: [
        { code: "image_too_small", label: "Image is smaller than 500 × 500 px", severity: "WARNING" },
        { code: "price_mismatch", label: "Price does not match the landing page", severity: "ERROR" },
      ],
    }),
    p("pr_kids_sprint", "Kids Sprint Shoe", "Stride", "Kids sportswear", 49, { share: 6, efficiency: 0.8, status: "REJECTED", issues: [{ code: "missing_availability", label: "Availability is missing", severity: "ERROR" }] }),
    p("pr_socks", "Performance Socks 3-pack", "Stride", "Sports accessories", 18, { share: 8, efficiency: 0.85, status: "ISSUES", issues: [{ code: "missing_category", label: "Missing Google product category", severity: "WARNING" }] }),
    p("pr_duffel", "Gym Duffel 40L", "Stride", "Sports accessories", 64, { share: 7, efficiency: 0.95 }),
    p("pr_cap", "Cooling Cap", "Stride", "Sports accessories", 24, { share: 5, efficiency: 0.8, availability: "OUT_OF_STOCK" }),
  ];
}

// ─── Organic posts ──────────────────────────────────────────────────────────

/** Small deterministic hash so post metrics look varied but never change between loads. */
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

type PostSeed = [day: number, hour: number, format: PostFormat, platforms: PostPlatform[], caption: string, media: string[] | string, extra?: Partial<OrganicPost>];

function post(id: string, [day, hour, format, platforms, caption, media, extra]: PostSeed, today: string, identity: OrganicPost["identity"], audience: number): OrganicPost {
  const status: PostStatus = extra?.status ?? (day < 0 || (day === 0 && hour < 12) ? "PUBLISHED" : "SCHEDULED");
  const video = format === "REEL" || format === "VIDEO" || format === "STORY";
  const labels = Array.isArray(media) ? media : [media];
  const h = hash(id);
  const reach = Math.round(audience * (format === "REEL" ? 0.22 : format === "STORY" ? 0.06 : 0.09) * (0.6 + (h % 80) / 100));
  const metrics =
    status === "PUBLISHED"
      ? {
          reach,
          impressions: Math.round(reach * (1.25 + (h % 30) / 100)),
          likes: Math.round(reach * (0.03 + (h % 25) / 1000)),
          comments: Math.round(reach * (0.002 + (h % 7) / 2000)),
          shares: Math.round(reach * (0.003 + (h % 9) / 2000)),
          saves: Math.round(reach * (0.004 + (h % 11) / 1500)),
          plays: video ? Math.round(reach * (1.6 + (h % 40) / 100)) : undefined,
        }
      : undefined;
  return {
    id,
    platforms,
    format,
    status,
    publishAt: `${addDays(today, day)}T${String(hour).padStart(2, "0")}:${h % 2 ? "30" : "00"}:00Z`,
    caption,
    media: labels.map((label, i) => ({ label, kind: video && i === 0 ? "VIDEO" : "IMAGE", durationSec: video && i === 0 ? (format === "STORY" ? 15 : 12 + (h % 40)) : undefined })),
    identity,
    metrics,
    createdBy: "USER",
    ...extra,
  };
}

const FB: PostPlatform[] = ["FACEBOOK"];
const IG: PostPlatform[] = ["INSTAGRAM"];
const BOTH: PostPlatform[] = ["FACEBOOK", "INSTAGRAM"];

function storePosts(today: string): OrganicPost[] {
  const identity = { pageName: DEMO_PAGE.name, instagramHandle: DEMO_INSTAGRAM.handle };
  const seeds: PostSeed[] = [
    [-27, 17, "REEL", IG, "3 stretches before every hot-weather run. Save this for tomorrow morning. #RunRiyadh", "Stretch routine reel"],
    [-25, 19, "POST", BOTH, "New in: Heat Tee in sand. Breathable mesh panels where you need them most.", "Heat Tee – sand"],
    [-23, 20, "STORY", IG, "Poll: sunrise run or night run?", "Sunrise vs night poll"],
    [-21, 18, "CAROUSEL", BOTH, "Glide 3, from sketch to street. Swipe to see how it was built.", ["Glide 3 sketch", "Glide 3 prototype", "Glide 3 final"]],
    [-19, 16, "VIDEO", FB, "Founder Q&A: why we built Stride in the Gulf. Full 4-minute chat.", "Founder Q&A"],
    [-17, 18, "REEL", BOTH, "POV: you ran 10K at noon in Riyadh. Layla tells all.", "Layla first run reel", { boostedAdId: "ad_asc_ugc" }],
    [-15, 20, "POST", IG, "Community long run this Friday, 5:30am, King Fahd Park. Who's in?", "Community run poster"],
    [-13, 19, "STORY", BOTH, "Behind the scenes at the Summer Drop shoot.", "Summer Drop BTS"],
    [-11, 17, "REEL", IG, "Unboxing the Glide 3 Trail. That sole though.", "Trail unboxing reel"],
    [-9, 18, "CAROUSEL", IG, "5 signs you need new running shoes. Number 4 surprises everyone.", ["Worn sole", "Heel drop", "Mileage count", "Knee check", "Upgrade"]],
    [-8, 21, "POST", IG, "Friday night playlist for your long run.", "Playlist cover", { status: "FAILED", error: "Instagram rejected the image: it is smaller than 320 px wide." }],
    [-7, 20, "POST", FB, "Free 2-day delivery is now live in Jeddah and Dammam too.", "Delivery map"],
    [-5, 18, "REEL", BOTH, "How Omar trained for his first 10K in 6 weeks.", "Omar 10K reel"],
    [-3, 19, "STORY", IG, "Flash sale ends tonight. Tap the link.", "Flash sale story", { link: `https://${DEMO_DOMAIN}/sale` }],
    [-2, 17, "POST", BOTH, "Summer Drop restock: the colours you asked for are back.", "Summer restock grid"],
    [-1, 20, "REEL", IG, "Hydration hacks for summer runs in under 30 seconds.", "Hydration hacks reel"],
    [0, 9, "STORY", IG, "Good morning, runners. Today's route: Diplomatic Quarter loop.", "Morning route story"],
    [0, 18, "REEL", BOTH, "Glide 3 vs 40°C: the heat test, uncut.", "Heat test uncut reel"],
    [1, 19, "POST", IG, "Meet the team behind Stride Kids.", "Stride Kids team"],
    [2, 18, "CAROUSEL", BOTH, "Your White Friday wishlist, sorted by sport.", ["Running wishlist", "Gym wishlist", "Kids wishlist"], { createdBy: "AGENT" }],
    [3, 20, "STORY", IG, "Countdown: White Friday preview starts soon.", "Countdown story", { createdBy: "AGENT" }],
    [4, 17, "VIDEO", FB, "Live replay: how to pick the right running shoe.", "Shoe fitting live"],
    [6, 18, "REEL", BOTH, "Early access drop for followers. Set a reminder.", "Early access reel"],
    [7, 19, "POST", BOTH, "White Friday preview: up to 30% off running shoes. Followers get it first.", "White Friday key visual", { createdBy: "AGENT" }],
    [9, 20, "STORY", BOTH, "White Friday is live. Swipe up to shop.", "White Friday live story"],
    [10, 18, "REEL", IG, "Packing 1,000 White Friday orders in 60 seconds.", "Warehouse rush reel", { status: "DRAFT" }],
    [12, 17, "POST", FB, "Thank you, 180K runners. A note from our founder.", "Founder thank you note"],
    [15, 19, "CAROUSEL", IG, "Winter training plan: 4 weeks, 3 runs a week.", ["Week 1", "Week 2", "Week 3", "Week 4"]],
    [18, 18, "REEL", BOTH, "Cold-morning layering for desert runs.", "Layering reel"],
  ];
  return seeds.map((s, i) => post(`post_${i + 1}`, s, today, identity, DEMO_INSTAGRAM.followers));
}

function kidsPosts(today: string): OrganicPost[] {
  const identity = { pageName: "Stride Kids", instagramHandle: "@stride.kids" };
  const seeds: PostSeed[] = [
    [-6, 17, "REEL", BOTH, "Sports day champions in Kids Sprint shoes.", "Sports day reel"],
    [-2, 18, "POST", IG, "Back-to-school bundle: shoes, socks and a bag.", "School bundle"],
    [3, 17, "STORY", IG, "Which colour should we make next?", "Colour poll story"],
    [8, 18, "CAROUSEL", BOTH, "Sizing guide for growing feet.", ["Size chart", "Fit check", "Room to grow"]],
  ];
  return seeds.map((s, i) => post(`kpost_${i + 1}`, s, today, identity, 41_700));
}

// ─── Demo store account ─────────────────────────────────────────────────────

export function buildDemoAccount(today = isoDay(new Date())): MetaAccountData {
  REF = today;
  const ago = (n: number) => addDays(today, -n);
  const iso = (n: number) => `${ago(n)}T09:00:00Z`;

  const campaigns: MetaCampaign[] = [
    campaign({
      id: "m_asc",
      name: "Advantage+ Sales – Always On",
      objective: "SALES",
      advantageState: "ADVANTAGE_PLUS",
      budget: { kind: "DAILY", amount: 140 },
      existingCustomerCap: 0.15,
      valueRuleIds: ["vr_uae", "vr_reels"],
      labels: ["Always on"],
      startDate: "2026-04-12",
    }),
    campaign({
      id: "m_prosp",
      name: "Prospecting – Running Shoes",
      objective: "SALES",
      bidStrategy: "COST_CAP",
      bidValue: 22,
      delivery: "LEARNING_LIMITED",
      labels: ["Prospecting"],
      startDate: "2026-05-20",
    }),
    campaign({
      id: "m_retarget",
      name: "Retargeting 30d – Catalog (DPA)",
      objective: "SALES",
      budget: { kind: "DAILY", amount: 45 },
      bidStrategy: "LOWEST_COST_WITH_MIN_ROAS",
      bidValue: 4,
      labels: ["Retargeting"],
      startDate: "2026-05-02",
    }),
    campaign({
      id: "m_leads",
      name: "Leads – Corporate Orders",
      objective: "LEADS",
      budget: { kind: "DAILY", amount: 35 },
      labels: ["B2B"],
      startDate: "2026-06-03",
    }),
    campaign({ id: "m_traffic", name: "Traffic – Summer Drop", objective: "TRAFFIC", labels: ["Seasonal"], startDate: "2026-06-18", stopDate: addDays(today, 24) }),
    campaign({
      id: "m_aware",
      name: "Awareness – Ramadan Brand Video",
      objective: "AWARENESS",
      budget: { kind: "DAILY", amount: 60 },
      labels: ["Brand"],
      startDate: "2026-05-28",
      stopDate: addDays(today, 30),
    }),
    campaign({ id: "m_engage", name: "Engagement – Reels", objective: "ENGAGEMENT", status: "PAUSED", delivery: "OFF", labels: ["Paused test"], startDate: "2026-04-01" }),
    // Approved and waiting for its start date: the calendar shows it as scheduled.
    campaign({
      id: "m_whitefriday",
      name: "Sales – White Friday Preview",
      objective: "SALES",
      delivery: "SCHEDULED",
      budget: { kind: "DAILY", amount: 90 },
      labels: ["Seasonal"],
      startDate: addDays(today, 9),
      stopDate: addDays(today, 19),
      createdAt: iso(2),
    }),
  ];

  const adSets: AdSet[] = [
    adSet({ id: "as_asc", campaignId: "m_asc", name: "Advantage+ audience – KSA & UAE", targeting: targeting({ advantageAudience: true, includeAudienceIds: ["aud_lal1_ksa", "aud_web30"], detailed: ["Running", "Fitness and wellness"] }), learning: { phase: "SUCCESS", events: 212, target: 50 } }),
    adSet({
      id: "as_lal",
      campaignId: "m_prosp",
      name: "LAL 1% Purchasers – KSA",
      budget: { kind: "DAILY", amount: 50 },
      bidStrategy: "COST_CAP",
      bidValue: 22,
      delivery: "LEARNING_LIMITED",
      learning: { phase: "LIMITED", events: 31, target: 50 },
      targeting: targeting({ locations: [LOCS[0]], includeAudienceIds: ["aud_lal1_ksa"], excludeAudienceIds: ["aud_purchasers"] }),
      placements: { advantage: false, manual: ["FB_FEED", "IG_FEED", "IG_REELS", "IG_STORIES", "FB_REELS"] },
    }),
    adSet({
      id: "as_int",
      campaignId: "m_prosp",
      name: "Interests – Runners 25–44",
      budget: { kind: "DAILY", amount: 40 },
      bidStrategy: "COST_CAP",
      bidValue: 22,
      learning: { phase: "SUCCESS", events: 78, target: 50 },
      targeting: targeting({ ageMin: 25, ageMax: 44, includeAudienceIds: ["aud_runners"], detailed: ["Running", "Marathon", "Nike Run Club"] }),
    }),
    adSet({
      id: "as_broad",
      campaignId: "m_prosp",
      name: "Broad – Women 18–34",
      budget: { kind: "DAILY", amount: 30 },
      bidStrategy: "COST_CAP",
      bidValue: 22,
      delivery: "LEARNING",
      learning: { phase: "LEARNING", events: 12, target: 50 },
      targeting: targeting({ ageMin: 18, ageMax: 34, genders: "WOMEN" }),
      startDate: ago(6),
    }),
    adSet({
      id: "as_ret_atc",
      campaignId: "m_retarget",
      name: "Added to cart 7d – no purchase",
      promotedObject: { datasetId: "ds_1893", event: "PURCHASE", productSetId: "ps_all" },
      targeting: targeting({ includeAudienceIds: ["aud_atc14"], excludeAudienceIds: ["aud_purchasers"] }),
      learning: { phase: "SUCCESS", events: 64, target: 50 },
    }),
    adSet({
      id: "as_ret_view",
      campaignId: "m_retarget",
      name: "Viewed content 30d – excl. purchasers",
      promotedObject: { datasetId: "ds_1893", event: "PURCHASE", productSetId: "ps_running" },
      targeting: targeting({ includeAudienceIds: ["aud_catalog30"], excludeAudienceIds: ["aud_purchasers", "aud_atc14"] }),
      learning: { phase: "SUCCESS", events: 52, target: 50 },
    }),
    adSet({
      id: "as_leads",
      campaignId: "m_leads",
      name: "Business owners KSA – Instant form",
      conversionLocation: "INSTANT_FORMS",
      optimizationGoal: "LEAD_GENERATION",
      promotedObject: { pageId: "pg_1042", leadFormId: "lf_corporate" },
      targeting: targeting({ locations: [LOCS[0]], ageMin: 28, ageMax: 60, detailed: ["Small business owners", "Corporate gifting"] }),
      learning: { phase: "SUCCESS", events: 66, target: 50 },
    }),
    adSet({
      id: "as_traf_main",
      campaignId: "m_traffic",
      name: "Broad – Summer Drop LPV",
      conversionLocation: "WEBSITE",
      optimizationGoal: "LANDING_PAGE_VIEWS",
      promotedObject: { pageId: "pg_1042" },
      // The one ad set that runs on a schedule: Meta only allows that with a lifetime budget (and an end date).
      budget: { kind: "LIFETIME", amount: 1200 },
      endDate: addDays(today, 24),
      schedule: [{ days: [0, 1, 2, 3, 4, 5, 6], startHour: 8, endHour: 24 }],
      placements: { advantage: false, manual: ["FB_FEED", "IG_FEED", "IG_STORIES", "FB_MARKETPLACE", "AN_NATIVE"] },
      learning: { phase: "SUCCESS", events: 190, target: 50 },
    }),
    adSet({
      id: "as_traf_ig",
      campaignId: "m_traffic",
      name: "Instagram only – Reels & Stories",
      optimizationGoal: "LANDING_PAGE_VIEWS",
      promotedObject: { pageId: "pg_1042" },
      budget: { kind: "DAILY", amount: 25 },
      placements: { advantage: false, manual: ["IG_REELS", "IG_STORIES", "IG_EXPLORE"] },
      targeting: targeting({ ageMin: 18, ageMax: 34 }),
      learning: { phase: "SUCCESS", events: 88, target: 50 },
    }),
    adSet({
      id: "as_aware",
      campaignId: "m_aware",
      name: "Reach – KSA & UAE 18–44",
      conversionLocation: "ON_AD",
      optimizationGoal: "REACH",
      promotedObject: { pageId: "pg_1042" },
      frequencyCap: { max: 3, days: 7 },
      targeting: targeting({ ageMin: 18, ageMax: 44 }),
      learning: { phase: "SUCCESS", events: 0, target: 50 },
    }),
    adSet({
      id: "as_eng",
      campaignId: "m_engage",
      name: "Reels engagers",
      status: "PAUSED",
      delivery: "OFF",
      conversionLocation: "ON_POST",
      optimizationGoal: "POST_ENGAGEMENT",
      promotedObject: { pageId: "pg_1042" },
      budget: { kind: "DAILY", amount: 20 },
      placements: { advantage: false, manual: ["IG_REELS", "FB_REELS"] },
      learning: { phase: "SUCCESS", events: 140, target: 50 },
    }),
    adSet({
      id: "as_wf",
      campaignId: "m_whitefriday",
      name: "LAL 3% + Instagram engagers – GCC",
      delivery: "SCHEDULED",
      startDate: addDays(today, 9),
      endDate: addDays(today, 19),
      targeting: targeting({ includeAudienceIds: ["aud_lal3_gcc", "aud_ig_eng"], excludeAudienceIds: ["aud_purchasers"] }),
      learning: { phase: "LEARNING", events: 0, target: 50 },
      createdAt: iso(2),
    }),
  ];

  const ads: MetaAd[] = [
    ad({ id: "ad_asc_heat", adSetId: "as_asc", name: "Heat test – runner at noon", format: "SINGLE_VIDEO", mediaIds: ["cr_heat_v"], conceptId: "cn_heat", copy: COPY.heat, rankings: { quality: "ABOVE_AVERAGE", engagement: "ABOVE_AVERAGE", conversion: "ABOVE_AVERAGE" } }),
    ad({ id: "ad_asc_ugc", adSetId: "as_asc", name: "UGC – Layla's first run", format: "SINGLE_VIDEO", mediaIds: ["cr_ugc_v1"], conceptId: "cn_ugc", copy: COPY.ugc, rankings: { quality: "ABOVE_AVERAGE", engagement: "AVERAGE", conversion: "ABOVE_AVERAGE" } }),
    ad({ id: "ad_asc_offer", adSetId: "as_asc", name: "Offer – free delivery badge", format: "SINGLE_IMAGE", mediaIds: ["cr_offer_i1"], conceptId: "cn_offer", copy: COPY.offer, rankings: { quality: "AVERAGE", engagement: "BELOW_AVERAGE", conversion: "BELOW_AVERAGE" }, createdAt: iso(98) }),
    ad({ id: "ad_asc_detail", adSetId: "as_asc", name: "Glide 3 detail carousel", format: "CAROUSEL", mediaIds: ["cr_detail_c1", "cr_detail_c2", "cr_detail_c3"], cards: [
      { mediaId: "cr_detail_c1", headline: "Meet Glide 3", link: `https://${DEMO_DOMAIN}/products/glide-3` },
      { mediaId: "cr_detail_c2", headline: "Cooler sole", link: `https://${DEMO_DOMAIN}/products/glide-3` },
      { mediaId: "cr_detail_c3", headline: "Breathable mesh", link: `https://${DEMO_DOMAIN}/products/glide-3` },
    ], conceptId: "cn_detail", copy: COPY.detail, rankings: { quality: "AVERAGE", engagement: "AVERAGE", conversion: "AVERAGE" } }),

    ad({ id: "ad_lal_ugc", adSetId: "as_lal", name: "UGC – Omar, 10K unboxing", format: "SINGLE_VIDEO", mediaIds: ["cr_ugc_v2"], conceptId: "cn_ugc", copy: COPY.ugc, rankings: { quality: "ABOVE_AVERAGE", engagement: "ABOVE_AVERAGE", conversion: "AVERAGE" }, createdAt: iso(9) }),
    ad({
      id: "ad_lal_heat_i",
      adSetId: "as_lal",
      name: "Heat test – shoe on hot asphalt",
      format: "SINGLE_IMAGE",
      mediaIds: ["cr_heat_i"],
      conceptId: "cn_heat",
      copy: { texts: ["Lose 5kg in a week with Glide 3. Your body will thank you.", "Are you overweight? Glide 3 fixes that."], heads: ["Lose 5kg in a week", "Burn more, faster"] },
      review: "REJECTED",
      delivery: "REJECTED",
      reviewReason: "Health and wellness: the copy promises unrealistic results ('Lose 5kg in a week') and implies a personal attribute ('Are you overweight?').",
      rankings: { quality: "UNKNOWN", engagement: "UNKNOWN", conversion: "UNKNOWN" },
    }),
    ad({ id: "ad_int_founder", adSetId: "as_int", name: "Founder – why Stride", format: "SINGLE_VIDEO", mediaIds: ["cr_founder_v"], conceptId: "cn_founder", copy: COPY.founder, rankings: { quality: "AVERAGE", engagement: "AVERAGE", conversion: "BELOW_AVERAGE" } }),
    ad({
      id: "ad_int_ugc",
      adSetId: "as_int",
      name: "UGC – before the run (music)",
      format: "SINGLE_VIDEO",
      mediaIds: ["cr_ugc_v1"],
      conceptId: "cn_ugc",
      copy: COPY.ugc,
      review: "LIMITED",
      reviewReason: "Intellectual property: the video uses licensed music, so it cannot run on Instagram Reels until the audio is replaced.",
      rankings: { quality: "AVERAGE", engagement: "AVERAGE", conversion: "AVERAGE" },
    }),
    ad({ id: "ad_broad_heat", adSetId: "as_broad", name: "Heat test – runner at noon (broad)", format: "SINGLE_VIDEO", mediaIds: ["cr_heat_v"], conceptId: "cn_heat", copy: COPY.heat, rankings: { quality: "UNKNOWN", engagement: "UNKNOWN", conversion: "UNKNOWN" }, createdAt: iso(6) }),

    ad({ id: "ad_ret_dpa", adSetId: "as_ret_atc", name: "Dynamic – cart abandoners", format: "CATALOG", productSetId: "ps_all", copy: COPY.offer, rankings: { quality: "ABOVE_AVERAGE", engagement: "AVERAGE", conversion: "ABOVE_AVERAGE" }, enhancements: { ENHANCE_CTA: true, ADD_OVERLAYS: true } }),
    ad({ id: "ad_ret_dpa2", adSetId: "as_ret_view", name: "Dynamic – running viewers", format: "CATALOG", productSetId: "ps_running", copy: COPY.detail, rankings: { quality: "AVERAGE", engagement: "AVERAGE", conversion: "AVERAGE" } }),

    ad({ id: "ad_leads_img", adSetId: "as_leads", name: "Corporate orders – free returns", format: "SINGLE_IMAGE", mediaIds: ["cr_offer_i2"], conceptId: "cn_offer", cta: "GET_QUOTE", copy: { texts: ["Outfit your whole team. Custom Stride kits from 10 pairs. Get a quote in one tap."], heads: ["Team kits from 10 pairs"] }, rankings: { quality: "AVERAGE", engagement: "AVERAGE", conversion: "ABOVE_AVERAGE" } }),
    ad({ id: "ad_leads_vid", adSetId: "as_leads", name: "Corporate orders – founder", format: "SINGLE_VIDEO", mediaIds: ["cr_founder_v"], conceptId: "cn_founder", cta: "GET_QUOTE", copy: COPY.founder, rankings: { quality: "AVERAGE", engagement: "BELOW_AVERAGE", conversion: "AVERAGE" } }),

    ad({ id: "ad_traf_ugc", adSetId: "as_traf_main", name: "Summer Drop – UGC", format: "SINGLE_VIDEO", mediaIds: ["cr_ugc_v2"], conceptId: "cn_ugc", cta: "LEARN_MORE", link: `https://${DEMO_DOMAIN}/collections/summer-drop`, copy: COPY.ugc, rankings: { quality: "ABOVE_AVERAGE", engagement: "ABOVE_AVERAGE", conversion: "AVERAGE" } }),
    ad({
      id: "ad_traf_partner",
      adSetId: "as_traf_ig",
      name: "Partnership – Layla Runs",
      format: "SINGLE_VIDEO",
      mediaIds: ["cr_ugc_v1"],
      conceptId: "cn_ugc",
      cta: "LEARN_MORE",
      link: `https://${DEMO_DOMAIN}/collections/summer-drop`,
      copy: { texts: ["Layla's summer long-run kit, tested in 41°C. Tap to see what she wears."], heads: ["Layla's summer kit"] },
      identity: { pageName: DEMO_PAGE.name, instagramHandle: "@layla.runs" },
      partnership: { creatorName: "Layla Runs", creatorHandle: "@layla.runs", permission: "GRANTED" },
      rankings: { quality: "ABOVE_AVERAGE", engagement: "ABOVE_AVERAGE", conversion: "AVERAGE" },
    }),

    ad({ id: "ad_aware_film", adSetId: "as_aware", name: "Ramadan film – 30s", format: "SINGLE_VIDEO", mediaIds: ["cr_ramadan_v"], conceptId: "cn_ramadan", cta: "WATCH_MORE", copy: COPY.ramadan, rankings: { quality: "ABOVE_AVERAGE", engagement: "AVERAGE", conversion: "UNKNOWN" } }),
    ad({ id: "ad_aware_cut", adSetId: "as_aware", name: "Ramadan film – cutdown", format: "SINGLE_VIDEO", mediaIds: ["cr_ramadan_v2"], conceptId: "cn_ramadan", cta: "WATCH_MORE", copy: COPY.ramadan, rankings: { quality: "AVERAGE", engagement: "AVERAGE", conversion: "UNKNOWN" } }),

    ad({ id: "ad_eng_reel", adSetId: "as_eng", name: "Reels – first run", format: "SINGLE_VIDEO", mediaIds: ["cr_ugc_v2"], conceptId: "cn_ugc", status: "PAUSED", delivery: "OFF", cta: "LEARN_MORE", copy: COPY.ugc, rankings: { quality: "AVERAGE", engagement: "ABOVE_AVERAGE", conversion: "UNKNOWN" } }),

    ad({ id: "ad_wf_offer", adSetId: "as_wf", name: "White Friday – up to 30% off", format: "SINGLE_IMAGE", mediaIds: ["cr_offer_i1"], conceptId: "cn_offer", delivery: "SCHEDULED", link: `https://${DEMO_DOMAIN}/white-friday`, copy: { texts: ["White Friday preview: up to 30% off running shoes. Followers shop first."], heads: ["Up to 30% off", "Early access"] }, rankings: { quality: "UNKNOWN", engagement: "UNKNOWN", conversion: "UNKNOWN" }, createdAt: iso(2) }),
    ad({ id: "ad_wf_heat", adSetId: "as_wf", name: "White Friday – heat test reel", format: "SINGLE_VIDEO", mediaIds: ["cr_heat_v"], conceptId: "cn_heat", delivery: "SCHEDULED", link: `https://${DEMO_DOMAIN}/white-friday`, copy: COPY.heat, rankings: { quality: "UNKNOWN", engagement: "UNKNOWN", conversion: "UNKNOWN" }, createdAt: iso(2) }),
  ];

  const daily: Record<string, MetaDailyPoint[]> = {
    m_asc: series({ seed: 11, objective: "SALES", budget: 140, cpm: 9.4, ctr: 0.0158, freq: 1.7, lpvRate: 0.82, atcRate: 0.15, cvr: 0.072, aov: 112, hook: 0.31, hold: 0.22, engRate: 0.024, trend: 0.0035, startedDaysAgo: 112 }, today),
    m_prosp: series({ seed: 23, objective: "SALES", budget: 120, cpm: 11.8, ctr: 0.0124, freq: 2.6, lpvRate: 0.78, atcRate: 0.11, cvr: 0.041, aov: 108, hook: 0.28, hold: 0.19, engRate: 0.02, trend: -0.001, startedDaysAgo: 75 }, today),
    m_retarget: series({ seed: 37, objective: "SALES", budget: 45, cpm: 14.2, ctr: 0.021, freq: 4.4, lpvRate: 0.86, atcRate: 0.2, cvr: 0.105, aov: 118, hook: 0.1, hold: 0.12, engRate: 0.012, trend: 0.0012, startedDaysAgo: 110 }, today),
    m_leads: series({ seed: 41, objective: "LEADS", budget: 35, cpm: 12.6, ctr: 0.0139, freq: 2.1, lpvRate: 0.7, atcRate: 0, cvr: 0, leadRate: 0.075, aov: 0, hook: 0.22, hold: 0.17, engRate: 0.016, trend: 0.0008, startedDaysAgo: 60 }, today),
    m_traffic: series({ seed: 53, objective: "TRAFFIC", budget: 65, cpm: 6.1, ctr: 0.0214, freq: 1.9, lpvRate: 0.73, atcRate: 0.06, cvr: 0.012, aov: 96, hook: 0.34, hold: 0.2, engRate: 0.031, trend: 0.002, startedDaysAgo: 45 }, today),
    m_aware: series({ seed: 67, objective: "AWARENESS", budget: 60, cpm: 4.3, ctr: 0.0062, freq: 2.8, lpvRate: 0.6, atcRate: 0, cvr: 0, aov: 0, hook: 0.46, hold: 0.31, engRate: 0.018, trend: 0.0006, startedDaysAgo: 36 }, today),
    m_engage: series({ seed: 79, objective: "ENGAGEMENT", budget: 20, cpm: 5.2, ctr: 0.009, freq: 2.2, lpvRate: 0.6, atcRate: 0, cvr: 0, aov: 0, hook: 0.38, hold: 0.24, engRate: 0.052, trend: 0, startedDaysAgo: 100, pausedDaysAgo: 22 }, today),
  };

  const weights: MetaAccountData["weights"] = {
    // Ad sets of a campaign
    as_lal: { share: 42, efficiency: 0.8 },
    as_int: { share: 33, efficiency: 1.2 },
    as_broad: { share: 25, efficiency: 0.7 },
    as_ret_atc: { share: 58, efficiency: 1.25 },
    as_ret_view: { share: 42, efficiency: 0.75 },
    as_traf_main: { share: 62, efficiency: 1 },
    as_traf_ig: { share: 38, efficiency: 1.1 },
    as_asc: { share: 1, efficiency: 1 },
    as_leads: { share: 1, efficiency: 1 },
    as_aware: { share: 1, efficiency: 1 },
    as_eng: { share: 1, efficiency: 1 },
    // Ads of an ad set
    ad_asc_heat: { share: 38, efficiency: 1.35 },
    ad_asc_ugc: { share: 30, efficiency: 1.2 },
    ad_asc_offer: { share: 20, efficiency: 0.6 },
    ad_asc_detail: { share: 12, efficiency: 0.9 },
    ad_lal_ugc: { share: 100, efficiency: 1 },
    ad_int_founder: { share: 70, efficiency: 0.9 },
    ad_int_ugc: { share: 30, efficiency: 1.1 },
    ad_ret_dpa: { share: 100, efficiency: 1 },
    ad_ret_dpa2: { share: 100, efficiency: 1 },
    ad_leads_img: { share: 62, efficiency: 1.2 },
    ad_leads_vid: { share: 38, efficiency: 0.7 },
    ad_traf_ugc: { share: 100, efficiency: 1 },
    ad_traf_partner: { share: 100, efficiency: 1 },
    ad_aware_film: { share: 65, efficiency: 1 },
    ad_aware_cut: { share: 35, efficiency: 1 },
    ad_broad_heat: { share: 100, efficiency: 1 },
    ad_eng_reel: { share: 100, efficiency: 1 },
  };

  const alerts: Alert[] = [
    { id: "al1", at: `${ago(1)}T07:40:00Z`, severity: "WARNING", title: "Prospecting – Running Shoes is learning limited", body: "LAL 1% Purchasers got 31 results in 7 days, below the 50 needed. Delivery is less stable and costs are higher.", campaignId: "m_prosp", read: false, prompt: "Why is Prospecting – Running Shoes learning limited and how do I fix it?" },
    { id: "al2", at: `${ago(1)}T06:05:00Z`, severity: "CRITICAL", title: "An ad was rejected", body: "Heat test – shoe on hot asphalt was rejected for Health and wellness. Its ad set is delivering with fewer ads.", campaignId: "m_prosp", read: false, prompt: "Why was my ad rejected and how do I fix it?" },
    { id: "al3", at: `${ago(2)}T09:12:00Z`, severity: "WARNING", title: "Creative fatigue on Offer – free delivery badge", body: "Frequency is climbing and link CTR has fallen over the last weeks in Advantage+ Sales.", campaignId: "m_asc", read: true, prompt: "Which creatives are fatigued and what should replace them?" },
    { id: "al4", at: `${ago(3)}T10:30:00Z`, severity: "INFO", title: "Spending limit at 70%", body: "The account has used 70% of its spending limit. At the current pace it is reached in about 5 weeks.", read: true, prompt: "How long until I hit my spending limit?" },
  ];

  const opportunities: Opportunity[] = [
    {
      id: "op_fatigue",
      category: "CREATIVE",
      title: "Replace the fatigued free-delivery image",
      description: "Frequency is climbing and link CTR has dropped. New concepts reach more people than another variant of the same image.",
      scoreGain: 6,
      status: "OPEN",
      entityLabel: "Offer – free delivery badge",
      ops: [{ kind: "status.set", entity: "AD", ids: ["ad_asc_offer"], status: "PAUSED" }],
      prompt: "Which creatives are fatigued and what should replace them?",
    },
    {
      id: "op_consolidate",
      category: "BUDGET",
      title: "Consolidate the learning-limited ad sets",
      description: "LAL 1% Purchasers cannot reach 50 results a week alone. Merging the broad ad set's budget into the interests ad set gives it enough signal.",
      scoreGain: 8,
      status: "OPEN",
      entityLabel: "Prospecting – Running Shoes",
      ops: [
        { kind: "status.set", entity: "AD_SET", ids: ["as_broad"], status: "PAUSED" },
        { kind: "budget.update", entity: "AD_SET", id: "as_int", budget: { kind: "DAILY", amount: 60 } },
      ],
      prompt: "Why is Prospecting – Running Shoes learning limited?",
    },
    {
      id: "op_exclude",
      category: "AUDIENCE",
      title: "Exclude existing customers from prospecting",
      description: "Purchasers from the last 180 days are not excluded from two prospecting ad sets, so part of the budget goes to people who already bought.",
      scoreGain: 5,
      status: "OPEN",
      entityLabel: "Interests – Runners 25–44, Broad – Women 18–34",
      ops: [
        { kind: "targeting.update", adSetId: "as_int", patch: { excludeAudienceIds: ["aud_purchasers"] } },
        { kind: "targeting.update", adSetId: "as_broad", patch: { excludeAudienceIds: ["aud_purchasers"] } },
      ],
      prompt: "Exclude my existing customers from prospecting",
    },
    {
      id: "op_emq",
      category: "MEASUREMENT",
      title: "Raise Purchase Event Match Quality",
      description: "Purchase events score 6.1 of 10. Sending email, phone and external ID through the Conversions API usually lifts it above 8 and improves optimization.",
      scoreGain: 7,
      status: "OPEN",
      entityLabel: "Stride Dataset · Purchase",
      prompt: "Check my Pixel, Conversions API and Event Match Quality",
    },
    {
      id: "op_placements",
      category: "PLACEMENTS",
      title: "Turn on Advantage+ placements for Traffic",
      description: "Broad – Summer Drop LPV uses a hand-picked list. Advantage+ placements usually lowers cost per landing page view by letting Meta shift budget to the cheapest placement.",
      scoreGain: 4,
      status: "OPEN",
      entityLabel: "Broad – Summer Drop LPV",
      ops: [{ kind: "adSet.update", adSetId: "as_traf_main", patch: { placements: { advantage: true, manual: [] } } }],
      prompt: "Analyse my placements and tell me where to shift budget",
    },
    {
      id: "op_rejected",
      category: "CREATIVE",
      title: "Rewrite and resubmit the rejected ad",
      description: "Replace the health claims with copy about comfort and heat, then ask Meta to review it again.",
      scoreGain: 3,
      status: "OPEN",
      entityLabel: "Heat test – shoe on hot asphalt",
      ops: [
        {
          kind: "ad.update",
          adId: "ad_lal_heat_i",
          patch: { primaryTexts: ["Built for 40°C runs. Heat-tested comfort that keeps up in the Gulf summer."], headlines: ["Built for the heat", "Run cooler. Run longer."] },
        },
        { kind: "policy.requestReview", issueId: "pi_rejected" },
      ],
      prompt: "Why was my ad rejected and how do I fix it?",
    },
  ];

  return {
    account: MAIN_ACCOUNT,
    portfolio: PORTFOLIO,
    campaigns,
    adSets,
    ads,
    creatives: creatives(today),
    concepts: CONCEPTS,
    audiences: audiences(today),
    products: products(),
    productSets: [
      { id: "ps_all", name: "All products", rule: "All available products", count: 214 },
      { id: "ps_running", name: "Running shoes", rule: "Category = Running shoes", count: 38 },
      { id: "ps_bestsellers", name: "Bestsellers", rule: "Custom label 0 = bestseller", count: 24 },
    ],
    datasets: [
      {
        id: "ds_1893",
        name: "Stride Dataset",
        pixelId: "1893847221455",
        capiConnected: true,
        capiSource: "Shopify Conversions API",
        lastReceived: new Date(Date.now() - 4 * 60_000).toISOString(),
        events: [
          { name: "PageView", count7d: 412_800, emq: 8.4, browserShare: 0.62, serverShare: 0.38, dedup: 0.96, status: "ACTIVE" },
          { name: "ViewContent", count7d: 188_300, emq: 7.9, browserShare: 0.6, serverShare: 0.4, dedup: 0.94, status: "ACTIVE" },
          { name: "AddToCart", count7d: 21_450, emq: 7.2, browserShare: 0.58, serverShare: 0.42, dedup: 0.93, status: "ACTIVE" },
          { name: "InitiateCheckout", count7d: 9_870, emq: 7.0, browserShare: 0.57, serverShare: 0.43, dedup: 0.92, status: "ACTIVE" },
          { name: "Purchase", count7d: 4_126, emq: 6.1, browserShare: 0.55, serverShare: 0.45, dedup: 0.81, status: "WARNING", issue: "Low match quality: most server events are missing phone and external ID. 19% of browser and server pairs are not deduplicated." },
          { name: "Lead", count7d: 312, emq: 8.8, browserShare: 0.3, serverShare: 0.7, dedup: 0.98, status: "ACTIVE" },
        ],
      },
    ],
    customConversions: [
      { id: "cc_highvalue", name: "High-value purchase", rule: "Purchase where value ≥ 150", datasetId: "ds_1893", baseEvent: "Purchase", status: "ACTIVE", count7d: 612 },
      { id: "cc_glide", name: "Glide 3 purchase", rule: "URL contains /products/glide-3", datasetId: "ds_1893", baseEvent: "Purchase", status: "ACTIVE", count7d: 1_480 },
    ],
    leadForms: [
      { id: "lf_corporate", name: "Corporate orders – instant form", type: "HIGHER_INTENT", status: "ACTIVE", questions: ["Company name", "Team size", "Work email", "Phone number"], privacyUrl: `https://${DEMO_DOMAIN}/privacy`, createdAt: iso(60) },
      { id: "lf_newsletter", name: "Summer Drop early access", type: "MORE_VOLUME", status: "ARCHIVED", questions: ["Full name", "Email"], privacyUrl: `https://${DEMO_DOMAIN}/privacy`, createdAt: iso(90) },
    ],
    leads: [
      { id: "ld1", formId: "lf_corporate", adId: "ad_leads_img", createdAt: iso(1), name: "Faisal Al-Harbi", email: "faisal@alharbi-logistics.sa", phone: "+966 55 120 4471", quality: "HIGH", status: "NEW" },
      { id: "ld2", formId: "lf_corporate", adId: "ad_leads_img", createdAt: iso(1), name: "Noura Al-Qahtani", email: "noura@riyadhclinics.sa", phone: "+966 50 331 8820", quality: "HIGH", status: "CONTACTED" },
      { id: "ld3", formId: "lf_corporate", adId: "ad_leads_vid", createdAt: iso(2), name: "Khalid M.", email: "khalid1994@gmail.com", phone: "+966 54 777 0912", quality: "LOW", status: "NEW" },
      { id: "ld4", formId: "lf_corporate", adId: "ad_leads_img", createdAt: iso(3), name: "Maryam Al-Zahrani", email: "m.zahrani@desertfit.sa", phone: "+966 56 904 2231", quality: "MEDIUM", status: "QUALIFIED" },
      { id: "ld5", formId: "lf_corporate", adId: "ad_leads_vid", createdAt: iso(4), name: "Sami", email: "sami.tech@hotmail.com", phone: "+966 59 000 1112", quality: "LOW", status: "LOST" },
      { id: "ld6", formId: "lf_corporate", adId: "ad_leads_img", createdAt: iso(5), name: "Rania Haddad", email: "rania@dubaiathletics.ae", phone: "+971 52 884 1190", quality: "HIGH", status: "QUALIFIED" },
      { id: "ld7", formId: "lf_corporate", adId: "ad_leads_img", createdAt: iso(6), name: "Yousef Karim", email: "y.karim@gulfbuild.ae", phone: "+971 50 223 5567", quality: "MEDIUM", status: "CONTACTED" },
      { id: "ld8", formId: "lf_corporate", adId: "ad_leads_vid", createdAt: iso(7), name: "Dana", email: "dana.w@yahoo.com", phone: "+966 53 618 2200", quality: "UNKNOWN", status: "NEW" },
    ],
    abTests: [
      {
        id: "ab_creative",
        name: "UGC video vs. product image",
        variable: "CREATIVE",
        status: "RUNNING",
        metric: "Cost per purchase",
        startDate: ago(12),
        endDate: addDays(today, 9),
        cells: [
          { name: "UGC video", adSetId: "as_lal", costPerResult: 21.4, budgetShare: 0.5 },
          { name: "Product image", adSetId: "as_int", costPerResult: 27.9, budgetShare: 0.5 },
        ],
        confidence: 0.84,
      },
      {
        id: "ab_audience",
        name: "Advantage+ audience vs. Lookalike 1%",
        variable: "AUDIENCE",
        status: "COMPLETED",
        metric: "Cost per purchase",
        startDate: ago(48),
        endDate: ago(20),
        cells: [
          { name: "Advantage+ audience", campaignId: "m_asc", costPerResult: 18.2, budgetShare: 0.5 },
          { name: "Lookalike 1%", campaignId: "m_prosp", costPerResult: 24.6, budgetShare: 0.5 },
        ],
        winner: "Advantage+ audience",
        confidence: 0.96,
      },
    ],
    liftStudies: [
      {
        id: "ls_conv",
        name: "Advantage+ Sales incrementality",
        kind: "CONVERSION_LIFT",
        status: "COMPLETED",
        startDate: ago(60),
        endDate: ago(32),
        campaignIds: ["m_asc"],
        controlPct: 10,
        metric: "Purchases",
        lift: 0.27,
        confidence: 0.95,
        incrementalResults: 1_184,
      },
      {
        id: "ls_brand",
        name: "Ramadan film – ad recall lift",
        kind: "BRAND_LIFT",
        status: "RUNNING",
        startDate: ago(21),
        endDate: addDays(today, 7),
        campaignIds: ["m_aware"],
        controlPct: 15,
        metric: "Ad recall",
        recallLiftPoints: 6.4,
        confidence: 0.82,
      },
      {
        id: "ls_planned",
        name: "Prospecting incrementality",
        kind: "CONVERSION_LIFT",
        status: "PLANNED",
        startDate: addDays(today, 6),
        endDate: addDays(today, 34),
        campaignIds: ["m_prosp"],
        controlPct: 10,
        metric: "Purchases",
      },
    ],
    rules: [
      { id: "ru_cpr", name: "Pause ad sets with cost per result above $45", scope: "AD_SET", condition: { metric: "costPerResult", op: ">", value: 45, window: "LAST_3_DAYS" }, action: "PAUSE", schedule: "DAILY", enabled: true, createdBy: "USER", lastRun: `${ago(0)}T05:00:00Z`, lastResult: "No ad sets matched" },
      { id: "ru_freq", name: "Notify when frequency passes 3.5", scope: "AD_SET", condition: { metric: "frequency", op: ">", value: 3.5, window: "LAST_7_DAYS" }, action: "NOTIFY", schedule: "DAILY", enabled: true, createdBy: "AGENT", lastRun: `${ago(0)}T05:00:00Z`, lastResult: "2 ad sets matched, notified" },
      { id: "ru_scale", name: "Raise budget 15% when ROAS stays above 5", scope: "CAMPAIGN", campaignId: "m_asc", condition: { metric: "roas", op: ">", value: 5, window: "LAST_7_DAYS" }, action: "INCREASE_BUDGET", amountPct: 15, schedule: "DAILY", enabled: false, createdBy: "AGENT" },
    ],
    alerts,
    opportunities,
    scheduledReports: [{ id: "sr1", name: "Weekly Meta performance", breakdown: "platform", metrics: ["spend", "results", "costPerResult", "roas"], frequency: "WEEKLY", recipients: ["marketing@stride-demo.com"], format: "PDF", nextRun: addDays(today, 3) }],
    blockLists: [
      { id: "bl_pub", name: "Low-quality publishers", kind: "PUBLISHER", entries: ["quickwin-games.example", "viral-news24.example", "daily-clickbait.example"], appliesTo: "ACCOUNT" },
      { id: "bl_apps", name: "Kids and gambling apps", kind: "APP", entries: ["com.casino.royale", "com.kidgames.fun"], appliesTo: "CAMPAIGNS" },
    ],
    brandSafety: { inventoryFilter: "MODERATE", excluded: ["POLITICS", "TRAGEDY"] },
    policyIssues: [
      { id: "pi_rejected", level: "AD", entityId: "ad_lal_heat_i", entityName: "Heat test – shoe on hot asphalt", policy: "Health and wellness", reason: "The copy promises unrealistic results and implies a personal attribute. Remove 'Lose 5kg in a week' and 'Are you overweight?'.", status: "REJECTED", detectedAt: `${ago(1)}T06:02:00Z` },
      { id: "pi_limited", level: "AD", entityId: "ad_int_ugc", entityName: "UGC – before the run (music)", policy: "Intellectual property", reason: "The video uses licensed music, so it cannot run on Instagram Reels. It still delivers on other placements.", status: "LIMITED", detectedAt: `${ago(4)}T11:20:00Z` },
    ],
    linkedAssets: [
      { id: "la_page", kind: "PAGE", name: DEMO_PAGE.name, externalId: DEMO_PAGE.id, status: "CONNECTED", detail: `${DEMO_PAGE.handle} · 184K followers` },
      { id: "la_ig", kind: "INSTAGRAM", name: DEMO_INSTAGRAM.handle ?? "", externalId: DEMO_INSTAGRAM.id, status: "CONNECTED", detail: "312K followers · linked to the Page" },
      { id: "la_wa", kind: "WHATSAPP", name: "Stride Support", externalId: "wa_9920", status: "NEEDS_ACTION", detail: "Business number needs verification before click-to-WhatsApp ads can run" },
      { id: "la_cat", kind: "CATALOG", name: "Stride Store Catalog", externalId: "cat_7701", status: "CONNECTED", detail: "214 products · synced 2 hours ago" },
      { id: "la_ds", kind: "DATASET", name: "Stride Dataset", externalId: "ds_1893", status: "CONNECTED", detail: "Pixel 1893847221455 + Conversions API" },
      { id: "la_domain", kind: "DOMAIN", name: DEMO_DOMAIN, externalId: "dom_501", status: "CONNECTED", detail: "Verified. Required for aggregated event measurement" },
    ],
    audienceSegments: { existingCustomerAudienceIds: ["aud_purchasers", "aud_customers"], engagedAudienceIds: ["aud_ig_eng"] },
    valueRules: [
      { id: "vr_uae", name: "Bid more for the UAE", dimension: "LOCATION", match: "United Arab Emirates", adjustmentPct: 20, status: "ACTIVE" },
      { id: "vr_reels", name: "Bid less on Audience Network", dimension: "PLACEMENT", match: "Audience Network", adjustmentPct: -30, status: "ACTIVE" },
    ],
    billing: {
      spendLimit: 25_000,
      amountSpent: 17_460,
      paymentLabel: "Visa ending 4417",
      balanceDue: 412.8,
      accountStatus: "ACTIVE",
    },
    daily,
    weights,
    posts: storePosts(today),
  };
}

// ─── Smaller accounts ───────────────────────────────────────────────────────

const NO_ACCOUNT_SAFETY = { inventoryFilter: "MODERATE" as const, excluded: [] };

/** An account with nothing in it yet: every screen has to cope with empty lists. */
export function buildEmptyAccount(): MetaAccountData {
  return emptyData(EMPTY_ACCOUNT);
}

function emptyData(account: MetaAccount): MetaAccountData {
  return {
    account,
    portfolio: PORTFOLIO,
    campaigns: [],
    adSets: [],
    ads: [],
    creatives: [],
    concepts: [],
    audiences: [],
    products: [],
    productSets: [],
    datasets: [],
    customConversions: [],
    leadForms: [],
    leads: [],
    abTests: [],
    liftStudies: [],
    rules: [],
    alerts: [],
    opportunities: [],
    scheduledReports: [],
    blockLists: [],
    brandSafety: NO_ACCOUNT_SAFETY,
    policyIssues: [],
    linkedAssets: [],
    audienceSegments: { existingCustomerAudienceIds: [], engagedAudienceIds: [] },
    valueRules: [],
    billing: { spendLimit: 0, amountSpent: 0, balanceDue: 0, accountStatus: "ACTIVE" },
    posts: [],
    daily: {},
    weights: {},
  };
}

/** A small second account: one Advantage+ Sales campaign, so switching accounts shows different data. */
export function buildSecondAccount(today = isoDay(new Date())): MetaAccountData {
  const base = emptyData(SECOND_ACCOUNT);
  const campaigns = [
    campaign({ id: "k_asc", name: "Kids – Advantage+ Sales", objective: "SALES", advantageState: "ADVANTAGE_PLUS", budget: { kind: "DAILY", amount: 40 }, startDate: "2026-06-10" }),
  ];
  const adSets = [adSet({ id: "k_as1", campaignId: "k_asc", name: "Advantage+ audience – GCC parents", promotedObject: { datasetId: "ds_kids", event: "PURCHASE" }, targeting: targeting({ advantageAudience: true, ageMin: 25, ageMax: 45 }), learning: { phase: "SUCCESS", events: 61, target: 50 } })];
  const ads = [
    ad({ id: "k_ad1", adSetId: "k_as1", name: "Kids sprint – UGC", format: "SINGLE_VIDEO", mediaIds: ["k_cr1"], conceptId: "k_cn1", identity: { pageName: "Stride Kids", instagramHandle: "@stride.kids" }, copy: COPY.ugc }),
  ];
  return {
    ...base,
    campaigns,
    adSets,
    ads,
    concepts: [{ id: "k_cn1", name: "Kids sprint", angle: "Social proof", hook: "Fast shoes for fast kids" }],
    creatives: [cr("k_cr1", "Kids sprint – UGC", "VIDEO", "9:16", "k_cn1", 20, 16, today)],
    datasets: [
      { id: "ds_kids", name: "Stride Kids Dataset", pixelId: "1893847229912", capiConnected: false, capiSource: "", lastReceived: new Date(Date.now() - 20 * 60_000).toISOString(), events: [{ name: "Purchase", count7d: 380, emq: 5.4, browserShare: 1, serverShare: 0, dedup: 1, status: "WARNING", issue: "Conversions API is not connected: events come from the browser only." }] },
    ],
    daily: { k_asc: series({ seed: 91, objective: "SALES", budget: 40, cpm: 8.9, ctr: 0.0149, freq: 1.8, lpvRate: 0.8, atcRate: 0.13, cvr: 0.058, aov: 52, hook: 0.3, hold: 0.2, engRate: 0.02, trend: 0.002, startedDaysAgo: 40 }, today) },
    weights: { k_as1: { share: 1, efficiency: 1 }, k_ad1: { share: 1, efficiency: 1 } },
    posts: kidsPosts(today),
    linkedAssets: [
      { id: "la_page", kind: "PAGE", name: "Stride Kids", externalId: "pg_1043", status: "CONNECTED", detail: "@stridekids · 28K followers" },
      { id: "la_ig", kind: "INSTAGRAM", name: "@stride.kids", externalId: "ig_5512", status: "CONNECTED", detail: "42K followers" },
    ],
    billing: { spendLimit: 5_000, amountSpent: 1_240, balanceDue: 96, accountStatus: "ACTIVE" },
    opportunities: [
      {
        id: "kop1",
        category: "MEASUREMENT",
        title: "Connect the Conversions API",
        description: "Only browser events reach Meta, so a large share of purchases is missed. Connecting it lifts Event Match Quality and optimization.",
        scoreGain: 9,
        status: "OPEN",
        entityLabel: "Stride Kids Dataset",
        prompt: "Check my Pixel, Conversions API and Event Match Quality",
      },
    ],
  };
}

/** Placement keys on by default when Advantage+ placements is on (used by previews and the editor). */
export const DEFAULT_PLACEMENTS: PlacementKey[] = ["FB_FEED", "FB_REELS", "FB_STORIES", "IG_FEED", "IG_REELS", "IG_STORIES", "IG_EXPLORE", "MESSENGER_INBOX"];

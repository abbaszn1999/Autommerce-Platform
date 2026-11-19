// Records the Meta App Review screencast on the REAL platform (meta-ads/app-review-screencast.md).
//
// A fresh, logged-out Chromium window (1440 × 900) is driven step by step and
// recorded. An English caption bar says what is shown and which permission it
// demonstrates. The script pauses only where a person must act: the Facebook
// login (you type your own password; this script never reads or stores it).
//
//   cd meta-ads/recording
//   npm install
//   cp .env.example .env.local   (fill it in)
//   npm run record
//
// Output: out/meta-app-review-<date>.mp4 (and the raw .webm).

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { openProfile, keepOnlyFacebook, SIZE } from "./browser.mjs";
import ffmpegPath from "ffmpeg-static";

const here = path.dirname(fileURLToPath(import.meta.url));

// ── Settings (.env.local; values are never printed) ───────────────────────────
const env = { ...process.env };
const envFile = path.join(here, ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith("#")) env[m[1]] = m[2];
  }
}
const BASE = (env.BASE_URL || "https://platform.autommerce.com").replace(/\/+$/, "");
const SLUG = env.WORKSPACE_SLUG || "";
if (!SLUG) {
  console.error("Set WORKSPACE_SLUG in .env.local (the part after /w/ in the address).");
  process.exit(1);
}
const OUT = path.join(here, "out");
fs.mkdirSync(OUT, { recursive: true });

const log = (msg) => console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Caption bar, on every page (Autommerce and Facebook) ──────────────────────
let caption = { title: "", text: "" };

const CAPTION_SCRIPT = () => {
  // Main page only: embedded frames (widgets) would draw a clipped copy in their corner.
  if (window !== window.top) return;
  const draw = async () => {
    try {
      // The floating agent button sits under the caption: hidden in the video (Vera is on the left).
      if (!document.getElementById("__review_style") && document.head) {
        const st = document.createElement("style");
        st.id = "__review_style";
        st.textContent = "[data-assistant-widget]{display:none!important}";
        document.head.appendChild(st);
      }
      const c = await window.__reviewCaption?.();
      let bar = document.getElementById("__review_caption");
      if (!c || !c.title) {
        bar?.remove();
        return;
      }
      if (!bar) {
        bar = document.createElement("div");
        bar.id = "__review_caption";
        bar.style.cssText =
          "position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483647;max-width:1100px;" +
          "background:rgba(17,17,28,.92);color:#fff;border-radius:14px;padding:10px 18px;font:500 15px/1.35 system-ui,Segoe UI,Arial;" +
          "box-shadow:0 8px 30px rgba(0,0,0,.35);pointer-events:none;text-align:center";
        (document.body || document.documentElement).appendChild(bar);
      }
      const html = `<div style="font-weight:700;font-size:16px">${c.title}</div>${c.text ? `<div style="opacity:.85;margin-top:2px">${c.text}</div>` : ""}`;
      if (bar.innerHTML !== html) bar.innerHTML = html;
    } catch {
      // Page navigating: drawn again on the next tick.
    }
  };
  setInterval(draw, 300);
};

async function say(title, text = "", holdMs = 2500) {
  caption = { title, text };
  log(`${title}${text ? ` — ${text}` : ""}`);
  await pause(holdMs);
}

// ── Helpers on the platform ─────────────────────────────────────────────────
async function highlight(page, locator, ms = 2500) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.evaluate((el) => {
    el.dataset.prevOutline = el.style.outline;
    el.style.outline = "3px solid #F76D01";
    el.style.outlineOffset = "3px";
    el.style.borderRadius = el.style.borderRadius || "12px";
  }).catch(() => {});
  await pause(ms);
  await locator.evaluate((el) => {
    el.style.outline = el.dataset.prevOutline || "";
  }).catch(() => {});
}

/** A native <select> opened as a visible list (OS dropdowns are not recorded). */
async function showList(locator, ms = 3000) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await locator.evaluate((el) => {
    el.size = Math.min(Math.max(el.options.length, 2), 7);
    el.style.height = "auto";
  });
  await pause(ms);
  await locator.evaluate((el) => {
    el.size = 0;
    el.style.height = "";
  });
}

/** Card section of the live panel, by its heading. */
const card = (page, title) => page.locator("section").filter({ has: page.getByRole("heading", { name: title }) }).first();

async function ask(page, text) {
  const box = page.getByPlaceholder(/Ask anything about|Describe what you want planned/).first();
  await box.click();
  await box.pressSequentially(text, { delay: 18 });
  await pause(500);
  await box.press("Enter");
}

/** Waits for Vera: either an approval card (Apply) or the end of her reply. Returns "card" | "done". */
async function waitForVera(page, { timeoutMs = 6 * 60 * 1000 } = {}) {
  const stop = page.getByRole("button", { name: "Stop" });
  await stop.waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
  const apply = page.getByRole("button", { name: /^Apply$/ }).last();
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await apply.isVisible().catch(() => false)) return "card";
    if (!(await stop.isVisible().catch(() => false))) return "done";
    await pause(800);
  }
  return "timeout";
}

/** Asks Vera for one change, shows the card, approves it, waits for the result. */
async function approvedChange(page, prompt, caption1, caption2) {
  await say(caption1.title, caption1.text, 800);
  await ask(page, prompt);
  const state = await waitForVera(page);
  if (state !== "card") {
    log(`  !! no approval card appeared (${state}). Continue by hand if needed; waiting 20 s.`);
    await pause(20_000);
    return false;
  }
  const apply = page.getByRole("button", { name: /^Apply$/ }).last();
  await apply.scrollIntoViewIfNeeded();
  await say(caption2.title, caption2.text, 3500);
  await apply.click();
  await waitForVera(page);
  await pause(3000);
  return true;
}

/**
 * Facebook Login for Business: clicks through the dialog (Continue as …, the
 * asset screens, Save, Got it) with a pause on each screen so it is readable.
 * If Facebook asks for a login, you type it; the script never fills it.
 */
async function walkFacebook(page) {
  const backHome = (u) => u.startsWith(BASE) && new URL(u).pathname.includes("/meta-ads");
  const button = page
    .getByRole("button", { name: /^(Continue( as .+)?|Next|Save|Allow|Got it|Done|Reconnect|Edit access)$/i })
    .filter({ visible: true });
  const deadline = Date.now() + 10 * 60 * 1000;
  let asked = false;
  while (Date.now() < deadline) {
    if (backHome(page.url())) return;
    if (/facebook\.com$/.test(new URL(page.url()).hostname)) {
      if (await page.locator('input[name="pass"]').isVisible().catch(() => false)) {
        if (!asked) log(">>> Facebook asks for a login: type it in the window.");
        asked = true;
      } else if (await button.count().catch(() => 0)) {
        await pause(3500); // the reviewer reads this screen
        if (backHome(page.url())) return;
        const b = button.first();
        const name = (await b.textContent().catch(() => ""))?.trim();
        await b.click({ timeout: 5000 }).then(() => log(`  Facebook: ${name}`)).catch(() => {});
        await pause(1500);
        continue;
      }
    }
    await pause(700);
  }
  throw new Error("Facebook login did not return to Autommerce within 10 minutes");
}

// ── Recording ────────────────────────────────────────────────────────────────
// Clean start: only Facebook's cookies stay; Autommerce is logged out.
{
  const prep = await openProfile();
  await keepOnlyFacebook(prep);
  const p = prep.pages()[0] ?? (await prep.newPage());
  await p.goto(`${BASE}/login`).catch(() => {});
  await p.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }).catch(() => {});
  // Facebook login BEFORE recording: you log in here, recording starts once you are in.
  const fbIn = async () => (await prep.cookies("https://www.facebook.com")).some((c) => c.name === "c_user");
  if (!(await fbIn())) {
    await p.goto("https://www.facebook.com/").catch(() => {});
    log(">>> Not recording yet. Log in to Facebook in the window; recording starts right after.");
    while (!(await fbIn())) await pause(1000);
    await pause(3000);
    log("Facebook login saved.");
  }
  await prep.close();
}
const context = await openProfile({ recordVideo: { dir: OUT, size: SIZE } });
await context.exposeFunction("__reviewCaption", () => caption);
await context.addInitScript(CAPTION_SCRIPT);
const blank = context.pages();
const page = await context.newPage();
for (const b of blank) {
  const v = b.video();
  await b.close().catch(() => {});
  await v?.delete().catch(() => {});
}
page.on("dialog", (d) => void d.accept());
const video = page.video();

try {
  // 1. Logged out → log in to Autommerce
  await page.goto(`${BASE}/login`);
  await say("Autommerce — Meta App Review demo", "Starting logged out. The app user logs in to Autommerce.", 3500);
  if (env.REVIEW_EMAIL && env.REVIEW_PASSWORD) {
    await page.locator('input[type="email"]').fill(env.REVIEW_EMAIL);
    await page.locator('input[type="password"]').fill(env.REVIEW_PASSWORD);
    await pause(800);
    await page.locator('button[type="submit"]').first().click();
  } else {
    await say("Log in to Autommerce", "Type the email and password in the window.", 0);
  }
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 5 * 60 * 1000 });
  await pause(1500);

  // 2. Meta Ads page (preview password if asked)
  await say("Open Meta Ads", "Autommerce's Meta Ads page, where the agent works on the advertiser's ad account.", 1000);
  // WORKSPACE_SLUG may be the slug or the workspace name shown on the card.
  const wsCard = page.getByRole("heading", { name: SLUG, exact: true }).or(page.getByText(SLUG, { exact: true })).first();
  if (await wsCard.waitFor({ timeout: 15_000 }).then(() => true, () => false)) {
    await highlight(page, wsCard, 1200);
    await wsCard.click();
    await page.waitForURL((u) => u.pathname.startsWith("/w/"), { timeout: 60_000 });
    const realSlug = new URL(page.url()).pathname.split("/")[2];
    await page.goto(`${BASE}/w/${realSlug}/meta-ads`);
  } else {
    await page.goto(`${BASE}/w/${SLUG}/meta-ads`);
  }
  const lock = page.locator('input[type="password"]');
  if (await lock.isVisible({ timeout: 4000 }).catch(() => false)) {
    if (env.PREVIEW_PASSWORD) {
      await lock.fill(env.PREVIEW_PASSWORD);
      await lock.press("Enter");
    } else {
      await say("Preview password", "Type the preview password in the window.", 0);
    }
    await page.getByRole("link", { name: "Connect with Facebook" }).waitFor({ timeout: 5 * 60 * 1000 });
  }

  // 3. Facebook Login for Business
  const connect = page.getByRole("link", { name: "Connect with Facebook" });
  await connect.waitFor({ timeout: 60_000 });
  await say("Connect Meta", "The user starts Facebook Login for Business. Autommerce never sees the Facebook password.", 4000);
  await highlight(page, connect, 2000);
  await connect.click();
  await say(
    "Facebook Login for Business",
    "The user logs in to Facebook, sees the permissions requested by Autommerce platform, chooses the assets to share and allows them.",
    0
  );
  await walkFacebook(page);

  // 4. Asset picker: businesses (business_management), Pages (pages_show_list)
  await page.getByText("Choose what Vera works on").waitFor({ timeout: 60_000 });
  await say("Permissions granted", "Back in Autommerce: the assets the user shared with the app.", 3000);
  const select = (label) => page.locator("label").filter({ has: page.locator("span", { hasText: new RegExp(`^${label}$`) }) }).locator("select");
  const pickers = [
    ["Business portfolio", "business_management: the user's business portfolios are listed in Autommerce.", env.BUSINESS_ID],
    ["Ad account", "ads_read / ads_management: the user's ad accounts.", env.AD_ACCOUNT_ID],
    ["Facebook Page", "pages_show_list: the Pages the user manages are connected to Autommerce.", env.PAGE_ID],
    ["Product catalog", "catalog_management: the user's product catalogs.", env.CATALOG_ID],
  ];
  for (const [label, text, id] of pickers) {
    const s = select(label);
    if (!(await s.count())) continue;
    await say(label, text, 300);
    await showList(s, 3200);
    if (id) await s.selectOption(id).catch(() => log(`  !! ${label}: id not in the list, kept the current choice`));
    else if (!(await s.inputValue().catch(() => "x"))) {
      // "— None —" selected: pick the first real one, so the video shows a connected asset.
      const first = await s.locator("option").evaluateAll((o) => o.map((x) => x.value).find(Boolean));
      if (first) await s.selectOption(first);
    }
  }
  await page.getByRole("button", { name: "Continue" }).click();

  // 5. The account, page by page (live data from Meta)
  const nav = (name) => page.getByRole("navigation", { name: "Meta Ads pages" }).getByRole("button", { name, exact: true });
  const open = async (name) => {
    await nav(name).click();
    await pause(1200);
  };
  await nav("Overview").waitFor({ timeout: 60_000 });
  await page.getByLabel("Period").selectOption("maximum");
  const kpis = page.getByTestId("meta-kpis");
  await kpis.waitFor({ timeout: 90_000 }).catch(() => {});
  await say("Ads performance (ads_read, ads_management)", "Account results read from Meta, all time: spend, impressions, reach, clicks, results.", 500);
  await highlight(page, kpis, 5000);

  await open("Campaigns");
  const campaigns = page.getByTestId("meta-campaigns");
  await campaigns.waitFor({ timeout: 60_000 }).catch(() => {});
  await say("Campaigns (ads_read)", "Every campaign with its delivery, impressions, reach, clicks, spend and results.", 500);
  await highlight(page, campaigns, 6000);

  await open("Page posts");
  await say("Page posts (pages_read_engagement)", "The content of the Page's posts, read from Meta and displayed in Autommerce.", 500);
  await highlight(page, page.getByTestId("meta-posts"), 5000);

  await open("Catalog");
  await say("Catalogs (catalog_management)", "The products of the selected catalog, and every catalog the user shared.", 500);
  await highlight(page, page.getByTestId("meta-products"), 3500);
  const catalogs = page.getByTestId("meta-catalogs");
  await highlight(page, catalogs, 3000);

  await open("Connection");
  const connected = card(page, "Connected Meta account");
  await say("Connected Meta account (business_management, pages_show_list)", "The connected business portfolio, ad account, Page and catalog, with the granted permissions.", 500);
  await highlight(page, connected, 5000);

  if (env.SKIP_AGENT !== "1") {
    // 6. Vera reads through Meta's ads MCP server
    await open("Campaigns");
    await approvedRead(page);

    // 7. A change, applied only after approval
    if (env.CAMPAIGN_TO_PAUSE) {
      await approvedChange(
        page,
        `Pause the campaign "${env.CAMPAIGN_TO_PAUSE}".`,
        { title: "Managing ads (ads_management, ads_mcp_management)", text: "The user asks the agent to pause a campaign." },
        { title: "Approval required", text: "The change is shown on a card and runs only after the user clicks Apply." }
      );
      await say("Change applied", "Meta applied the change; the campaign table refreshes from Meta.", 4000);
      await highlight(page, campaigns, 3000);
    } else if (env.CAMPAIGN_TO_RENAME) {
      // A paused or finished campaign: renamed, then the name put back. Nothing is spent.
      const name = env.CAMPAIGN_TO_RENAME.trim();
      const renamed = `${name} (reviewed)`;
      const ok = await approvedChange(
        page,
        `Rename the campaign "${name}" to "${renamed}".`,
        { title: "Managing ads (ads_management, ads_mcp_management)", text: "The user asks the agent to rename a campaign." },
        { title: "Approval required", text: "The change is shown on a card and runs only after the user clicks Apply." }
      );
      if (ok) {
        await page.getByRole("button", { name: /^Refresh/ }).first().click().catch(() => {});
        await say("Change applied", "Meta applied the change; the campaign table is read again from Meta.", 4000);
        await highlight(page, campaigns, 3000);
        await approvedChange(
          page,
          `Rename the campaign "${renamed}" back to "${name}".`,
          { title: "Undo the change (ads_management)", text: "The user asks the agent to put the old name back." },
          { title: "Approval required", text: "Again, it runs only after the user clicks Apply." }
        );
      }
    } else {
      log("  (CAMPAIGN_TO_PAUSE / CAMPAIGN_TO_RENAME not set: skipping the campaign change)");
    }

    // 8. Catalog: create, update, delete (catalog_management)
    await open("Catalog");
    await approvedChange(
      page,
      'Create a new product catalog called "Review Test Catalog".',
      { title: "Create a catalog (catalog_management)", text: "The user asks the agent to create a product catalog." },
      { title: "Approval required", text: "Create catalog: runs only after Apply." }
    );
    await highlight(page, catalogs, 3500);
    await approvedChange(
      page,
      'Rename the catalog "Review Test Catalog" to "Review Test Catalog 2".',
      { title: "Update the catalog (catalog_management)", text: "The user renames the catalog." },
      { title: "Approval required", text: "Update catalog: runs only after Apply." }
    );
    await highlight(page, catalogs, 3500);
    await approvedChange(
      page,
      'Delete the catalog "Review Test Catalog 2".',
      { title: "Delete the catalog (catalog_management)", text: "The user deletes the test catalog." },
      { title: "Approval required", text: "Delete catalog: permanent, runs only after Apply." }
    );
    await highlight(page, catalogs, 3500);
  } else {
    log("  (SKIP_AGENT=1: skipping Vera's steps)");
  }

  // 9. Disconnect = data deletion
  await open("Connection");
  const disconnect = page.getByRole("button", { name: "Disconnect" });
  await say("Disconnect", "The user removes Autommerce's access. The token, change history and Meta chats are deleted.", 500);
  await highlight(page, disconnect, 2500);
  await disconnect.click();
  await page.getByRole("link", { name: "Connect with Facebook" }).waitFor({ timeout: 60_000 });
  await say("Disconnected", "Access removed. The user can connect again at any time.", 4000);
  caption = { title: "", text: "" };
  await pause(1500);
} catch (error) {
  log(`Stopped: ${error.message}`);
} finally {
  await context.close();
}

async function approvedRead(p) {
  await say("The AI agent reads the account (ads_mcp_management, ads_read)", "The user asks the agent; it reads the ad account through Meta's ads MCP server.", 800);
  await ask(p, "Summarize my campaigns' performance over all time: spend, impressions, clicks and results, and the top 5 campaigns by spend.");
  await waitForVera(p);
  await pause(4000);
}

// ── Save as MP4 ──────────────────────────────────────────────────────────────
const webm = video ? await video.path() : null;
if (webm && fs.existsSync(webm)) {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const mp4 = path.join(OUT, `meta-app-review-${stamp}.mp4`);
  execFileSync(ffmpegPath, ["-y", "-i", webm, "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-an", mp4], { stdio: "ignore" });
  log(`Saved: ${mp4}`);
} else {
  log("No video was recorded.");
}

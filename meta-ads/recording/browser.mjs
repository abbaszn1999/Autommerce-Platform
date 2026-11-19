// The recorder's own browser profile (meta-ads/recording/.profile, git-ignored).
// Facebook stays logged in there (you log in once with `npm run facebook`);
// Autommerce is always logged out at the start of a recording.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
export const PROFILE = path.join(here, ".profile");
export const SIZE = { width: 1440, height: 900 };

export async function openProfile(extra = {}) {
  const options = {
    headless: false,
    viewport: SIZE,
    locale: "en-US",
    colorScheme: "light",
    args: [`--window-size=${SIZE.width + 16},${SIZE.height + 120}`, "--window-position=0,0", "--force-device-scale-factor=1", "--lang=en-US"],
    ignoreDefaultArgs: ["--enable-automation"],
    ...extra,
  };
  try {
    // Installed Google Chrome: Facebook trusts it more than the bundled Chromium.
    return await chromium.launchPersistentContext(PROFILE, { ...options, channel: "chrome" });
  } catch {
    return await chromium.launchPersistentContext(PROFILE, options);
  }
}

const META_DOMAINS = /(^|\.)(facebook\.com|fb\.com|meta\.com|messenger\.com|instagram\.com|fbcdn\.net)$/;

/** Removes every cookie except Facebook's: Autommerce starts logged out. */
export async function keepOnlyFacebook(context) {
  const kept = (await context.cookies()).filter((c) => META_DOMAINS.test(c.domain.replace(/^\./, "")));
  await context.clearCookies();
  if (kept.length) await context.addCookies(kept);
}

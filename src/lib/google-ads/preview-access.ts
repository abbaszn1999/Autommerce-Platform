import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Google Ads is a prototype shown only to people given its password. The
 * password is checked on the server; the browser then holds a signed cookie
 * it cannot forge. Set GOOGLE_ADS_PREVIEW_PASSWORD (there is no default).
 */

export const PREVIEW_COOKIE = "ga_preview";
export const PREVIEW_COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest();

const sameBytes = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);

/** There is no default password: without GOOGLE_ADS_PREVIEW_PASSWORD nobody can unlock the preview. */
export function isPreviewPassword(password: string): boolean {
  const configured = process.env.GOOGLE_ADS_PREVIEW_PASSWORD;
  if (!configured) return false;
  return sameBytes(sha256(password), sha256(configured));
}

/** The cookie value that grants access, signed with a server secret (and the password, so changing it signs everyone out). */
export function previewToken(): string | null {
  // Signed only with the dedicated key (never the database service key), and only when a password exists.
  const secret = process.env.INTEGRATION_ENCRYPTION_KEY;
  const password = process.env.GOOGLE_ADS_PREVIEW_PASSWORD;
  if (!secret || !password) return null;
  return createHmac("sha256", secret).update(`google-ads-preview:v1:${password}`).digest("base64url");
}

/** Launch day: set GOOGLE_ADS_LAUNCHED=1 and Google Ads opens to everyone, pages and API alike. */
export const googleAdsLaunched = () => process.env.GOOGLE_ADS_LAUNCHED === "1";

export function hasPreviewAccess(cookieValue: string | undefined): boolean {
  if (googleAdsLaunched()) return true;
  const token = previewToken();
  return !!token && !!cookieValue && sameBytes(Buffer.from(cookieValue), Buffer.from(token));
}

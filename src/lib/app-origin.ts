export const CANONICAL_APP_ORIGIN = "https://platform.autommerce.com";

export function getAppOrigin(): string {
  const fromEnv = (
    process.env.NEXT_PUBLIC_APP_ORIGIN ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ""
  ).replace(/\/+$/, "");
  return fromEnv || CANONICAL_APP_ORIGIN;
}

function isLoopbackHost(host: string): boolean {
  const hostname = host.split(":")[0]?.replace(/^\[|\]$/g, "").toLowerCase() ?? "";
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

/**
 * Public origin for auth redirects. Render binds to localhost:10000, so
 * `new URL(request.url).origin` is wrong in production and sends Google
 * sign-in back to the user's machine.
 */
export function publicOriginFromRequest(request: Request): string {
  const url = new URL(request.url);
  if (process.env.NODE_ENV === "development") {
    return url.origin;
  }

  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? "";
  const headerHost = request.headers.get("host")?.split(",")[0]?.trim() ?? "";
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() === "http" ? "http" : "https";

  if (forwardedHost && !isLoopbackHost(forwardedHost)) {
    return `${proto}://${forwardedHost}`;
  }
  if (headerHost && !isLoopbackHost(headerHost)) {
    return `${proto}://${headerHost}`;
  }
  if (!isLoopbackHost(url.host)) {
    return url.origin.startsWith("http://") && proto === "https"
      ? `https://${url.host}`
      : url.origin;
  }
  return getAppOrigin();
}

/** Hosts the app really runs on: the canonical origin and any listed in APP_ALLOWED_HOSTS (comma separated). */
function allowedHosts(): Set<string> {
  const hosts = new Set<string>();
  try {
    hosts.add(new URL(getAppOrigin()).host.toLowerCase());
  } catch {
    /* an unusable configured origin allows nothing extra */
  }
  for (const host of (process.env.APP_ALLOWED_HOSTS ?? "").split(",")) if (host.trim()) hosts.add(host.trim().toLowerCase());
  return hosts;
}

/**
 * Like publicOriginFromRequest, but never trusts a host the app does not run on:
 * a spoofed X-Forwarded-Host or Host header cannot point an OAuth callback at
 * another site. Development keeps the request origin.
 */
export function trustedOriginFromRequest(request: Request): string {
  const origin = publicOriginFromRequest(request);
  if (process.env.NODE_ENV === "development") return origin;
  try {
    return allowedHosts().has(new URL(origin).host.toLowerCase()) ? origin : getAppOrigin();
  } catch {
    return getAppOrigin();
  }
}
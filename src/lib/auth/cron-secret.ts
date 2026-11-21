import { timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export function cronSecretFromEnv(): string | null {
  const secret = process.env.JOBS_CRON_SECRET?.trim();
  return secret || null;
}

export function cronSecretMatches(
  request: Request,
  secret: string
): boolean {
  const presented = presentedBearer(request);
  const left = Buffer.from(presented);
  const right = Buffer.from(secret);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function presentedBearer(request: Request): string {
  return (
    request.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "")
      .trim() ?? ""
  );
}

/**
 * Authorizes a pg_cron call. Accepts the app env secret when it matches;
 * otherwise verifies the bearer against the Vault secret pg_cron sends
 * (verify_jobs_cron_secret, service_role only), so a missing or stale env var
 * can no longer silently switch a scheduled job off.
 */
export async function cronAuthorized(
  request: Request,
  admin: SupabaseClient
): Promise<boolean> {
  const secret = cronSecretFromEnv();
  if (secret && cronSecretMatches(request, secret)) return true;
  const presented = presentedBearer(request);
  if (!presented) return false;
  const { data, error } = await admin.rpc("verify_jobs_cron_secret", {
    p_secret: presented,
  });
  if (error) {
    console.error("[cron] secret verification failed", error.message);
    return false;
  }
  return data === true;
}

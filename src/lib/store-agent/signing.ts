import { createHmac } from "node:crypto";

/**
 * Every request between the platform and the agent service is signed (HMAC over
 * timestamp, method, path, user id and body), so each side can trust the user id
 * it receives. The service has the matching check in assistant-service/src/auth.ts.
 */
export function signServiceRequest(params: {
  secret: string;
  timestamp: number;
  userId: string;
  method: string;
  path: string;
  body: string;
}): string {
  const payload = `${params.timestamp}.${params.method.toUpperCase()}.${params.path}.${params.userId}.${params.body}`;
  return createHmac("sha256", params.secret).update(payload).digest("hex");
}

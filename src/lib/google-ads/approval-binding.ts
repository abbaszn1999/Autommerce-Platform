// Ties a person's approval to the exact edits on the card. The agent service
// stores this next to the approval; the platform recomputes it from the edits it
// is asked to apply, so an approval can't be reused for different edits or for
// another product.

import { createHash } from "node:crypto";

export type ApprovalTarget = "ads" | "merchant";

export function approvalBinding(target: ApprovalTarget, ops: unknown): string {
  return createHash("sha256").update(JSON.stringify({ target, ops })).digest("hex");
}

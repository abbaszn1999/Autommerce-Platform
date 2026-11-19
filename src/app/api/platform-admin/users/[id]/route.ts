import { NextResponse } from "next/server";
import { loadLiveUserDetail } from "@/lib/platform-admin/live";
import { purgeUser } from "@/lib/platform-admin/purge-user";
import { requirePlatformAdmin } from "@/lib/platform-admin/server-auth";
import { writeSecurityAuditLog } from "@/lib/security/audit-log";
import { createAdminClient } from "@/lib/supabase-admin";
import { MAX_EXTRA_WORKSPACES, extraWorkspacesOf } from "@/lib/billing/workspace-allowance";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const denied = await requirePlatformAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    const user = await loadLiveUserDetail(id);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load user" },
      { status: 500 }
    );
  }
}

/**
 * Grant a customer extra workspaces on top of their plan (0 removes the grant).
 * Only their own limit changes; the plan and other customers stay as they are.
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const denied = await requirePlatformAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { extraWorkspaces?: unknown };
  const extra = Number(body.extraWorkspaces);
  if (!Number.isInteger(extra) || extra < 0 || extra > MAX_EXTRA_WORKSPACES) {
    return NextResponse.json({ error: `Extra workspaces must be a whole number from 0 to ${MAX_EXTRA_WORKSPACES}.` }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { data: sub, error: subError } = await admin
      .from("user_subscriptions")
      .select("user_id, extra_workspaces")
      .eq("user_id", id)
      .maybeSingle();
    if (subError) throw new Error(subError.message);
    if (!sub) {
      return NextResponse.json({ error: "This user has no subscription yet, so there is no plan limit to add to." }, { status: 400 });
    }
    const before = extraWorkspacesOf(sub);
    if (before !== extra) {
      const { error: updateError } = await admin.from("user_subscriptions").update({ extra_workspaces: extra }).eq("user_id", id);
      if (updateError) throw new Error(updateError.message);
      await writeSecurityAuditLog(admin, {
        workspaceId: null,
        actorId: null,
        action: "subscription.extra_workspaces",
        targetId: id,
        before: { extra_workspaces: before },
        after: { extra_workspaces: extra, source: "platform_admin" },
        request: req,
      });
    }
    const user = await loadLiveUserDetail(id);
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update extra workspaces" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const denied = await requirePlatformAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const confirm = String(body.confirm || "").trim().toLowerCase();

  try {
    const admin = createAdminClient();
    const { data, error: lookupError } = await admin.auth.admin.getUserById(id);
    if (lookupError || !data.user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const email = data.user.email?.toLowerCase() || "";
    if (!email || confirm !== email) {
      return NextResponse.json({ error: "Type the user email to confirm deletion." }, { status: 400 });
    }
    const result = await purgeUser(admin, id);
    await writeSecurityAuditLog(admin, {
      workspaceId: null,
      actorId: null,
      action: "user.delete",
      targetId: id,
      before: { user_id: id, email },
      after: {
        source: "platform_admin",
        workspacesDeleted: result.workspacesDeleted,
        filesDeleted: result.filesDeleted,
        completed_at: new Date().toISOString(),
      },
      request: req,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete user" },
      { status: 500 }
    );
  }
}

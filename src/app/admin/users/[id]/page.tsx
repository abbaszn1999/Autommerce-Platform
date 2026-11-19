"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageLoader } from "@/components/brand/page-loader";
import { AdminTable } from "@/components/platform-admin/admin-table";
import { BackLink } from "@/components/platform-admin/back-link";
import { DangerConfirm } from "@/components/platform-admin/danger-confirm";
import { AdminListLayout, LiveBadge, PageTitle } from "@/components/platform-admin/list-chrome";
import { PageHeader } from "@/components/platform-admin/page-header";
import { Panel, DetailGrid } from "@/components/platform-admin/panel";
import { SignInAsButton } from "@/components/platform-admin/sign-in-as-button";
import { PlanBadge, SubscriptionStatusBadge, UserStatusBadge } from "@/components/platform-admin/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminJson } from "@/lib/platform-admin/client-api";
import { formatCredits, formatDate, formatRelative, formatBytes } from "@/lib/platform-admin/format";
import { ROLE_LABELS } from "@/lib/platform-admin/labels";
import type { LiveUserDetail } from "@/lib/platform-admin/live-types";
import { adminRoutes } from "@/lib/platform-admin/paths";

/**
 * The customer's workspace limit: their plan's, plus extra workspaces granted here.
 * Only this customer changes; the plan and its other customers stay as they are.
 */
function WorkspaceLimitPanel({ user, onSaved }: { user: LiveUserDetail; onSaved: (user: LiveUserDetail) => void }) {
  const [value, setValue] = useState(String(user.extraWorkspaces));
  const [saving, setSaving] = useState(false);
  const extra = Number(value);
  const valid = value.trim() !== "" && Number.isInteger(extra) && extra >= 0 && extra <= 100;
  const changed = valid && extra !== user.extraWorkspaces;
  const total = (n: number) => (user.planMaxWorkspaces == null ? "Unlimited" : String(user.planMaxWorkspaces + n));

  const save = async () => {
    setSaving(true);
    try {
      const data = await adminJson<{ user: LiveUserDetail }>(`/api/platform-admin/users/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ extraWorkspaces: extra }),
      });
      onSaved(data.user);
      setValue(String(data.user.extraWorkspaces));
      toast.success(`${user.email} can now own ${total(data.user.extraWorkspaces)} workspaces`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title="Workspace limit">
      {!user.hasSubscription ? (
        <p className="px-1 text-sm text-muted-foreground">This user has no subscription yet. Extra workspaces can be granted once they subscribe.</p>
      ) : (
        <div className="space-y-3 px-1">
          <DetailGrid
            nested
            items={[
              { label: "Plan limit", value: user.planMaxWorkspaces == null ? "Unlimited" : String(user.planMaxWorkspaces) },
              { label: "Extra (granted here)", value: String(user.extraWorkspaces) },
              { label: "Total allowed", value: `${total(user.extraWorkspaces)} · owns ${user.ownedWorkspaces.length}` },
            ]}
          />
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="extra-workspaces" className="text-sm text-muted-foreground">
              Extra workspaces
            </label>
            <Input
              id="extra-workspaces"
              type="number"
              min={0}
              max={100}
              step={1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-8 w-24"
            />
            <Button type="button" size="sm" disabled={!changed || saving} onClick={save}>
              {saving ? "Saving…" : "Save"}
            </Button>
            {valid && changed && <span className="text-xs text-muted-foreground">Total becomes {total(extra)}</span>}
            {!valid && <span className="text-xs text-destructive">A whole number from 0 to 100</span>}
          </div>
          <p className="text-xs text-muted-foreground">
            Only this customer changes. The plan and its other customers keep their limit. Set 0 to remove the grant (workspaces they already own are kept). Every change is recorded in the audit log.
          </p>
        </div>
      )}
    </Panel>
  );
}

export default function AdminUserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id ?? "");
  const [user, setUser] = useState<LiveUserDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    adminJson<{ user: LiveUserDetail }>(`/api/platform-admin/users/${id}`)
      .then((data) => setUser(data.user))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <PageLoader label="Loading user" />;

  if (!user) {
    return (
      <>
        <BackLink href={adminRoutes.users()} label="Users" />
        <PageHeader title="User not found" description={error || "This account is not in the live directory."} />
      </>
    );
  }

  const deleteUser = async () => {
    setDeleting(true);
    try {
      await adminJson(`/api/platform-admin/users/${id}`, {
        method: "DELETE",
        body: JSON.stringify({ confirm: user.email }),
      });
      toast.success("User deleted");
      router.replace(adminRoutes.users());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    }
  };

  return (
    <>
      <BackLink href={adminRoutes.users()} label="Users" />
      <PageHeader
        title={<PageTitle label={user.fullName} badge={<LiveBadge><span className="capitalize">{user.status}</span></LiveBadge>} />}
        description={user.email}
        actions={
          <>
            <SignInAsButton userId={user.id} email={user.email} />
            <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmOpen(true)}>
              Delete user
            </Button>
          </>
        }
      />

      <AdminListLayout>
      <DetailGrid
        items={[
          { label: "Status", value: <UserStatusBadge status={user.status} /> },
          { label: "Joined", value: formatDate(user.createdAt) },
          { label: "Last seen", value: formatRelative(user.lastSeenAt) },
          { label: "Plan", value: user.planName ? <PlanBadge name={user.planName} /> : "No owner subscription" },
          {
            label: "Subscription",
            value: user.subscriptionStatus ? <SubscriptionStatusBadge status={user.subscriptionStatus} /> : "—",
          },
          { label: "Workspaces", value: String(user.workspaceCount) },
          {
            label: "Storage (owned)",
            value: (
              <span className="tabular-nums">
                {formatBytes(user.storageBytes)}
                <span className="ml-1.5 font-normal text-muted-foreground">
                  · {user.objectCount.toLocaleString("en-US")} {user.objectCount === 1 ? "file" : "files"}
                </span>
              </span>
            ),
          },
        ]}
      />

      {user.subscriptionStatus ? (
        <Panel title="Billing">
          <DetailGrid
            nested
            items={[
              { label: "Cycle", value: user.billingCycle || "—" },
              { label: "Period end", value: user.currentPeriodEnd ? formatDate(user.currentPeriodEnd) : "—" },
              { label: "Cancel at period end", value: user.cancelAtPeriodEnd ? "Yes" : "No" },
              { label: "Credits used", value: user.creditsUsed == null ? "—" : formatCredits(user.creditsUsed) },
              { label: "Period credits", value: user.periodCredits == null ? "—" : formatCredits(user.periodCredits) },
              { label: "Bonus credits", value: user.bonusCredits == null ? "—" : formatCredits(user.bonusCredits) },
              { label: "Remaining", value: user.creditsRemaining == null ? "—" : formatCredits(user.creditsRemaining) },
              {
                label: "Stripe customer",
                value: user.stripeCustomerId ? (
                  <span className="font-mono text-xs">{user.stripeCustomerId}</span>
                ) : (
                  "—"
                ),
              },
            ]}
          />
        </Panel>
      ) : null}

      <WorkspaceLimitPanel user={user} onSaved={setUser} />

      <Panel title="Owned workspaces">
        <AdminTable
          embedded
          rows={user.ownedWorkspaces}
          rowKey={(row) => row.id}
          onRowClick={(row) => router.push(adminRoutes.workspace(row.id))}
          emptyTitle="No owned workspaces"
          emptyDescription="This user does not own a workspace."
          columns={[
            { header: "Workspace", cell: (row) => row.name },
            { header: "Slug", className: "text-muted-foreground", cell: (row) => `/${row.slug}` },
            { header: "Members", numeric: true, cell: (row) => row.memberCount },
            {
              header: "Storage",
              numeric: true,
              cell: (row) => (
                <span className="tabular-nums">{formatBytes(row.storageBytes)}</span>
              ),
            },
          ]}
        />
      </Panel>

      <Panel title="Memberships">
        <AdminTable
          embedded
          rows={user.memberships}
          rowKey={(row) => `${row.workspaceId}:${row.userId}`}
          onRowClick={(row) => router.push(adminRoutes.workspace(row.workspaceId))}
          emptyTitle="No memberships"
          emptyDescription="This user is not a member of any workspace."
          columns={[
            { header: "Workspace", cell: (row) => row.workspaceName },
            { header: "Role", cell: (row) => ROLE_LABELS[row.role] },
            { header: "Joined", className: "text-muted-foreground", cell: (row) => formatDate(row.joinedAt) },
          ]}
        />
      </Panel>
      </AdminListLayout>

      <DangerConfirm
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete this user?"
        description={`This removes ${user.email}, every workspace they own, and those files. Memberships in other workspaces are dropped; those workspaces stay. A security audit record of the deletion is kept. Type the email to confirm.`}
        confirmLabel={`Type ${user.email}`}
        confirmValue={user.email}
        actionLabel="Delete user and owned workspaces"
        loading={deleting}
        onConfirm={deleteUser}
      />
    </>
  );
}

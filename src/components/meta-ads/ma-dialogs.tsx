"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field, SelectBox } from "@/components/google-ads/ga-ui";
import { LIMITS } from "@/lib/meta-ads/constants";
import { learningBudget, recentCostPerResult } from "@/lib/meta-ads/analytics";
import { money } from "@/lib/meta-ads/metrics";
import { budgetResetsLearning } from "@/lib/meta-ads/mutations";
import { useAccountState, useMetaAds, type MaDialog } from "@/lib/meta-ads/store";
import type { MetaBudget, MutateOp } from "@/lib/meta-ads/types";
import { ACCENT_BTN } from "./ma-ui";

export function MaDialogs() {
  const dialog = useMetaAds((s) => s.dialog);
  const closeDialog = useMetaAds((s) => s.closeDialog);
  if (!dialog) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && closeDialog()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogBody dialog={dialog} />
      </DialogContent>
    </Dialog>
  );
}

function DialogBody({ dialog }: { dialog: MaDialog }) {
  switch (dialog.kind) {
    case "budget":
      return <BudgetForm entity={dialog.entity} id={dialog.id} />;
    case "exclusions":
      return <ExclusionsForm adSetId={dialog.adSetId} />;
    case "rename":
      return <RenameForm entity={dialog.entity} id={dialog.id} />;
  }
}

/** Shared submit: validate + apply, toast the outcome, close on success. */
function useSubmit() {
  const applyDirect = useMetaAds((s) => s.applyDirect);
  const closeDialog = useMetaAds((s) => s.closeDialog);
  return (title: string, ops: MutateOp[]) => {
    const res = applyDirect(title, ops);
    if (res.ok) {
      toast.success(title);
      closeDialog();
    } else toast.error(res.error ?? "Could not apply");
    return res.ok;
  };
}

function Footer({ children }: { children: ReactNode }) {
  const closeDialog = useMetaAds((s) => s.closeDialog);
  return (
    <DialogFooter className="gap-2">
      <button type="button" onClick={closeDialog} className="rounded-lg border border-border/70 px-4 py-2 text-xs font-medium hover:bg-muted">
        Cancel
      </button>
      {children}
    </DialogFooter>
  );
}

function PrimaryButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cn("rounded-lg px-4 py-2 text-xs font-semibold", ACCENT_BTN)}>
      {children}
    </button>
  );
}

// ─── Budget ────────────────────────────────────────────────────────────────

function BudgetForm({ entity, id }: { entity: "CAMPAIGN" | "AD_SET"; id: string }) {
  const acc = useAccountState()!;
  const range = useMetaAds((s) => s.range);
  const { data } = acc;
  const submit = useSubmit();
  const campaign = entity === "CAMPAIGN" ? data.campaigns.find((c) => c.id === id) : undefined;
  const set = entity === "AD_SET" ? data.adSets.find((s) => s.id === id) : undefined;
  const current: MetaBudget = (entity === "CAMPAIGN" ? campaign?.budget : set?.budget) ?? { kind: "DAILY", amount: 0 };
  const [kind, setKind] = useState(current.kind);
  const [amount, setAmount] = useState(String(current.amount));
  const cur = data.account.currency;
  const next: MetaBudget = { kind, amount: Number(amount) || 0 };
  const resets = budgetResetsLearning(current, next);
  const cpr = set ? recentCostPerResult(data, set.id, range) : 0;
  const need = cpr ? learningBudget(cpr) : 0;
  const name = campaign?.name ?? set?.name ?? "";
  const valid = next.amount >= LIMITS.minDailyBudget;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit budget</DialogTitle>
        <DialogDescription>{name}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <Field label="Budget type">
          <SelectBox value={kind} onChange={(v) => setKind(v)} options={[{ value: "DAILY", label: "Daily budget" }, { value: "LIFETIME", label: "Lifetime budget" }]} />
        </Field>
        <Field label={kind === "DAILY" ? `Daily budget (${cur})` : `Lifetime budget (${cur})`} error={!valid ? `At least ${LIMITS.minDailyBudget}` : undefined}>
          <Input type="number" min={LIMITS.minDailyBudget} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        {need > 0 && (
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            Cost per result is {money(cpr, cur)}, so this ad set needs about <span className="font-semibold text-foreground">{money(need, cur)}/day</span> to reach 50 results in 7 days.
          </p>
        )}
        {resets && (
          <p className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Changes over 20% restart the learning phase. Results can be unstable for a few days.
          </p>
        )}
      </div>
      <Footer>
        <PrimaryButton disabled={!valid} onClick={() => submit(`Set budget of ${name} to ${money(next.amount, cur)}`, [{ kind: "budget.update", entity, id, budget: next }])}>
          Save budget
        </PrimaryButton>
      </Footer>
    </>
  );
}

// ─── Exclusions ────────────────────────────────────────────────────────────

function ExclusionsForm({ adSetId }: { adSetId: string }) {
  const { data } = useAccountState()!;
  const submit = useSubmit();
  const set = data.adSets.find((s) => s.id === adSetId);
  const [chosen, setChosen] = useState<string[]>(set?.targeting.excludeAudienceIds ?? []);
  if (!set) return null;
  const toggle = (aid: string) => setChosen((c) => (c.includes(aid) ? c.filter((x) => x !== aid) : [...c, aid]));
  const options = data.audiences.filter((a) => !set.targeting.includeAudienceIds.includes(a.id));
  return (
    <>
      <DialogHeader>
        <DialogTitle>Excluded audiences</DialogTitle>
        <DialogDescription>{set.name}: people in these audiences won&apos;t see the ads.</DialogDescription>
      </DialogHeader>
      <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-border/60 p-2">
        {options.map((a) => (
          <label key={a.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-xs hover:bg-muted/50">
            <input type="checkbox" checked={chosen.includes(a.id)} onChange={() => toggle(a.id)} className="h-3.5 w-3.5 accent-[#400095]" />
            <span className="flex-1 truncate font-medium">{a.name}</span>
            <span className="text-[10px] text-muted-foreground">{a.kind.replace(/_/g, " ").toLowerCase()}</span>
          </label>
        ))}
      </div>
      <Footer>
        <PrimaryButton onClick={() => submit(`Update exclusions of ${set.name}`, [{ kind: "targeting.update", adSetId, patch: { excludeAudienceIds: chosen } }])}>Save exclusions</PrimaryButton>
      </Footer>
    </>
  );
}

// ─── Rename ────────────────────────────────────────────────────────────────

function RenameForm({ entity, id }: { entity: "CAMPAIGN" | "AD_SET" | "AD"; id: string }) {
  const { data } = useAccountState()!;
  const submit = useSubmit();
  const item = entity === "CAMPAIGN" ? data.campaigns.find((c) => c.id === id) : entity === "AD_SET" ? data.adSets.find((s) => s.id === id) : data.ads.find((a) => a.id === id);
  const [name, setName] = useState(item?.name ?? "");
  if (!item) return null;
  const op: MutateOp = entity === "CAMPAIGN" ? { kind: "campaign.update", campaignId: id, patch: { name: name.trim() } } : entity === "AD_SET" ? { kind: "adSet.update", adSetId: id, patch: { name: name.trim() } } : { kind: "ad.update", adId: id, patch: { name: name.trim() } };
  return (
    <>
      <DialogHeader>
        <DialogTitle>Rename</DialogTitle>
        <DialogDescription>{item.name}</DialogDescription>
      </DialogHeader>
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <Footer>
        <PrimaryButton disabled={!name.trim() || name.trim() === item.name} onClick={() => submit(`Rename to ${name.trim()}`, [op])}>
          Save name
        </PrimaryButton>
      </Footer>
    </>
  );
}

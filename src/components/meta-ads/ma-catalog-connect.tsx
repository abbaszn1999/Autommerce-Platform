"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Check, ChevronRight, Eye, Loader2, ShoppingBag } from "lucide-react";
import { DEMO_FACEBOOK_EMAIL } from "@/lib/meta-ads/mock-data";
import { useMetaAds } from "@/lib/meta-ads/store";
import { MetaMark } from "./ma-connect";

/**
 * Catalog connection flow (simulated): Facebook sign-in, consent for the
 * `catalog_management` permission, then pick the Commerce Manager catalog.
 * Rendered at the top of the shell so it works from the connect screen and from Connections.
 */
export function CatalogConnectDialog() {
  const status = useMetaAds((s) => s.catalog.status);
  if (status === "authorizing") return <CatalogConsent />;
  if (status === "selecting") return <CatalogPicker />;
  return null;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" data-testid="catalog-dialog">
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        {children}
      </motion.div>
    </div>
  );
}

function CatalogConsent() {
  const complete = useMetaAds((s) => s.completeCatalogAuth);
  const cancel = useMetaAds((s) => s.cancelCatalogConnect);
  const [step, setStep] = useState<"choose" | "consent" | "loading">("choose");

  const allow = () => {
    setStep("loading");
    window.setTimeout(complete, 900);
  };

  return (
    <Frame>
      <div className="flex items-center gap-2 border-b border-border/60 px-5 py-3 text-xs text-muted-foreground">
        <MetaMark className="h-4 w-4" /> Facebook Login for Business
        <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase">Simulated</span>
      </div>
      {step === "choose" ? (
        <div className="p-6">
          <h2 className="text-xl font-semibold">Continue as Marketing team?</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            to connect your <span className="font-medium text-foreground">catalog</span> to Autommerce
          </p>
          <button type="button" onClick={() => setStep("consent")} className="mt-5 flex w-full items-center gap-3 rounded-xl border border-border/70 px-4 py-3 text-left hover:bg-muted/50">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1877F2] text-sm font-bold text-white">M</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Marketing team</span>
              <span className="block truncate text-xs text-muted-foreground">{DEMO_FACEBOOK_EMAIL}</span>
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
          <button type="button" onClick={cancel} className="mt-6 text-sm font-medium text-muted-foreground hover:text-foreground">
            Cancel
          </button>
        </div>
      ) : (
        <div className="p-6">
          <h2 className="text-lg font-semibold leading-snug">Autommerce wants access to your catalogs</h2>
          <p className="mt-1 text-xs text-muted-foreground">{DEMO_FACEBOOK_EMAIL}</p>
          <div className="mt-5 rounded-xl border border-border/70 p-4">
            <p className="text-xs font-semibold">This will allow Autommerce to:</p>
            <div className="mt-3 flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1877F2]/10">
                <Eye className="h-4 w-4 text-[#1877F2]" />
              </span>
              <p className="text-sm">See and manage the product catalogs in your Commerce Manager account.</p>
            </div>
          </div>
          <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
            Permission: <code className="rounded bg-muted px-1">catalog_management</code>. This is separate from ad account access. You can remove it any time from Connections or in your Facebook settings.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" onClick={cancel} className="rounded-lg px-4 py-2 text-sm font-medium text-[#1877F2] hover:bg-[#1877F2]/10">
              Cancel
            </button>
            <button type="button" disabled={step === "loading"} onClick={allow} className="inline-flex items-center gap-2 rounded-lg bg-[#1877F2] px-5 py-2 text-sm font-medium text-white hover:bg-[#166fe0] disabled:opacity-70">
              {step === "loading" && <Loader2 className="h-4 w-4 animate-spin" />} Continue
            </button>
          </div>
        </div>
      )}
    </Frame>
  );
}

function CatalogPicker() {
  const catalog = useMetaAds((s) => s.catalog);
  const select = useMetaAds((s) => s.selectCatalog);
  const cancel = useMetaAds((s) => s.cancelCatalogConnect);
  const startAgain = useMetaAds((s) => s.startCatalogConnect);

  return (
    <Frame>
      <div className="p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
            <Check className="h-5 w-5 text-emerald-600" />
          </span>
          <div>
            <h2 className="text-lg font-semibold leading-tight">Choose a catalog</h2>
            <p className="text-xs text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{catalog.email}</span>
            </p>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-border/60">
          {catalog.accounts.map((a) => (
            <button key={a.catalogId} type="button" onClick={() => select(a.catalogId)} className="flex w-full items-center gap-3 border-b border-border/40 px-4 py-3 text-left last:border-b-0 hover:bg-muted/40">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F76D01]/10 text-[#F76D01]">
                <ShoppingBag className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{a.name}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {a.catalogId} · {a.website} · {a.productCount} products
                </span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
        <div className="mt-5 flex items-center justify-between">
          <button type="button" onClick={cancel} className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button type="button" onClick={startAgain} className="text-xs text-muted-foreground hover:text-foreground">
            Use a different Facebook account
          </button>
        </div>
      </div>
    </Frame>
  );
}

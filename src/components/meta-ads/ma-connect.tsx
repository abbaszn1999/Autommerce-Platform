"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ArrowRight, BarChart3, Bot, Building2, Check, ChevronRight, Eye, KeyRound, Loader2, Lock, PenLine, ShieldCheck, ShoppingBag, Undo2, Infinity as InfinityIcon, BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { SelectBox } from "@/components/google-ads/ga-ui";
import { DEMO_FACEBOOK_EMAIL, DEMO_INSTAGRAMS, DEMO_PAGES } from "@/lib/meta-ads/mock-data";
import { useMetaAds } from "@/lib/meta-ads/store";

export function MetaMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <circle cx="24" cy="24" r="22" fill="#1877F2" />
      <text x="24" y="35" textAnchor="middle" fontSize="30" fontWeight="700" fill="#fff" fontFamily="Arial, sans-serif">
        f
      </text>
    </svg>
  );
}

/** Permissions the simulated Facebook Login for Business asks for. */
export const META_PERMISSIONS = [
  { scope: "ads_management", text: "Create and manage ads in the ad accounts you choose." },
  { scope: "ads_read", text: "Read ad account insights and reports." },
  { scope: "business_management", text: "See the Business portfolio that owns those ad accounts." },
  { scope: "pages_show_list", text: "See the Facebook Pages you manage." },
  { scope: "pages_read_engagement", text: "Read Page content so ads can run as the Page." },
  { scope: "instagram_basic", text: "See the Instagram account connected to a Page." },
];

const CAN = [
  { icon: BarChart3, title: "Read reports", body: "Campaign, ad set, ad, creative and breakdown data." },
  { icon: PenLine, title: "Propose and make changes", body: "Budgets, audiences, placements, ads and new campaigns, only after you approve." },
  { icon: Undo2, title: "Undo what it changed", body: "Every change is logged with a one-click undo." },
];

const CANNOT = ["Change billing or payment methods", "Change the account spending limit", "Publish organic posts to your Page or Instagram"];

export function MaConnect() {
  const status = useMetaAds((s) => s.status);
  if (status === "selecting") return <AccountPicker />;
  return (
    <div className="autommerce-dashboard flex-1 overflow-auto bg-background [font-family:var(--brand-font)]">
      <section className="relative overflow-hidden border-b border-border/60 bg-gradient-to-br from-[#400095]/[0.08] via-background to-[#F76D01]/[0.08]">
        <div className="absolute -left-24 -top-28 h-72 w-72 rounded-full bg-[#400095]/10 blur-3xl" />
        <div className="absolute -bottom-28 -right-16 h-72 w-72 rounded-full bg-[#F76D01]/10 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-6 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#400095] text-white shadow-[0_8px_25px_rgba(64,0,149,.22)] dark:bg-[#F76D01]">
                <InfinityIcon className="h-4 w-4" />
              </span>
              <span className="text-[9px] font-black uppercase tracking-[0.24em] text-[#400095] dark:text-[#F76D01]">Agents · Meta Ads</span>
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">Preview · demo data</span>
            </div>
            <h1 className="text-3xl font-black tracking-[-0.035em] sm:text-5xl">
              Your Meta Ads,
              <span className="block bg-gradient-to-r from-[#F76D01] via-[#C40000] to-[#400095] bg-clip-text pb-1 text-transparent">run by an agent.</span>
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">
              Connect your ad account and manage everything in one place: campaigns, ad sets, ads, creatives, audiences, placements and measurement. Ask the agent to analyse, fix or build. It prepares the change, you approve it.
            </p>
            <ConnectionTiles />
            <span className="mt-4 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Lock className="h-3.5 w-3.5" /> Secure Facebook Login for Business. We never see your password.
            </span>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className="rounded-3xl border border-border/60 bg-card/80 p-5 shadow-xl shadow-black/[0.04] backdrop-blur">
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">What the agent can do</p>
            <div className="space-y-3">
              {CAN.map((c) => (
                <div key={c.title} className="flex gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#400095]/10 text-[#400095] dark:bg-violet-500/15 dark:text-violet-300">
                    <c.icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{c.title}</p>
                    <p className="text-xs text-muted-foreground">{c.body}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl bg-muted/50 p-3">
              <p className="mb-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">It can never</p>
              {CANNOT.map((c) => (
                <p key={c} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> {c}
                </p>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-4 px-6 py-8 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { n: "1", icon: KeyRound, title: "Continue with Facebook", body: "Sign in with the Facebook account that has access to your ad account and allow access." },
          { n: "2", icon: Building2, title: "Choose the ad account", body: "We list every account in your Business portfolios, then the Page, Instagram account and dataset your ads run with." },
          { n: "3", icon: ShoppingBag, title: "Catalog (optional)", body: "Connect your Commerce Manager catalog so the agent can fix product issues. You can add it later." },
          { n: "4", icon: Bot, title: "Work with the agent", body: "Ask in chat, review proposed changes on the right, approve to apply." },
        ].map((s) => (
          <div key={s.n} className="rounded-2xl border border-border/60 bg-card p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-[11px] font-bold text-background">{s.n}</span>
              <s.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold">{s.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.body}</p>
          </div>
        ))}
      </div>

      {status === "authorizing" && <ConsentDialog />}
    </div>
  );
}

const CONNECT_BTN = "inline-flex h-11 items-center gap-2.5 rounded-xl border border-border bg-background px-5 text-sm font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md";

function TileLink({ onClick, children, danger }: { onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={cn("text-[11px] font-medium hover:underline", danger ? "text-red-600" : "text-muted-foreground hover:text-foreground")}>
      {children}
    </button>
  );
}

/**
 * Two separate connections. The Meta ad account is required: "Go to agent" appears once it
 * is connected. The catalog is optional and can be connected or changed later from Connections.
 */
function ConnectionTiles() {
  const status = useMetaAds((s) => s.status);
  const accountId = useMetaAds((s) => s.accountId);
  const accounts = useMetaAds((s) => s.accounts);
  const portfolios = useMetaAds((s) => s.portfolios);
  const catalog = useMetaAds((s) => s.catalog);
  const startConnect = useMetaAds((s) => s.startConnect);
  const changeAccount = useMetaAds((s) => s.changeAccount);
  const disconnect = useMetaAds((s) => s.disconnect);
  const enterWorkspace = useMetaAds((s) => s.enterWorkspace);
  const startCatalogConnect = useMetaAds((s) => s.startCatalogConnect);
  const changeCatalog = useMetaAds((s) => s.changeCatalog);
  const disconnectCatalog = useMetaAds((s) => s.disconnectCatalog);

  const adsAccount = status === "connected" && accountId ? portfolios.flatMap((p) => p.accounts).find((a) => a.accountId === accountId) : undefined;
  const identity = accountId ? accounts[accountId]?.data.account : undefined;
  const catalogAccount = catalog.accounts.find((a) => a.catalogId === catalog.catalogId);

  const tile = "flex flex-wrap items-center gap-3 rounded-2xl border bg-background/80 p-3 pr-4 shadow-sm";
  const iconBox = (done: boolean, children: React.ReactNode) => (
    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", done ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground")}>{done ? <Check className="h-5 w-5" /> : children}</span>
  );

  return (
    <div className="mt-6 max-w-lg space-y-2.5">
      <div className={cn(tile, adsAccount ? "border-emerald-500/40" : "border-border/70")} data-testid="connect-ads">
        {iconBox(!!adsAccount, <InfinityIcon className="h-5 w-5" />)}
        {adsAccount ? (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Meta ad account connected</p>
              <p className="truncate text-xs text-muted-foreground">
                {adsAccount.name} · {adsAccount.accountId}
              </p>
              {identity && (
                <p className="truncate text-[11px] text-muted-foreground">
                  {DEMO_PAGES.find((p) => p.id === identity.pageId)?.name ?? "No Page"} · {DEMO_INSTAGRAMS.find((p) => p.id === identity.instagramId)?.handle ?? "No Instagram"}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              <TileLink onClick={changeAccount}>Change account</TileLink>
              <TileLink onClick={disconnect} danger>
                Disconnect
              </TileLink>
            </div>
          </>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Meta ad account</p>
              <p className="text-xs text-muted-foreground">Required. Campaigns, ad sets, ads and reports.</p>
            </div>
            <button type="button" onClick={startConnect} className={CONNECT_BTN}>
              <MetaMark className="h-5 w-5" />
              Continue with Facebook
            </button>
          </>
        )}
      </div>

      <div className={cn(tile, catalogAccount ? "border-emerald-500/40" : "border-border/70")} data-testid="connect-catalog">
        {iconBox(!!catalogAccount, <ShoppingBag className="h-5 w-5" />)}
        {catalogAccount ? (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Catalog connected</p>
              <p className="truncate text-xs text-muted-foreground">
                {catalogAccount.name} · {catalogAccount.productCount} products
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <TileLink onClick={changeCatalog}>Change catalog</TileLink>
              <TileLink onClick={disconnectCatalog} danger>
                Disconnect
              </TileLink>
            </div>
          </>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                Catalog
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">Optional</span>
              </p>
              <p className="text-xs text-muted-foreground">Commerce Manager products. Lets the agent fix product issues.</p>
            </div>
            <button type="button" onClick={startCatalogConnect} className={CONNECT_BTN}>
              <MetaMark className="h-5 w-5" />
              Connect catalog
            </button>
          </>
        )}
      </div>

      {adsAccount && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="pt-1.5">
          <button
            type="button"
            onClick={enterWorkspace}
            className="inline-flex h-12 items-center gap-2.5 rounded-xl bg-[#400095] px-6 text-sm font-bold text-white shadow-[0_10px_30px_rgba(64,0,149,.28)] transition-all hover:-translate-y-0.5 hover:bg-[#340079] dark:bg-[#F76D01] dark:hover:bg-[#d85f00]"
          >
            Go to agent <ArrowRight className="h-4 w-4" />
          </button>
          {!catalogAccount && <p className="mt-2 text-[11px] text-muted-foreground">You can start now. Connect your catalog any time from Connections inside the agent.</p>}
        </motion.div>
      )}
    </div>
  );
}

/** Mimics Facebook Login for Business: who you are, then the permissions it asks for. */
function ConsentDialog() {
  const completeAuth = useMetaAds((s) => s.completeAuth);
  const disconnect = useMetaAds((s) => s.disconnect);
  const [step, setStep] = useState<"choose" | "consent" | "loading">("choose");

  const allow = () => {
    setStep("loading");
    window.setTimeout(completeAuth, 900);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border/60 px-5 py-3 text-xs text-muted-foreground">
          <MetaMark className="h-4 w-4" /> Facebook Login for Business
          <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase">Simulated</span>
        </div>
        {step === "choose" && (
          <div className="p-6">
            <h2 className="text-xl font-semibold">Continue as Marketing team?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              to log in to <span className="font-medium text-foreground">Autommerce</span> with Facebook
            </p>
            <button type="button" onClick={() => setStep("consent")} className="mt-5 flex w-full items-center gap-3 rounded-xl border border-border/70 px-4 py-3 text-left hover:bg-muted/50">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1877F2] text-sm font-bold text-white">M</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">Marketing team</span>
                <span className="block truncate text-xs text-muted-foreground">{DEMO_FACEBOOK_EMAIL}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
            <button type="button" onClick={disconnect} className="mt-6 text-sm font-medium text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          </div>
        )}
        {step !== "choose" && (
          <div className="p-6">
            <h2 className="text-lg font-semibold leading-snug">Autommerce wants access to your Meta business assets</h2>
            <p className="mt-1 text-xs text-muted-foreground">{DEMO_FACEBOOK_EMAIL}</p>
            <div className="mt-5 rounded-xl border border-border/70 p-4">
              <p className="text-xs font-semibold">This will allow Autommerce to:</p>
              <div className="mt-3 space-y-2.5">
                {META_PERMISSIONS.map((p) => (
                  <div key={p.scope} className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#1877F2]/10">
                      <Eye className="h-3.5 w-3.5 text-[#1877F2]" />
                    </span>
                    <p className="text-sm">
                      {p.text} <code className="rounded bg-muted px-1 text-[10px]">{p.scope}</code>
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">You choose which ad accounts and Pages to share on the next screen. Catalog access (catalog_management) is a separate, optional step. Autommerce never touches billing.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={disconnect} className="rounded-lg px-4 py-2 text-sm font-medium text-[#1877F2] hover:bg-[#1877F2]/10">
                Cancel
              </button>
              <button type="button" disabled={step === "loading"} onClick={allow} className="inline-flex items-center gap-2 rounded-lg bg-[#1877F2] px-5 py-2 text-sm font-medium text-white hover:bg-[#166fe0] disabled:opacity-70">
                {step === "loading" && <Loader2 className="h-4 w-4 animate-spin" />} Continue
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

/** Business portfolio > ad accounts, then the Page, Instagram account and dataset the ads run with. */
function AccountPicker() {
  const portfolios = useMetaAds((s) => s.portfolios);
  const accounts = useMetaAds((s) => s.accounts);
  const email = useMetaAds((s) => s.facebookEmail);
  const chooseAccount = useMetaAds((s) => s.chooseAccount);
  const setIdentity = useMetaAds((s) => s.setIdentity);
  const disconnect = useMetaAds((s) => s.disconnect);
  const current = useMetaAds((s) => s.accountId);
  const [picked, setPicked] = useState<string | null>(null);
  const [pageId, setPageId] = useState(DEMO_PAGES[0]!.id);
  const [igId, setIgId] = useState(DEMO_INSTAGRAMS[0]!.id);
  const [datasetId, setDatasetId] = useState("");

  const datasets = picked ? accounts[picked]?.data.datasets ?? [] : [];
  const pickedAccount = picked ? portfolios.flatMap((p) => p.accounts).find((a) => a.accountId === picked) : undefined;

  const finish = () => {
    if (!picked) return;
    chooseAccount(picked);
    setIdentity({ pageId, instagramId: igId, datasetId: datasetId || datasets[0]?.id });
  };

  return (
    <div className="autommerce-dashboard flex flex-1 items-start justify-center overflow-auto bg-background px-4 py-12 [font-family:var(--brand-font)]">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-xl">
        <div className="mb-6 text-center">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10">
            <Check className="h-6 w-6 text-emerald-600" />
          </span>
          <h1 className="text-2xl font-black tracking-tight">{picked ? "Choose how your ads run" : "Choose an ad account"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{email}</span>. The agent works on one ad account at a time; you can switch later.
          </p>
        </div>

        {!picked ? (
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
            {portfolios.map((p) => (
              <div key={p.portfolio.id}>
                <div className="flex items-center gap-3 border-b border-border/60 bg-muted/40 px-4 py-3">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold">{p.portfolio.name}</p>
                    <p className="text-[11px] text-muted-foreground">Business portfolio · {p.portfolio.id}</p>
                  </div>
                  {p.portfolio.verified && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                      <BadgeCheck className="h-3 w-3" /> Verified
                    </span>
                  )}
                </div>
                {p.accounts.map((acc) => {
                  const count = accounts[acc.accountId]?.data.campaigns.length ?? 0;
                  return (
                    <button
                      key={acc.accountId}
                      type="button"
                      onClick={() => setPicked(acc.accountId)}
                      className="flex w-full items-center gap-3 border-b border-border/40 px-4 py-4 pl-9 text-left transition-colors last:border-b-0 hover:bg-muted/40"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#400095]/10 text-[#400095] dark:bg-violet-500/15 dark:text-violet-300">
                        <InfinityIcon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{acc.name}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {acc.accountId} · {acc.currency} · {acc.timeZone}
                        </span>
                      </span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", count ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>{count ? `${count} campaigns` : "No campaigns yet"}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
            <p className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{pickedAccount?.name}</span> · {picked}
            </p>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold">Facebook Page</span>
              <SelectBox value={pageId} onChange={setPageId} options={DEMO_PAGES.map((p) => ({ value: p.id, label: `${p.name} (${p.handle})` }))} />
              <span className="block text-[11px] text-muted-foreground">The Page your ads run as.</span>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold">Instagram account</span>
              <SelectBox value={igId} onChange={setIgId} options={DEMO_INSTAGRAMS.map((p) => ({ value: p.id, label: `${p.name} (${p.handle})` }))} />
              <span className="block text-[11px] text-muted-foreground">Shown on Instagram placements.</span>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold">Dataset (Pixel and Conversions API)</span>
              {datasets.length ? (
                <SelectBox value={datasetId || datasets[0]!.id} onChange={setDatasetId} options={datasets.map((d) => ({ value: d.id, label: d.name }))} />
              ) : (
                <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">No dataset on this account yet. Sales campaigns need one.</p>
              )}
              <span className="block text-[11px] text-muted-foreground">Where conversions are measured for sales and lead campaigns.</span>
            </label>
            <div className="flex items-center justify-between pt-2">
              <button type="button" onClick={() => setPicked(null)} className="text-sm font-medium text-muted-foreground hover:text-foreground">
                Back
              </button>
              <button type="button" onClick={finish} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#400095] px-5 text-sm font-bold text-white hover:bg-[#340079] dark:bg-[#F76D01] dark:hover:bg-[#d85f00]">
                Use this account <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center justify-center gap-4">
          {current && !picked && (
            <button type="button" onClick={() => chooseAccount(current)} className="text-xs text-muted-foreground hover:text-foreground">
              Back
            </button>
          )}
          <button type="button" onClick={disconnect} className="text-xs text-muted-foreground hover:text-foreground">
            Use a different Facebook account
          </button>
        </div>
      </motion.div>
    </div>
  );
}

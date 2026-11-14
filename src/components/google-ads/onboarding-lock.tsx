"use client";

// First-run onboarding, right side of the screen: while Vera interviews the owner
// and fills in the workspace, the dashboard is replaced by this panel. It says where
// things are, offers "unlock now" (Vera then fills in what she has) and, when Vera
// cannot be reached, a way out so nobody is ever stuck.

import { useEffect, useState } from "react";
import { Check, Loader2, LockKeyhole, MessageCircle, Sparkles } from "lucide-react";
import { useStoreAgent } from "@/components/store-agent/use-store-agent";
import { runAgentTurn } from "@/lib/google-ads/agent-runner";
import type { OnboardingStage } from "@/lib/business-profile";
import { cn } from "@/lib/utils";

/** Sent by the page as the first message of the onboarding chat. Vera's rules say how to answer it. */
export const ONBOARDING_START =
  "I just finished the setup popup. Start my onboarding: tell me what you already know, and ask me for what you still need (logo, brand files, competitors I forgot, knowledge about my business).";
/** Sent by the "Unlock the dashboard now" button. */
export const UNLOCK_REQUEST = "Unlock the dashboard now: fill in my business profile and the competitor ads from what you already have, then unlock it.";

const STUCK_AFTER_MS = 10 * 60_000;

function Step({ state, title, body }: { state: "done" | "active" | "todo"; title: string; body: string }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={cn(
          "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black",
          state === "done" ? "bg-emerald-500 text-white" : state === "active" ? "bg-[#400095] text-white" : "bg-muted text-muted-foreground"
        )}
      >
        {state === "done" ? <Check className="h-3.5 w-3.5" /> : state === "active" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "·"}
      </span>
      <span>
        <span className={cn("block text-sm font-bold", state === "todo" && "text-muted-foreground")}>{title}</span>
        <span className="block text-[12px] leading-relaxed text-muted-foreground">{body}</span>
      </span>
    </li>
  );
}

export function OnboardingLock({ stage, onUnlockAnyway }: { stage: OnboardingStage; onUnlockAnyway: () => Promise<void> }) {
  const availability = useStoreAgent((s) => s.availability);
  const [stuck, setStuck] = useState(false);
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setStuck(true), STUCK_AFTER_MS);
    return () => clearTimeout(timer);
  }, [stage]);

  const agentDown = availability === "off" || availability === "no_store" || availability === "error";
  const filling = stage === "filling";

  return (
    <div className="flex h-full min-h-0 flex-1 items-center justify-center overflow-y-auto bg-gradient-to-br from-[#400095]/[0.05] via-transparent to-[#F76D01]/[0.05] p-6">
      <div className="w-full max-w-lg rounded-3xl border border-border/70 bg-background p-7 shadow-[0_20px_60px_rgba(16,18,28,.08)]">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#400095] text-white shadow-[0_8px_24px_rgba(64,0,149,.3)]">
            <LockKeyhole className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#400095] dark:text-violet-300">Setting up your workspace</p>
            <h2 className="text-xl font-black tracking-tight">{filling ? "Vera is filling everything in" : "Vera is getting to know your business"}</h2>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          {filling
            ? "She is reading your website and your files, researching your market, writing your Business profile and pulling the keywords your competitors pay for. The dashboard unlocks the moment both are ready."
            : "Answer her questions in the chat on the left. Share your logo, brand files, competitors and anything about the business. The dashboard stays locked until she has what she needs, and you can unlock it whenever you like."}
        </p>

        <ol className="mt-6 space-y-4">
          <Step state="done" title="Your details" body="Business, numbers, competitors and guardrails from the setup." />
          <Step state={filling ? "done" : "active"} title="Interview with Vera" body="Logo, brand files, forgotten competitors, selling points, goals." />
          <Step state={filling ? "active" : "todo"} title="Business profile and competitor ads" body="From your website, your files, web research and SE Ranking." />
        </ol>

        {!filling && (
          <button
            type="button"
            disabled={asked}
            onClick={() => {
              setAsked(true);
              runAgentTurn(UNLOCK_REQUEST);
            }}
            className="mt-7 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#400095] px-5 text-sm font-bold text-white shadow-[0_10px_30px_rgba(64,0,149,.25)] transition-all hover:-translate-y-0.5 hover:bg-[#340079] disabled:translate-y-0 disabled:opacity-60 dark:bg-violet-600"
          >
            <Sparkles className="h-4 w-4" />
            {asked ? "Asked Vera to unlock…" : "That's enough, unlock the dashboard"}
          </button>
        )}
        {!filling && (
          <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
            <MessageCircle className="h-3 w-3" /> Or just tell Vera in the chat: &quot;unlock&quot;.
          </p>
        )}

        {(agentDown || stuck) && (
          <div className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
            <p className="text-[12px] leading-relaxed text-amber-800 dark:text-amber-300">
              {agentDown ? "Vera can't be reached right now." : "This is taking longer than expected."} You can open the dashboard as it is and ask her to finish later.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void onUnlockAnyway().finally(() => setBusy(false));
              }}
              className="mt-2 rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-500/10 disabled:opacity-60 dark:text-amber-300"
            >
              {busy ? "Opening…" : "Open the dashboard anyway"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

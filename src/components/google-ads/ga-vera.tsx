"use client";

import { useEffect } from "react";
import { useWorkspaceContext } from "@/app/(dashboard)/w/[workspaceSlug]/workspace-context";
import { StoreAgentWorkspace } from "@/components/store-agent/store-agent-workspace";
import { newChat, sendMessage, useStoreAgent } from "@/components/store-agent/use-store-agent";
import { setLiveAgentHandler } from "@/lib/google-ads/agent-runner";
import { useAccountData } from "@/lib/google-ads/store";

/**
 * Live accounts: Vera (the same agent as the Store Assistant, with Google Ads
 * rules and tools) in the agent column. "Ask the agent" buttons in the account
 * views send their prompt to the open chat.
 */
export function GaVera({ width }: { width: number }) {
  const { workspace, role } = useWorkspaceContext();
  const accountName = useAccountData()?.account.name ?? "Google Ads";

  useEffect(() => {
    // Ready means loaded AND its saved tabs reopened: a chat started before that is replaced by them.
    const ready = () => {
      const s = useStoreAgent.getState();
      return s.domain === "google_ads" && s.availability === "ready" && !!s.activeChatId;
    };
    const send = (text: string, chatId: string | null) => void sendMessage(chatId ?? newChat(), text, []);
    let stopWaiting: (() => void) | null = null;
    setLiveAgentHandler((text) => {
      if (ready()) return send(text, useStoreAgent.getState().activeChatId);
      // Just opened (e.g. straight from the setup screen): once the chat has loaded, send it in a chat of its own; drop it after 30 s.
      stopWaiting?.();
      const unsubscribe = useStoreAgent.subscribe(() => {
        if (!ready()) return;
        stopWaiting?.();
        // An empty new chat that just opened is used as it is.
        const active = useStoreAgent.getState().activeChatId;
        send(text, active?.startsWith("draft-") ? active : null);
      });
      const timer = setTimeout(() => stopWaiting?.(), 30_000);
      stopWaiting = () => {
        unsubscribe();
        clearTimeout(timer);
        stopWaiting = null;
      };
    });
    return () => {
      stopWaiting?.();
      setLiveAgentHandler(null);
    };
  }, []);

  if (!workspace) return null;
  return (
    <aside aria-label="Ads agent" style={{ width }} className="flex h-full min-h-0 shrink-0 flex-col overflow-hidden">
      <StoreAgentWorkspace
        workspaceId={workspace.id}
        basePath={`/w/${workspace.slug}`}
        storeName={accountName}
        // Google Ads changes move real money: only owners and admins work with Vera here.
        canEdit={role === "owner" || role === "admin"}
        domain="google_ads"
        variant="panel"
      />
    </aside>
  );
}

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
    setLiveAgentHandler((text) => {
      const s = useStoreAgent.getState();
      if (s.domain !== "google_ads" || s.availability !== "ready") return;
      const chatId = s.activeChatId ?? newChat();
      void sendMessage(chatId, text, []);
    });
    return () => setLiveAgentHandler(null);
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

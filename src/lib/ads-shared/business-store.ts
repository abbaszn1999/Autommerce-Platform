"use client";

// One business profile and one agent memory per workspace, shared by the
// Google Ads agent and the Meta Ads agent. Either agent can learn a fact; both
// read it before every plan, report and recommendation. Prototype: it lives in
// memory; with the backend it becomes a workspace-level row.

import { create } from "zustand";
import { DEFAULT_PROFILE, seedMemories, type AgentMemory, type BusinessProfile } from "@/lib/google-ads/docs";
import { gid } from "@/lib/google-ads/mutations";

export type { AgentMemory, BusinessProfile } from "@/lib/google-ads/docs";

type BusinessStore = {
  profile: BusinessProfile;
  memories: AgentMemory[];
  setProfile: (patch: Partial<BusinessProfile>) => void;
  /** `platform` records which agent learned the fact, so the profile can show it. */
  addMemory: (text: string, source: AgentMemory["source"], platform?: AgentMemory["platform"]) => void;
  removeMemory: (id: string) => void;
  /** Back to the demo defaults (used when a workspace is reset and by tests). */
  reset: () => void;
};

const initial = () => ({ profile: { ...DEFAULT_PROFILE }, memories: seedMemories() });

export const useBusinessStore = create<BusinessStore>((set) => ({
  ...initial(),
  setProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch } })),
  addMemory: (text, source, platform) =>
    set((s) => ({ memories: [{ id: gid("mem"), text, source, at: new Date().toISOString(), ...(platform ? { platform } : {}) }, ...s.memories] })),
  removeMemory: (id) => set((s) => ({ memories: s.memories.filter((m) => m.id !== id) })),
  reset: () => set(initial()),
}));

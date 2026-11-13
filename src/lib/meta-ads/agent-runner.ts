"use client";

// Plays one agent turn: tool steps (and specialists, and a task list) appear
// one by one, then the reply, proposed changes and any document. Lives outside
// React so closing the chat mid-turn is safe. The backend version streams the
// same events (step, team, todo, text, change, doc) over NDJSON.

import { planAgentTurn, type AgentPlan } from "./agent-sim";
import { replyToComment } from "./agent-docs";
import { reviseDoc, type DocComment } from "./docs";
import { gid } from "./mutations";
import { activeChatOf, useMetaAds } from "./store";
import { useBusinessStore } from "@/lib/ads-shared/business-store";

export function runAgentTurn(text: string): void {
  const message = text.trim();
  const store = useMetaAds.getState();
  const state = store.accountId ? store.accounts[store.accountId] : null;
  if (!message || store.agentBusy || !state) return;

  // The turn belongs to the chat that was open when it started, even if the user opens another tab meanwhile.
  const chat = activeChatOf(state);
  const chatId = chat.id;
  const planMode = chat.mode === "plan";
  store.addMessage({ id: gid("msg"), role: "user", text: message, at: new Date().toISOString() }, chatId);
  const sim = planAgentTurn(message, {
    data: state.data,
    range: store.range,
    scope: store.scope,
    profile: useBusinessStore.getState().profile,
    memories: useBusinessStore.getState().memories,
    docs: state.docs,
    activeDocId: state.activeTab !== "account" ? state.activeTab : undefined,
    catalogConnected: store.catalog.status === "connected" && !!store.catalog.catalogId,
  });
  // Plan mode: the agent explains what it would do and prepares nothing to approve.
  const plan: AgentPlan = planMode
    ? {
        ...sim,
        changes: [],
        draftBundle: undefined,
        reply: sim.changes.length || sim.draftBundle ? `${sim.reply}\n\n_Plan mode: I haven't prepared any change. Switch to **Agent** and ask again to get it ready for your approval._` : sim.reply,
      }
    : sim;
  const agentId = gid("msg");
  store.addMessage(
    {
      id: agentId,
      role: "agent",
      text: "",
      at: new Date().toISOString(),
      steps: [],
      team: plan.team?.map((t) => ({ ...t, status: "WAITING" as const })),
      todo: plan.todo?.map((label) => ({ label, done: false })),
    },
    chatId
  );
  store.setAgentBusy(true, chatId);

  // The turn belongs to this account; drop it if the user switches away.
  const accountId = store.accountId;
  const stillHere = () => useMetaAds.getState().accountId === accountId;
  const patch = (p: Parameters<ReturnType<typeof useMetaAds.getState>["patchMessage"]>[1]) => stillHere() && useMetaAds.getState().patchMessage(agentId, p);

  let delay = 350;
  if (plan.team?.length) {
    delay += 300;
    window.setTimeout(() => patch({ team: plan.team!.map((t) => ({ ...t, status: "WORKING" as const })) }), delay);
  }
  plan.steps.forEach((_, i) => {
    delay += (plan.team ? 650 : 420) + Math.round(Math.random() * 380);
    window.setTimeout(() => {
      const doneTeam = plan.team ? Math.round(((i + 1) / plan.steps.length) * plan.team.length) : 0;
      patch({
        steps: plan.steps.slice(0, i + 1),
        todo: plan.todo?.map((label, j) => ({ label, done: j <= i })),
        team: plan.team?.map((t, j) => ({ ...t, status: j < doneTeam ? ("DONE" as const) : ("WORKING" as const) })),
      });
    }, delay);
  });
  window.setTimeout(() => {
    const s = useMetaAds.getState();
    if (!stillHere()) {
      s.setAgentBusy(false);
      return;
    }
    const changeIds = plan.changes.map((c) => s.propose({ ...c, messageId: agentId }).id);
    let docId: string | undefined;
    let docAction: "created" | "updated" | undefined;
    if (plan.doc) {
      s.createDoc(plan.doc);
      docId = plan.doc.id;
      docAction = "created";
    }
    if (plan.docUpdate) {
      const { docId: id, sections, note, extra } = plan.docUpdate;
      s.updateDoc(id, (d) => reviseDoc(d, sections, note, "AGENT", extra));
      s.openDoc(id);
      docId = id;
      docAction = "updated";
    }
    if (plan.memory) s.addMemory(plan.memory, "YOU");
    s.patchMessage(agentId, {
      text: plan.reply,
      changeIds,
      followUps: plan.followUps,
      viewHint: plan.viewHint,
      draftBundle: plan.draftBundle,
      questions: plan.questions,
      docId,
      docAction,
      docNote: plan.docUpdate?.note,
      memoryAdded: plan.memory,
      team: plan.team?.map((t) => ({ ...t, status: "DONE" as const })),
      todo: plan.todo?.map((label) => ({ label, done: true })),
    });
    if (plan.viewHint && !plan.doc && !plan.docUpdate) {
      s.setActiveTab("account");
      s.setScope(s.scope, plan.viewHint);
    }
    s.setAgentBusy(false);
  }, delay + 500);
}

/** User comments on a document section; the agent answers in the thread and may edit. */
export function commentOnDoc(docId: string, sectionId: string, text: string): void {
  const store = useMetaAds.getState();
  const state = store.accountId ? store.accounts[store.accountId] : null;
  const doc = state?.docs.find((d) => d.id === docId);
  if (!state || !doc || !text.trim()) return;
  const comment: DocComment = { id: gid("cm"), sectionId, author: "YOU", text: text.trim(), at: new Date().toISOString(), replies: [] };
  store.updateDoc(docId, (d) => ({ ...d, comments: [...d.comments, comment] }));
  window.setTimeout(() => {
    const s = useMetaAds.getState();
    const acc = s.accountId ? s.accounts[s.accountId] : null;
    const current = acc?.docs.find((d) => d.id === docId);
    if (!acc || !current) return;
    const { reply, edit } = replyToComment(current, comment, { data: acc.data, range: s.range, scope: s.scope, profile: useBusinessStore.getState().profile, memories: useBusinessStore.getState().memories, docs: acc.docs, activeDocId: docId });
    s.updateDoc(docId, (d) => {
      const withReply = { ...d, comments: d.comments.map((c) => (c.id === comment.id ? { ...c, replies: [...c.replies, { author: "AGENT" as const, text: reply, at: new Date().toISOString() }], resolved: !!edit } : c)) };
      return edit ? reviseDoc(withReply, edit.sections, `${edit.note} (from a comment)`, "AGENT", edit.extra) : withReply;
    });
  }, 1400);
}

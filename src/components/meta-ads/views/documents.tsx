"use client";

import { useState } from "react";
import { CalendarClock, ChevronRight, FileText, Link2, MessageSquare, Plus } from "lucide-react";
import { runAgentTurn } from "@/lib/meta-ads/agent-runner";
import { DOC_FOLDERS, DOC_TYPES, type DocFolder, type DocType } from "@/lib/meta-ads/docs";
import { useMetaAds } from "@/lib/meta-ads/store";
import { Card, EmptyState, Pill, Segmented, ViewHeader } from "@/components/google-ads/ga-ui";
import { useMa } from "../use-ma";

function ago(iso: string) {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

const FOLDERS = Object.keys(DOC_FOLDERS) as DocFolder[];

/** Documents are organised in two folders: Reports (with the ready templates) and Plans. */
export function DocumentsView() {
  const { acc } = useMa();
  const [folder, setFolder] = useState<DocFolder | null>(null);
  const countIn = (f: DocFolder) => acc.docs.filter((d) => DOC_TYPES[d.type].folder === f).length;

  if (!folder) {
    return (
      <div className="space-y-6">
        <ViewHeader title="Documents" subtitle="Everything the agent wrote for you, in two folders. Each document opens in its own tab beside the chat, where you can discuss and edit it." />
        <div className="grid gap-3 sm:grid-cols-2">
          {FOLDERS.map((f) => (
            <button key={f} type="button" onClick={() => setFolder(f)} className="text-left">
              <Card className="flex h-full items-center gap-4 p-5 transition-shadow hover:shadow-md">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#400095]/10 to-[#F76D01]/15 text-3xl">{DOC_FOLDERS[f].emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-base font-bold">
                    {DOC_FOLDERS[f].label}
                    <Pill>{countIn(f)}</Pill>
                  </span>
                  <span className="block text-xs text-muted-foreground">{DOC_FOLDERS[f].blurb}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Card>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return <FolderView folder={folder} onBack={() => setFolder(null)} />;
}

export function FolderView({ folder, onBack }: { folder: DocFolder; onBack: () => void }) {
  const { acc } = useMa();
  const openDoc = useMetaAds((s) => s.openDoc);
  const agentBusy = useMetaAds((s) => s.agentBusy);
  const [filter, setFilter] = useState<"ALL" | "DRAFT" | "APPROVED">("ALL");
  const inFolder = acc.docs.filter((d) => DOC_TYPES[d.type].folder === folder);
  const docs = inFolder.filter((d) => filter === "ALL" || d.status === filter);
  const meta = DOC_FOLDERS[folder];

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <button type="button" onClick={onBack} className="hover:text-foreground hover:underline">Documents</button>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground">{meta.label}</span>
        </p>
        <ViewHeader title={meta.label} subtitle={meta.blurb} />
      </div>

      {folder === "REPORTS" && (
        <section>
          <p className="mb-2 text-sm font-bold">Ready templates</p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {(Object.keys(DOC_TYPES) as DocType[]).map((t) => (
              <button
                key={t}
                type="button"
                disabled={agentBusy}
                onClick={() => runAgentTurn(DOC_TYPES[t].prompt)}
                className="group flex items-start gap-3 rounded-2xl border border-border/60 bg-card p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-[#400095]/30 hover:shadow-md disabled:opacity-50"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#400095]/10 to-[#F76D01]/15 text-xl">{DOC_TYPES[t].emoji}</span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1 text-sm font-semibold">
                    {DOC_TYPES[t].label}
                    <Plus className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                  <span className="block text-[11px] text-muted-foreground">{DOC_TYPES[t].blurb}</span>
                  <span className="mt-1 block truncate text-[10px] italic text-[#400095]/80 dark:text-violet-300/80">“{DOC_TYPES[t].prompt}”</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center gap-3">
          <p className="text-sm font-bold">{folder === "REPORTS" ? "Your reports" : "Your plans"}</p>
          <Segmented value={filter} onChange={setFilter} size="xs" options={[{ value: "ALL", label: "All", count: inFolder.length }, { value: "DRAFT", label: "Drafts" }, { value: "APPROVED", label: "Approved" }]} />
        </div>
        {!docs.length ? (
          <EmptyState
            icon={FileText}
            title={folder === "REPORTS" ? "No reports yet" : "No plans yet"}
            body={folder === "REPORTS" ? "Pick a template above or ask the agent for a report, an audit or research, and it will appear here." : "Ask the agent for a campaign, budget or experiment plan and it will appear here."}
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {docs.map((d) => (
              <button key={d.id} type="button" onClick={() => openDoc(d.id)} className="text-left">
                <Card className="flex h-full gap-3 p-4 transition-shadow hover:shadow-md">
                  <span className="text-2xl leading-none">{DOC_TYPES[d.type].emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold">{d.title}</p>
                      <Pill tone={d.status === "APPROVED" ? "good" : "neutral"}>{d.status === "APPROVED" ? "Approved" : "Draft"}</Pill>
                    </div>
                    <p className="truncate text-[11px] text-muted-foreground">{d.subtitle}</p>
                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                      <span>v{d.version} · updated {ago(d.updatedAt)}</span>
                      <span>{d.sections.length} sections</span>
                      {d.comments.length > 0 && <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {d.comments.length}</span>}
                      {d.schedule && <span className="inline-flex items-center gap-1 text-sky-700"><CalendarClock className="h-3 w-3" /> {d.schedule.frequency.toLowerCase()}</span>}
                      {d.shareUrl && <span className="inline-flex items-center gap-1"><Link2 className="h-3 w-3" /> shared</span>}
                    </p>
                  </div>
                </Card>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

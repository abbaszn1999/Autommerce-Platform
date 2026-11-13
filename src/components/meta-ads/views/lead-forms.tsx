"use client";

import { useMemo, useState } from "react";
import { ClipboardList } from "lucide-react";
import { Card, EmptyState, Pill, Segmented, ViewHeader } from "@/components/google-ads/ga-ui";
import { GaTable, type GaColumn } from "@/components/google-ads/ga-table";
import type { Lead, LeadForm } from "@/lib/meta-ads/types";
import { AskButton, Note, timeAgo } from "../ma-common";
import { useMa } from "../use-ma";

const QUALITY_TONE = { HIGH: "good", MEDIUM: "info", LOW: "bad", UNKNOWN: "neutral" } as const;

/** Instant forms and the leads they collected, with quality so volume doesn't hide junk. */
export function LeadFormsView() {
  const { data } = useMa();
  const [tab, setTab] = useState<"forms" | "leads">("forms");
  const [formId, setFormId] = useState<string>("ALL");

  const leads = useMemo(() => data.leads.filter((l) => formId === "ALL" || l.formId === formId), [data.leads, formId]);
  const low = data.leads.filter((l) => l.quality === "LOW").length;

  const formColumns: GaColumn<LeadForm>[] = [
    { id: "name", header: "Form", sticky: true, sortValue: (f) => f.name, render: (f) => <span className="font-semibold">{f.name}</span> },
    { id: "type", header: "Type", render: (f) => <Pill tone={f.type === "HIGHER_INTENT" ? "brand" : "neutral"}>{f.type === "HIGHER_INTENT" ? "Higher intent" : "More volume"}</Pill> },
    { id: "status", header: "Status", render: (f) => <Pill tone={f.status === "ACTIVE" ? "good" : "neutral"}>{f.status === "ACTIVE" ? "Active" : "Archived"}</Pill> },
    { id: "q", header: "Questions", render: (f) => <span className="text-muted-foreground">{f.questions.join(", ")}</span> },
    { id: "leads", header: "Leads", align: "right", sortValue: (f) => data.leads.filter((l) => l.formId === f.id).length, render: (f) => data.leads.filter((l) => l.formId === f.id).length },
    { id: "created", header: "Created", render: (f) => <span className="whitespace-nowrap text-muted-foreground">{f.createdAt.slice(0, 10)}</span> },
  ];
  const leadColumns: GaColumn<Lead>[] = [
    { id: "name", header: "Lead", sticky: true, sortValue: (l) => l.name, render: (l) => <span className="font-semibold">{l.name}</span> },
    { id: "email", header: "Email", render: (l) => <span className="text-muted-foreground">{l.email}</span> },
    { id: "phone", header: "Phone", render: (l) => <span className="whitespace-nowrap text-muted-foreground">{l.phone}</span> },
    { id: "form", header: "Form", render: (l) => <span className="whitespace-nowrap text-muted-foreground">{data.leadForms.find((f) => f.id === l.formId)?.name}</span> },
    { id: "quality", header: "Quality", sortValue: (l) => l.quality, render: (l) => <Pill tone={QUALITY_TONE[l.quality]}>{l.quality.toLowerCase()}</Pill> },
    { id: "status", header: "Status", render: (l) => <Pill>{l.status.toLowerCase()}</Pill> },
    { id: "at", header: "Received", sortValue: (l) => l.createdAt, render: (l) => <span className="whitespace-nowrap text-muted-foreground">{timeAgo(l.createdAt)}</span> },
  ];

  if (!data.leadForms.length) {
    return (
      <div>
        <ViewHeader title="Lead forms" subtitle="Instant forms collect leads without leaving Facebook or Instagram." />
        <EmptyState icon={ClipboardList} title="No lead forms yet" body="Ask the agent to create a Leads campaign. It writes the form and the ads together." action={<AskButton primary prompt="Create a Leads campaign for a gym membership in UAE with $40/day">Create a Leads campaign</AskButton>} />
      </div>
    );
  }

  return (
    <div>
      <ViewHeader title="Lead forms" subtitle="Instant forms and the leads they collected." actions={<AskButton prompt="Review my lead quality and suggest changes">Review lead quality</AskButton>}>
        <Segmented value={tab} onChange={setTab} size="xs" options={[{ value: "forms", label: "Forms", count: data.leadForms.length }, { value: "leads", label: "Leads", count: data.leads.length }]} />
      </ViewHeader>
      {low / Math.max(1, data.leads.length) > 0.3 && (
        <Note tone="warn">
          {Math.round((low / data.leads.length) * 100)}% of leads are low quality. A &quot;Higher intent&quot; form adds a review step and usually cuts junk. Optimizing for quality leads helps too.
        </Note>
      )}
      {tab === "forms" ? (
        <GaTable rows={data.leadForms} columns={formColumns} rowKey={(f) => f.id} empty="No forms." />
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Form</span>
            <select value={formId} onChange={(e) => setFormId(e.target.value)} className="h-8 rounded-lg border border-border/70 bg-background px-2 text-xs">
              <option value="ALL">All forms</option>
              {data.leadForms.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <Card className="overflow-hidden">
            <GaTable rows={leads} columns={leadColumns} rowKey={(l) => l.id} exportName="leads" defaultSort={{ id: "at", dir: "desc" }} empty="No leads yet." />
          </Card>
        </>
      )}
    </div>
  );
}

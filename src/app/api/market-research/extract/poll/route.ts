import { NextRequest, NextResponse } from "next/server";
import {
  extractPollBodySchema,
  jsonError,
  requireMrWrite,
} from "@/lib/market-research/api-schema";
import {
  abortActiveMrExtractRuns,
  advanceMrExtract,
  finishRunningExtract,
  isExtractTimedOut,
  loadMrExtractHeader,
} from "@/lib/market-research/extract-advance";
import { requestJobCancel } from "@/lib/jobs/repo";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = extractPollBodySchema.safeParse(json);
  if (!parsed.success) {
    return jsonError("Invalid poll payload", 400);
  }

  const auth = await requireMrWrite(parsed.data.workspaceId);
  if (!auth.ok) return auth.response;

  try {
    const extract = await loadMrExtractHeader(auth.admin, {
      workspaceId: parsed.data.workspaceId,
      projectId: parsed.data.projectId,
      extractId: parsed.data.extractId,
    });
    if (!extract) return jsonError("Extract not found", 404);

    if (isExtractTimedOut(extract.created_at) && extract.status === "running") {
      if (extract.job_run_id) {
        await requestJobCancel(
          auth.admin,
          extract.job_run_id,
          parsed.data.workspaceId
        ).catch(() => undefined);
      }
      const runs = await abortActiveMrExtractRuns(auth.admin, extract.id);
      const rowsReturned = runs.reduce(
        (sum, run) => sum + (Number(run.rows_returned) || 0),
        0
      );
      const settled = await finishRunningExtract(auth.admin, {
        extract,
        rowsReturned,
        status: "failed",
        runs,
      });
      return NextResponse.json(
        {
          seeds: runs.map((run) => ({
            seedId: run.seed_id,
            term: run.seed_term,
            runId: run.apify_run_id ?? "",
            datasetId: run.dataset_id ?? undefined,
            status: run.status,
            rows: [],
            rowsReturned: run.rows_returned,
          })),
          allDone: true,
          rowsReturned,
          sample: settled.sample,
        },
        { headers: auth.headers }
      );
    }

    const result = await advanceMrExtract(auth.admin, {
      workspaceId: parsed.data.workspaceId,
      projectId: parsed.data.projectId,
      extractId: parsed.data.extractId,
      clientCursors: parsed.data.cursors,
    });

    return NextResponse.json(
      {
        seeds: result.seeds,
        allDone: result.allDone,
        rowsReturned: result.rowsReturned,
        sample: result.sample,
      },
      { headers: auth.headers }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Extract not found") return jsonError("Extract not found", 404);
    // Never forward the raw provider error to the client — it can carry our
    // vendor's name, actor ids, or request paths in its message.
    console.error("[mr-extract] Failed to poll extract:", error);
    return NextResponse.json(
      { error: "Failed to poll extraction progress." },
      { status: 500, headers: auth.headers }
    );
  }
}

import { createAdminClient } from "@/lib/supabase-admin";
import {
  abortActiveMrExtractRuns,
  advanceMrExtract,
  finishRunningExtract,
  isExtractTimedOut,
  loadMrExtractHeader,
  seedIsFinished,
} from "@/lib/market-research/extract-advance";
import { runJobWithFailureGuard } from "./guard";
import { notifyJobEvent } from "./notify";
import {
  finishJobRun,
  isJobCancelRequested,
  loadJobRun,
  markJobRunning,
  touchJobHeartbeat,
} from "./repo";

const PUMP_BUDGET_MS = 45_000;
const TICK_MS = 800;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runMrExtractSession(runId: string): Promise<void> {
  await runJobWithFailureGuard(runId, () => runMrExtractSessionInner(runId));
}

async function abortAndSettle(
  admin: ReturnType<typeof createAdminClient>,
  extractId: string,
  workspaceId: string,
  projectId: string,
  status: "aborted" | "failed"
): Promise<{ rowsReturned: number }> {
  const extract = await loadMrExtractHeader(admin, {
    workspaceId,
    projectId,
    extractId,
  });
  if (!extract) return { rowsReturned: 0 };

  const runs = await abortActiveMrExtractRuns(admin, extract.id);
  const rowsReturned = runs.reduce(
    (sum, run) => sum + (Number(run.rows_returned) || 0),
    0
  );
  await finishRunningExtract(admin, {
    extract,
    rowsReturned,
    status,
    runs,
  });
  return { rowsReturned };
}

async function runMrExtractSessionInner(runId: string): Promise<void> {
  const admin = createAdminClient();
  const job = await loadJobRun(admin, runId);
  if (!job || job.kind !== "mr_extract") return;
  if (job.status === "cancelled") return;

  await markJobRunning(admin, job.id);
  const extractId = job.session_id;
  const workspaceId = job.workspace_id;
  const projectId = String(job.settings.projectId || "");
  if (!projectId) {
    const failed = await finishJobRun(admin, job.id, {
      status: "failed",
      completedCount: 0,
      failedCount: 1,
      lastError: "Extract job is missing projectId",
    });
    if (failed) await notifyJobEvent(failed, "failed", admin);
    return;
  }

  const header = await loadMrExtractHeader(admin, {
    workspaceId,
    projectId,
    extractId,
  });
  if (!header) {
    const failed = await finishJobRun(admin, job.id, {
      status: "failed",
      completedCount: 0,
      failedCount: 1,
      lastError: "Extract not found",
    });
    if (failed) await notifyJobEvent(failed, "failed", admin);
    return;
  }

  if (header.status !== "running") {
    const status =
      header.status === "aborted"
        ? "cancelled"
        : header.status === "failed"
          ? "failed"
          : "completed";
    const finished = await finishJobRun(admin, job.id, {
      status,
      completedCount:
        status === "completed" ? Math.max(job.target_ids.length, 1) : 0,
      failedCount: status === "failed" ? 1 : 0,
      lastError: status === "failed" ? "Extract failed" : null,
    });
    if (finished?.status === "completed") {
      await notifyJobEvent(finished, "completed", admin);
    } else if (finished?.status === "failed") {
      await notifyJobEvent(finished, "failed", admin);
    }
    return;
  }

  if (isExtractTimedOut(header.created_at)) {
    const settled = await abortAndSettle(
      admin,
      extractId,
      workspaceId,
      projectId,
      "failed"
    );
    const failed = await finishJobRun(admin, job.id, {
      status: "failed",
      completedCount: settled.rowsReturned,
      failedCount: 1,
      lastError: "Extract exceeded the 24-hour limit",
    });
    if (failed) await notifyJobEvent(failed, "failed", admin);
    return;
  }

  const deadline = Date.now() + PUMP_BUDGET_MS;
  while (Date.now() < deadline) {
    if (await isJobCancelRequested(admin, job.id)) {
      const settled = await abortAndSettle(
        admin,
        extractId,
        workspaceId,
        projectId,
        "aborted"
      );
      await finishJobRun(admin, job.id, {
        status: "cancelled",
        completedCount: settled.rowsReturned,
        failedCount: 0,
        lastError: null,
      });
      return;
    }

    const result = await advanceMrExtract(admin, {
      workspaceId,
      projectId,
      extractId,
    });

    const stillRunning = await loadJobRun(admin, job.id);
    if (stillRunning?.status === "cancelled") {
      await abortAndSettle(
        admin,
        extractId,
        workspaceId,
        projectId,
        "aborted"
      );
      return;
    }
    if (
      (await isJobCancelRequested(admin, job.id)) &&
      !result.allDone
    ) {
      const settled = await abortAndSettle(
        admin,
        extractId,
        workspaceId,
        projectId,
        "aborted"
      );
      await finishJobRun(admin, job.id, {
        status: "cancelled",
        completedCount: settled.rowsReturned,
        failedCount: 0,
        lastError: null,
      });
      return;
    }

    await touchJobHeartbeat(admin, job.id, {
      completed: result.seeds.filter((seed) =>
        seedIsFinished(seed.status, seed.nextCursor)
      ).length,
      failed: result.seeds.filter((seed) => seed.status === "failed").length,
    });

    if (result.allDone) {
      const failedCount = result.seeds.filter(
        (seed) => seed.status === "failed"
      ).length;
      const succeeded = result.seeds.filter(
        (seed) => seed.status === "succeeded"
      ).length;
      const aborted = result.seeds.some((seed) => seed.status === "aborted");
      const finished = await finishJobRun(admin, job.id, {
        status: aborted
          ? "cancelled"
          : failedCount === result.seeds.length && result.seeds.length > 0
            ? "failed"
            : "completed",
        completedCount: succeeded,
        failedCount,
        lastError: aborted
          ? "Extract cancelled"
          : failedCount === result.seeds.length && result.seeds.length > 0
            ? "Every seed failed"
            : null,
      });
      if (finished?.status === "completed") {
        await notifyJobEvent(finished, "completed", admin);
      } else if (finished?.status === "failed") {
        await notifyJobEvent(finished, "failed", admin);
      }
      return;
    }

    await sleep(TICK_MS);
  }

  const still = await loadJobRun(admin, job.id);
  if (!still || still.status !== "running") return;
  if (await isJobCancelRequested(admin, job.id)) {
    const settled = await abortAndSettle(
      admin,
      extractId,
      workspaceId,
      projectId,
      "aborted"
    );
    await finishJobRun(admin, job.id, {
      status: "cancelled",
      completedCount: settled.rowsReturned,
      failedCount: 0,
      lastError: null,
    });
    return;
  }

  // Slice the long Apify pull into 45s pumps so `after()` / HTTP limits cannot
  // stall settlement. The same job_run stays running; sweep resumes if this
  // redispatch never starts.
  const { dispatchJob } = await import("./dispatch");
  await dispatchJob(job.id, "mr_extract");
}


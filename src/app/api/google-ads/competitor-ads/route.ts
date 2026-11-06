import { NextRequest, NextResponse } from "next/server";
import { errorStatus, requireConnectionAccess } from "@/lib/google-ads/connection.server";
import { CompetitorInputError, parseTarget } from "@/lib/google-ads/competitor-ads";
import {
  CompetitorCreditsError,
  CompetitorUnavailableError,
  creditsPerPage,
  listAnalyses,
  quoteAnalysis,
  runAnalysis,
} from "@/lib/google-ads/competitor-ads.server";
import { regionNameIndex } from "@/lib/google-ads/keyword-planner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

let nameToCode: ((name: string) => string | undefined) | null = null;

/** The workspace's competitor lookups. */
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get("workspaceId") ?? "";
    const { admin } = await requireConnectionAccess(workspaceId);
    let perPage: number | null = null;
    try {
      perPage = creditsPerPage();
    } catch {
      // Not configured: the page says so when a lookup is tried.
    }
    return NextResponse.json({ analyses: await listAnalyses(admin, workspaceId), creditsPerPage: perPage });
  } catch (err) {
    return failed(err);
  }
}

/**
 * mode "quote": what a lookup would cost now (nothing when this month's shared
 * copy has it). mode "run": run or reopen it, charging our cost for what had
 * to be bought. Members who can work in the workspace (not viewers).
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const workspaceId = typeof body?.workspaceId === "string" ? body.workspaceId : "";
    const { admin, user, role } = await requireConnectionAccess(workspaceId);
    if (role === "viewer") return NextResponse.json({ error: "forbidden" }, { status: 403 });
    try {
      const target = parseTarget({ domain: body?.domain, country: body?.country }, (nameToCode ??= regionNameIndex()));
      const pages = Number(body?.pages) || 1;
      if (body?.mode === "quote") return NextResponse.json({ target, quote: await quoteAnalysis(admin, target, pages) });
      return NextResponse.json({ analysis: await runAnalysis({ admin, workspaceId, userId: user.id, target, pages }) });
    } catch (err) {
      if (err instanceof CompetitorInputError) return NextResponse.json({ error: "invalid", message: err.message }, { status: 422 });
      if (err instanceof CompetitorCreditsError)
        return NextResponse.json({ error: err.reason, message: err.message, needed: err.needed, balance: err.balance }, { status: 402 });
      throw err;
    }
  } catch (err) {
    return failed(err);
  }
}

function failed(err: unknown) {
  if (err instanceof CompetitorUnavailableError)
    return NextResponse.json({ error: "unavailable", message: "Competitor data is not available right now. Try again later; nothing was charged." }, { status: 503 });
  const { status, code } = errorStatus(err);
  if (status >= 500) console.error("[google-ads/competitor-ads]", code, (err as Error).message);
  return NextResponse.json({ error: code }, { status });
}

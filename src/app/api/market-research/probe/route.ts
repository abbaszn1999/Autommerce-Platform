import { NextRequest, NextResponse } from "next/server";
import {
  jsonError,
  probeBodySchema,
  requireMrWrite,
} from "@/lib/market-research/api-schema";
import { getKeywordProvider } from "@/lib/market-research/providers";
import { marketToSemrushDb } from "@/lib/market-research/providers/keyword-provider";
import { getMrProject, mergeProjectProbesAdmin } from "@/lib/market-research/server-persist";

export const maxDuration = 180;

export async function POST(request: NextRequest) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  const parsed = probeBodySchema.safeParse(json);
  if (!parsed.success) {
    return jsonError("Invalid probe payload", 400);
  }

  const auth = await requireMrWrite(parsed.data.workspaceId);
  if (!auth.ok) return auth.response;

  const project = await getMrProject(
    auth.admin,
    parsed.data.workspaceId,
    parsed.data.projectId
  );
  if (!project) {
    return jsonError("Project not found", 404);
  }

  const database = marketToSemrushDb(parsed.data.market);
  let results: Array<
    | { seedId: string; failed: true }
    | {
        seedId: string;
        failed: false;
        volume: number;
        keywordDifficulty: number;
        cpcUsd: number;
        intents: string[];
        keywordIdeasTotal: number;
        keywordIdeasTotalVolume: number;
        sampleKeywords: string[];
      }
  >;
  try {
    const metrics = await getKeywordProvider().fetchSeedMetrics(
      parsed.data.seeds.map((seed) => seed.term),
      database
    );
    const byTerm = new Map(
      metrics.map((row) => [row.seed.toLowerCase(), row])
    );
    results = parsed.data.seeds.map((seed) => {
      const match = byTerm.get(seed.term.trim().toLowerCase());
      if (!match) {
        return { seedId: seed.id, failed: true as const };
      }
      return {
        seedId: seed.id,
        failed: false as const,
        volume: match.volume,
        keywordDifficulty: match.keywordDifficulty,
        cpcUsd: match.cpcUsd,
        intents: match.intents,
        keywordIdeasTotal: match.keywordIdeasTotal,
        keywordIdeasTotalVolume: match.keywordIdeasTotalVolume,
        sampleKeywords: [
          ...match.relatedKeywords.slice(0, 3).map((row) => row.keyword),
          ...match.questions.slice(0, 2).map((row) => row.keyword),
        ],
      };
    });
  } catch (error) {
    // Never forward the raw provider error to the client — it can carry our
    // vendor's name, actor ids, or request paths in its message.
    console.error("[mr-probe] Demand probe failed:", error);
    return NextResponse.json(
      { error: "Demand check failed." },
      { status: 502, headers: auth.headers }
    );
  }

  const checkedAt = Date.now();
  await mergeProjectProbesAdmin(
    auth.admin,
    parsed.data.projectId,
    Object.fromEntries(
      results.map((row) => [
        row.seedId,
        row.failed
          ? {
              seedId: row.seedId,
              market: parsed.data.market,
              rawKeywords: 0,
              searchVolume: 0,
              sampleKeywords: [],
              checkedAt,
              failed: true,
            }
          : {
              seedId: row.seedId,
              market: parsed.data.market,
              rawKeywords: row.keywordIdeasTotal,
              searchVolume: row.keywordIdeasTotalVolume,
              sampleKeywords: row.sampleKeywords.slice(0, 5),
              checkedAt,
            },
      ])
    )
  );

  return NextResponse.json(
    {
      market: parsed.data.market,
      database,
      results,
    },
    { headers: auth.headers }
  );
}

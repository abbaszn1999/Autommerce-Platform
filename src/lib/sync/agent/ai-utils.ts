// Shared Gemini utilities for the sync agent: thinking level and API key.

/** Gemini 3 thinkingLevel — controls reasoning depth vs latency/cost.
 *  Maps to @google/genai ThinkingLevel enum values via resolveThinkingLevel(). */
export type SyncThinkingLevel = "low" | "medium" | "high";

/** Resolve our string thinkingLevel to the @google/genai enum value the SDK
 *  accepts in `thinkingConfig.thinkingLevel`. Lazy-imports the SDK so this
 *  module stays cheap to load on cold paths. */
export async function resolveThinkingLevel(
  level: SyncThinkingLevel
): Promise<unknown> {
  const { ThinkingLevel } = await import("@google/genai");
  switch (level) {
    case "low":
      return ThinkingLevel.LOW;
    case "medium":
      return ThinkingLevel.MEDIUM;
    case "high":
      return ThinkingLevel.HIGH;
  }
}

export function requireGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("AI service not configured (GEMINI_API_KEY missing)");
  return key;
}

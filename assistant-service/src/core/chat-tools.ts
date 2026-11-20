import { promises as fs } from "node:fs";
import path from "node:path";
import type { SDKCustomTool } from "@cursor/sdk";
import { MAX_QUESTIONS_PER_CARD } from "../../../src/lib/store-agent/protocol";
import { MAX_SYNC_BYTES, resolveInChat } from "./files";
import { failure, setChatStatus, text, type ToolContext } from "./tool-helpers";

/** Files the panel can show; anything else only gets a download link there. */
const PREVIEWABLE = /\.(md|txt|csv|tsv|json|jsonl|html?|xml|ya?ml|log|js|mjs|ts|css|png|jpe?g|webp|gif|svg|pdf|xlsx|docx|mp4|webm|mp3|wav)$/i;

/** The chat tools every agent has: ask the user a question, and open a file in the panel. */
export function createChatTools(ctx: ToolContext): Record<string, SDKCustomTool> {
  return {
    ask_user: {
      description:
        "Ask the user what you need to know, in one card, and wait for the answers. Ask only what you genuinely cannot decide well yourself " +
        "(which products, which tone, which of several options, what limit); as many questions as the task really needs, often just one. " +
        "Each question has short clickable options; the user can also type their own answer.",
      inputSchema: {
        type: "object",
        properties: {
          questions: {
            type: "array",
            minItems: 1,
            maxItems: MAX_QUESTIONS_PER_CARD,
            items: {
              type: "object",
              properties: {
                question: { type: "string", description: "The question, in the user's language." },
                options: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 },
                multiple: { type: "boolean", description: "Allow choosing several options." },
              },
              required: ["question", "options"],
            },
          },
        },
        required: ["questions"],
      },
      execute: async (args) => {
        // Also accept a single top-level question.
        const raw = Array.isArray(args.questions) ? args.questions : [args];
        const questions = raw.slice(0, MAX_QUESTIONS_PER_CARD).map((q, i) => {
          const item = (q ?? {}) as Record<string, unknown>;
          return {
            id: `q${i + 1}`,
            text: String(item.question ?? "").trim(),
            options: Array.isArray(item.options) ? item.options.map(String).filter(Boolean).slice(0, 6) : [],
            multiple: item.multiple === true,
          };
        });
        if (!questions.length || questions.some((q) => !q.text || q.options.length < 2)) {
          return failure("Give every question its text and at least two options.");
        }
        await setChatStatus(ctx, "awaiting_answer");
        const { answer } = ctx.run.ask(questions);
        const answers = await answer;
        await setChatStatus(ctx, "running");
        if (!answers) {
          return failure(ctx.run.cancelled ? "The run was stopped." : "The user did not answer in time. Stop and say what you need from them.");
        }
        (ctx.consent ??= { declinedAt: null, answeredAt: null }).answeredAt = Date.now();
        if (!Array.isArray(answers)) {
          return text(
            `The user did not use the card; they wrote in the chat instead:\n"${answers.message}"\n` +
              "Take it as their answer, or as a new instruction if it is one, and carry on."
          );
        }
        return text(
          "The user answered:\n" +
            questions.map((q, i) => `${i + 1}. ${q.text}\n   → ${(answers[i] ?? []).join(" | ") || "(no answer)"}`).join("\n")
        );
      },
    },

    show_file: {
      description:
        "Open a file from your folder in the panel on the right of the user's screen: a report (.md), a table (.csv/.json), " +
        "a product gallery (.json array of objects with image/title/price), an image or a plan. Write the file first (write_file), then call this.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Path inside your folder." },
          folder: {
            type: "string",
            enum: ["store_data", "reports", "images"],
            description: "Optional: where it belongs when it is not obvious. A gallery of web images: images. A table of your analysis or comparison: reports. A table of store records you wrote yourself: store_data.",
          },
        },
        required: ["path"],
      },
      execute: async (args) => {
        let relative: string;
        try {
          const local = resolveInChat(ctx.files.cwd, String(args.path ?? ""));
          await fs.access(local);
          relative = path.relative(ctx.files.cwd, local).split(path.sep).join("/");
        } catch (error) {
          return failure((error as Error).message || `There is no file at ${args.path}.`);
        }
        // The panel takes files up to MAX_SYNC_BYTES: a bigger one would never reach the user.
        const size = (await fs.stat(resolveInChat(ctx.files.cwd, relative))).size;
        if (size > MAX_SYNC_BYTES)
          return failure(
            `${relative} is ${(size / 1024 / 1024).toFixed(1)} MB, more than the panel can show (${MAX_SYNC_BYTES / 1024 / 1024} MB). ` +
              "Show a smaller file instead (split it, or a summary or the rows that matter), and tell the user the full file is too large to open here."
          );
        try {
          if (typeof args.folder === "string") ctx.files.setFolderHint(relative, args.folder);
          await ctx.files.sync(ctx.run, new Set([relative]));
          return text(
            PREVIEWABLE.test(relative) ? `Shown to the user: ${relative}` : `${relative} is open in the panel with its name, type and a download button: this format has no preview.`
          );
        } catch (error) {
          // The file is safe in the folder; only the upload to the panel failed.
          ctx.files.openWhenSynced(relative);
          ctx.log?.(`show_file upload deferred for ${relative}`, error);
          return text(
            `${relative} is saved. The connection to the user's screen is unstable, so it will open there automatically as soon as it recovers. ` +
              "Do not retry, convert or recreate the file; continue with the task."
          );
        }
      },
    },
  };
}

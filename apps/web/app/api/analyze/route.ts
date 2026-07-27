import { config as loadEnv } from "dotenv";
loadEnv({ path: "../../.env" });

import Anthropic from "@anthropic-ai/sdk";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import {
  TRIAGE_SYSTEM_PROMPT,
  TRIAGE_TOOL,
  buildBatchedDeepPassPrompt,
  BATCHED_DEEP_PASS_TOOL,
} from "@estate-app/ai-pipeline";
import {
  openDb,
  insertPhoto,
  insertTriageItems,
  insertDeepPassResults,
  type TriageItemRow,
  type DeepPassRow,
} from "@estate-app/db";

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

// Same phase0.db everything else has been writing to — one source of
// truth for the Review tab regardless of whether an item got there via
// the CLI or this upload flow.
const DB_PATH = join(process.cwd(), "..", "phase0-cli", "phase0.db");
const UPLOAD_DIR = join(process.cwd(), "public", "uploaded-photos");

async function callWithForcedTool(
  model: string,
  systemPrompt: string,
  imageBase64: string,
  mediaType: string,
  tool: { name: string; description: string; input_schema: unknown },
  maxTokens: number = 4000
): Promise<any> {
  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    tools: [tool as any],
    tool_choice: { type: "tool", name: tool.name },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType as any, data: imageBase64 },
          },
          {
            type: "text",
            text: "Identify the items in this photo per your instructions, and call the tool with your findings.",
          },
        ],
      },
    ],
  });

  // A truncated response (hit max_tokens mid-generation) can produce an
  // incomplete or empty tool_use.input rather than a clean error — check
  // for this explicitly so it surfaces as "response was cut off," not a
  // confusing "missing items array" a level up.
  if (response.stop_reason === "max_tokens") {
    throw new Error(
      `Response was truncated — hit the ${maxTokens} token limit mid-generation. Needs a higher max_tokens for this call (likely too many items for the current budget).`
    );
  }

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || !("input" in toolUse)) {
    throw new Error("Model did not return a tool_use block as expected.");
  }
  return toolUse.input;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("photo") as File | null;

    if (!file) {
      return Response.json({ error: "No photo uploaded." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");
    const mediaType = file.type || "image/jpeg";

    // Save the photo where the Review tab can actually display it.
    if (!existsSync(UPLOAD_DIR)) await mkdir(UPLOAD_DIR, { recursive: true });
    const safeFilename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
    await writeFile(join(UPLOAD_DIR, safeFilename), buffer);

    // Step 1: triage (Haiku) — must complete first now, since the
    // batched deep-pass needs to know WHICH items to analyze and can't
    // run in parallel with triage anymore (it did when deep-pass was
    // blindly analyzing "the whole photo" — now it needs triage's item
    // list as input).
    const triageResult = await callWithForcedTool(
      "claude-haiku-4-5-20251001",
      TRIAGE_SYSTEM_PROMPT,
      base64,
      mediaType,
      TRIAGE_TOOL
    );
    if (!Array.isArray(triageResult.items)) {
      throw new Error(
        `Triage response missing expected "items" array. Got: ${JSON.stringify(triageResult).slice(0, 500)}`
      );
    }
    const triageItems = triageResult.items as TriageItemRow[];

    // Step 2: decide which items are worth the expensive deep-pass call.
    // Simple version of the trigger rule resolved in docs/architecture.md
    // (skip low-tier items — they're headed for bundling, not individual
    // deep analysis). A finer category-variance version can replace this
    // later without changing anything downstream.
    const qualifyingItems = triageItems.filter(
      (item) => item.valueTier === "high" || item.valueTier === "medium"
    );

    let deepPassResults: DeepPassRow[] = [];
    if (qualifyingItems.length > 0) {
      // Step 3: ONE batched Sonnet call covering every qualifying item —
      // pays image-token cost once regardless of how many items are in
      // it, per the cost/reliability trade-off recorded in
      // docs/architecture.md.
      const batchedPrompt = buildBatchedDeepPassPrompt(
        qualifyingItems.map((item) => ({ itemName: item.itemName, category: item.category }))
      );
      // Scale token budget with item count — a flat 4000 (fine for
      // triage's compact per-item output) isn't enough once several
      // items each need a full listing description + unresolved-attribute
      // detail. ~900 tokens/item plus overhead, capped at a sane ceiling.
      const batchedMaxTokens = Math.min(
        16000,
        1500 + qualifyingItems.length * 900
      );
      const batchedResult = await callWithForcedTool(
        "claude-sonnet-5",
        batchedPrompt,
        base64,
        mediaType,
        BATCHED_DEEP_PASS_TOOL,
        batchedMaxTokens
      );
      if (!Array.isArray(batchedResult.items)) {
        throw new Error(
          `Batched deep-pass response missing expected "items" array. Got: ${JSON.stringify(batchedResult).slice(0, 500)}`
        );
      }
      deepPassResults = batchedResult.items as DeepPassRow[];
    }

    const db = openDb(DB_PATH);
    const photoId = insertPhoto(db, safeFilename);
    insertTriageItems(db, photoId, triageItems);
    if (deepPassResults.length > 0) {
      insertDeepPassResults(db, photoId, deepPassResults);
    }

    return Response.json({
      success: true,
      photoId,
      filename: safeFilename,
      itemCount: triageItems.length,
      deepPassCount: deepPassResults.length,
    });
  } catch (err: any) {
    console.error("Analyze error:", err);
    return Response.json(
      { error: err.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

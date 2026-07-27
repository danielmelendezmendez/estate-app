/**
 * Phase 0 accuracy test — v3: structured output + SQLite.
 *
 * Usage:
 *   pnpm --filter phase0-cli dev ./photos-dir       (whole folder)
 *   pnpm --filter phase0-cli dev ./photos-dir/7.jpeg (single photo)
 *
 * What changed from v2:
 *   - Both models now respond via forced tool use (record_triage_items /
 *     record_deep_pass_result), returning real structured JSON instead of
 *     markdown/prose we'd have to regex-scrape. This is the actual "parsing
 *     fix" — force the shape at the API level rather than parse it after
 *     the fact.
 *   - Results are written into a local SQLite file (phase0.db) via
 *     @estate-app/db — open-source, single-file, genuinely SQL-queryable,
 *     right-sized for laptop-scale testing. Table shapes mirror
 *     @estate-app/schema so this ports to Postgres in Phase 1 rather than
 *     being throwaway.
 *   - phase0-results.md is now GENERATED FROM the database, not written
 *     directly from API responses — proving the DB is the actual source of
 *     truth, the markdown is just a rendered view of it.
 *   - Prints a live example SQL query result to the console (every
 *     non-high-confidence item across all processed photos) — this is
 *     literally "SQL calls for specific items", answered.
 *
 * Still true from before: Sonnet is fed the whole-room photo as a stand-in
 * for the real Phase 1 flow (one deep-pass call per flagged item, not per
 * photo) — see docs/architecture.md.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: "../../.env" });

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, readdirSync, writeFileSync, statSync } from "fs";
import { join, extname, basename } from "path";
import {
  TRIAGE_SYSTEM_PROMPT,
  DEEP_PASS_SYSTEM_PROMPT,
  TRIAGE_TOOL,
  DEEP_PASS_TOOL,
} from "@estate-app/ai-pipeline";
import {
  openDb,
  insertPhoto,
  insertTriageItems,
  insertDeepPassResult,
  queryNeedsReviewItems,
  queryHighValueItems,
  type TriageItemRow,
  type DeepPassRow,
} from "@estate-app/db";

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

async function callWithForcedTool<T>(
  model: string,
  systemPrompt: string,
  imagePath: string,
  tool: { name: string; description: string; input_schema: unknown }
): Promise<T> {
  const imageData = readFileSync(imagePath).toString("base64");
  const mediaType = extname(imagePath) === ".png" ? "image/png" : "image/jpeg";

  const response = await anthropic.messages.create({
    model,
    max_tokens: 2000,
    system: systemPrompt,
    tools: [tool as any],
    tool_choice: { type: "tool", name: tool.name },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: imageData },
          },
          {
            type: "text",
            text: "Identify the items in this photo per your instructions, and call the tool with your findings.",
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || !("input" in toolUse)) {
    throw new Error(
      `Model did not return a tool_use block as expected. Full response: ${JSON.stringify(response.content)}`
    );
  }
  return toolUse.input as T;
}

function resolveImageList(inputPath: string): { dir: string; files: string[] } {
  const stat = statSync(inputPath);

  if (stat.isFile()) {
    if (!IMAGE_EXTENSIONS.has(extname(inputPath).toLowerCase())) {
      console.error(`${inputPath} is not a recognized image file.`);
      process.exit(1);
    }
    return { dir: join(inputPath, ".."), files: [basename(inputPath)] };
  }

  const files = readdirSync(inputPath).filter((f) =>
    IMAGE_EXTENSIONS.has(extname(f).toLowerCase())
  );
  return { dir: inputPath, files };
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error(
      "Usage: pnpm --filter phase0-cli dev <photos-dir-or-single-photo>"
    );
    process.exit(1);
  }

  const { dir, files } = resolveImageList(inputPath);

  if (files.length === 0) {
    console.error(`No images found in ${inputPath}`);
    process.exit(1);
  }

  const db = openDb("./phase0.db");

  console.log(
    `Running ${files.length} photo(s) through Sonnet (ground truth) and Haiku (triage)...`
  );

  for (const file of files) {
    const imagePath = join(dir, file);
    console.log(`  ${file}...`);

    const [triageResult, deepPassResult] = await Promise.all([
      callWithForcedTool<{ items: TriageItemRow[] }>(
        "claude-haiku-4-5-20251001",
        TRIAGE_SYSTEM_PROMPT,
        imagePath,
        TRIAGE_TOOL
      ),
      callWithForcedTool<DeepPassRow>(
        "claude-sonnet-5",
        DEEP_PASS_SYSTEM_PROMPT,
        imagePath,
        DEEP_PASS_TOOL
      ),
    ]);

    const photoId = insertPhoto(db, file);
    insertTriageItems(db, photoId, triageResult.items);
    // Legacy single-item tool doesn't produce an itemName (see the new
    // batched mechanism in apps/web for the real per-item version) —
    // label it clearly rather than leave it blank.
    insertDeepPassResult(db, photoId, { ...deepPassResult, itemName: "(whole-photo focus item — legacy CLI test)" });
  }

  console.log("\nAll photos processed and stored in phase0.db. Generating report...\n");

  // --- Demo: this is the "SQL calls for specific items" part ---
  const needsReview = queryNeedsReviewItems(db);
  const highValue = queryHighValueItems(db);

  console.log(`Query — items needing review (confidence != 'high'): ${needsReview.length} found`);
  console.log(`Query — items flagged high value: ${highValue.length} found\n`);

  // --- Generate the human-readable report FROM the database ---
  const photos = db.prepare("SELECT id, filename FROM photos ORDER BY id").all() as {
    id: number;
    filename: string;
  }[];

  const sections = photos.map((photo) => {
    const triageItems = db
      .prepare(
        "SELECT item_name, category, value_tier, confidence, uncertainty_reason FROM triage_items WHERE photo_id = ?"
      )
      .all(photo.id) as {
      item_name: string;
      category: string;
      value_tier: string;
      confidence: string;
      uncertainty_reason: string | null;
    }[];

    const deepPass = db
      .prepare("SELECT * FROM deep_pass_results WHERE photo_id = ?")
      .get(photo.id) as any;

    const triageTable = [
      "| Item | Category | Value Tier | Confidence | Uncertainty |",
      "|---|---|---|---|---|",
      ...triageItems.map(
        (i) =>
          `| ${i.item_name} | ${i.category} | ${i.value_tier} | ${i.confidence} | ${i.uncertainty_reason ?? ""} |`
      ),
    ].join("\n");

    return `## ${photo.filename}

### Haiku triage (${triageItems.length} items, from phase0.db)

${triageTable}

### Sonnet deep pass (from phase0.db — whole-photo stand-in, see note at top of this file)

- Brand/Model: ${deepPass?.brand ?? "—"} / ${deepPass?.model ?? "—"}
- Category: ${deepPass?.category} ${deepPass?.subcategory ? `(${deepPass.subcategory})` : ""}
- Condition: ${deepPass?.condition} — ${deepPass?.condition_reason}
- Confidence: ${deepPass?.confidence}
- Value range: €${deepPass?.value_range_low}–€${deepPass?.value_range_high}
- Listing title: ${deepPass?.listing_title}
- Suggested price: €${deepPass?.suggested_price}
- Unresolved attributes: ${deepPass?.unresolved_attributes}

---
`;
  });

  const report = `# Phase 0 results (generated from phase0.db)

${photos.length} photo(s) processed. This file is a rendered view of the
SQLite database — the database, not this file, is the source of truth.
Query it directly with any SQLite tool if you want to slice the data
differently.

**Items needing review across all photos:** ${needsReview.length}
**Items flagged high value across all photos:** ${highValue.length}

---

${sections.join("\n")}`;

  writeFileSync("phase0-results.md", report);
  console.log(`Wrote phase0-results.md and phase0.db — both in apps/phase0-cli.`);
  console.log(`\nTry querying the DB directly, e.g.:`);
  console.log(`  sqlite3 phase0.db "SELECT item_name, category, confidence FROM triage_items WHERE confidence = 'low';"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

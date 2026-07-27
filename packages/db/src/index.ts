/**
 * SQLite storage for Phase 0 results.
 *
 * v2 change: switched from better-sqlite3 (a native module requiring a
 * C++ compiler toolchain — Visual Studio Build Tools on Windows — to
 * build) to node:sqlite, which ships built into Node.js itself since
 * v22.5. Zero native compilation, zero extra install step beyond Node
 * itself. Still experimental as of Node 24 (stabilizes in Node 26), so it
 * needs a --experimental-sqlite flag when running — see phase0-cli's
 * package.json dev script. The API is close enough to better-sqlite3
 * (same @paramName binding syntax) that this was a near drop-in swap.
 *
 * v3 change: deep_pass_results now stores ONE ROW PER ITEM, not one row
 * per photo — the fix for the "why does deep-dive only show the PC, not
 * the monitors" gap. Added an item_name column to correlate each result
 * back to its triage item. The table already had no unique constraint on
 * photo_id, so multiple rows per photo always worked at the storage
 * layer — getReviewData just wasn't reading them all.
 *
 * BREAKING: if you have an existing phase0.db from before this change,
 * delete it — CREATE TABLE IF NOT EXISTS won't retroactively add the new
 * item_name column to an already-existing table, and old rows won't have
 * one anyway. It'll recreate fresh with the new schema on next use.
 *
 * Table shapes deliberately mirror what's already defined in
 * @estate-app/schema, so porting this to Postgres in Phase 1 is a
 * translation, not a redesign.
 */

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "fs";
import { dirname } from "path";

export interface TriageItemRow {
  itemName: string;
  category: string;
  valueTier: "high" | "medium" | "low";
  confidence: "high" | "medium" | "low";
  uncertaintyReason?: string;
}

export interface DeepPassRow {
  itemName: string; // correlates back to the triage item this result is for
  brand?: string;
  model?: string;
  category: string;
  subcategory?: string;
  condition: string;
  conditionReason: string;
  confidence: "high" | "medium" | "low";
  unresolvedAttributes: unknown; // stored as JSON text
  valueRangeLow: number;
  valueRangeHigh: number;
  listingTitle: string;
  listingDescription: string;
  suggestedPrice: number;
}

export function openDb(dbPath: string): DatabaseSync {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      processed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS triage_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      photo_id INTEGER NOT NULL REFERENCES photos(id),
      item_name TEXT NOT NULL,
      category TEXT NOT NULL,
      value_tier TEXT NOT NULL,
      confidence TEXT NOT NULL,
      uncertainty_reason TEXT
    );

    CREATE TABLE IF NOT EXISTS deep_pass_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      photo_id INTEGER NOT NULL REFERENCES photos(id),
      item_name TEXT NOT NULL,
      brand TEXT,
      model TEXT,
      category TEXT NOT NULL,
      subcategory TEXT,
      condition TEXT NOT NULL,
      condition_reason TEXT,
      confidence TEXT NOT NULL,
      unresolved_attributes TEXT, -- JSON array, see DeepPassRow
      value_range_low REAL,
      value_range_high REAL,
      listing_title TEXT,
      listing_description TEXT,
      suggested_price REAL
    );
  `);

  return db;
}

export function insertPhoto(db: DatabaseSync, filename: string): number {
  const result = db
    .prepare("INSERT INTO photos (filename) VALUES (?)")
    .run(filename);
  return Number(result.lastInsertRowid);
}

export function insertTriageItems(
  db: DatabaseSync,
  photoId: number,
  items: TriageItemRow[]
) {
  const stmt = db.prepare(`
    INSERT INTO triage_items (photo_id, item_name, category, value_tier, confidence, uncertainty_reason)
    VALUES (@photoId, @itemName, @category, @valueTier, @confidence, @uncertaintyReason)
  `);
  for (const row of items) {
    stmt.run({
      photoId,
      itemName: row.itemName,
      category: row.category,
      valueTier: row.valueTier,
      confidence: row.confidence,
      uncertaintyReason: row.uncertaintyReason ?? null,
    });
  }
}

function insertOneDeepPassResult(
  db: DatabaseSync,
  photoId: number,
  result: DeepPassRow
) {
  db.prepare(`
    INSERT INTO deep_pass_results (
      photo_id, item_name, brand, model, category, subcategory, condition, condition_reason,
      confidence, unresolved_attributes, value_range_low, value_range_high,
      listing_title, listing_description, suggested_price
    ) VALUES (
      @photoId, @itemName, @brand, @model, @category, @subcategory, @condition, @conditionReason,
      @confidence, @unresolvedAttributes, @valueRangeLow, @valueRangeHigh,
      @listingTitle, @listingDescription, @suggestedPrice
    )
  `).run({
    photoId,
    itemName: result.itemName,
    brand: result.brand ?? null,
    model: result.model ?? null,
    category: result.category,
    subcategory: result.subcategory ?? null,
    condition: result.condition,
    conditionReason: result.conditionReason,
    confidence: result.confidence,
    unresolvedAttributes: JSON.stringify(result.unresolvedAttributes),
    valueRangeLow: result.valueRangeLow,
    valueRangeHigh: result.valueRangeHigh,
    listingTitle: result.listingTitle,
    listingDescription: result.listingDescription,
    suggestedPrice: result.suggestedPrice,
  });
}

/** Single-item insert — kept for backward compatibility with existing callers (e.g. phase0-cli). */
export function insertDeepPassResult(
  db: DatabaseSync,
  photoId: number,
  result: DeepPassRow
) {
  insertOneDeepPassResult(db, photoId, result);
}

/** Batched insert — one row per item, from the new batched deep-pass call. */
export function insertDeepPassResults(
  db: DatabaseSync,
  photoId: number,
  results: DeepPassRow[]
) {
  for (const result of results) {
    insertOneDeepPassResult(db, photoId, result);
  }
}

/**
 * Example of exactly the kind of SQL query this DB is for: every triage
 * item that isn't high-confidence, across every photo processed so far —
 * i.e. the Review tab's queue, computed with a WHERE clause instead of
 * re-running any AI.
 */
export function queryNeedsReviewItems(db: DatabaseSync) {
  return db
    .prepare(
      `SELECT p.filename, t.item_name, t.category, t.value_tier, t.confidence, t.uncertainty_reason
       FROM triage_items t
       JOIN photos p ON p.id = t.photo_id
       WHERE t.confidence != 'high'
       ORDER BY t.value_tier, p.filename`
    )
    .all();
}

/** Another example: everything flagged high-value, across all photos. */
export function queryHighValueItems(db: DatabaseSync) {
  return db
    .prepare(
      `SELECT p.filename, t.item_name, t.category, t.confidence
       FROM triage_items t
       JOIN photos p ON p.id = t.photo_id
       WHERE t.value_tier = 'high'
       ORDER BY p.filename`
    )
    .all();
}

export interface ReviewPhotoGroup {
  photoId: number;
  filename: string;
  triageItems: {
    itemName: string;
    category: string;
    valueTier: "high" | "medium" | "low";
    confidence: "high" | "medium" | "low";
    uncertaintyReason: string | null;
  }[];
  /**
   * One entry per item that got a deep-pass — NOT a single object anymore.
   * v3 change: was one nullable object per photo (the "focus item"
   * limitation); now an array covering every item that qualified for
   * deep-pass, correlated to triage items via itemName.
   */
  deepPass: {
    itemName: string;
    brand: string | null;
    model: string | null;
    category: string;
    subcategory: string | null;
    condition: string;
    conditionReason: string | null;
    confidence: "high" | "medium" | "low";
    unresolvedAttributes: string; // JSON text, parsed by the caller
    valueRangeLow: number;
    valueRangeHigh: number;
    listingTitle: string;
    listingDescription: string;
    suggestedPrice: number;
  }[];
}

/**
 * Full Review-tab data set: every processed photo, its triage item list,
 * and ALL its deep-pass results (v3: plural — see ReviewPhotoGroup).
 */
export function getReviewData(db: DatabaseSync): ReviewPhotoGroup[] {
  const photos = db
    .prepare("SELECT id, filename FROM photos ORDER BY id")
    .all() as { id: number; filename: string }[];

  return photos.map((photo) => {
    const triageItems = db
      .prepare(
        `SELECT item_name, category, value_tier, confidence, uncertainty_reason
         FROM triage_items WHERE photo_id = ?`
      )
      .all(photo.id) as any[];

    const deepPassRows = db
      .prepare("SELECT * FROM deep_pass_results WHERE photo_id = ?")
      .all(photo.id) as any[];

    return {
      photoId: photo.id,
      filename: photo.filename,
      triageItems: triageItems.map((t) => ({
        itemName: t.item_name,
        category: t.category,
        valueTier: t.value_tier,
        confidence: t.confidence,
        uncertaintyReason: t.uncertainty_reason,
      })),
      deepPass: deepPassRows.map((dp) => ({
        itemName: dp.item_name,
        brand: dp.brand,
        model: dp.model,
        category: dp.category,
        subcategory: dp.subcategory,
        condition: dp.condition,
        conditionReason: dp.condition_reason,
        confidence: dp.confidence,
        unresolvedAttributes: dp.unresolved_attributes,
        valueRangeLow: dp.value_range_low,
        valueRangeHigh: dp.value_range_high,
        listingTitle: dp.listing_title,
        listingDescription: dp.listing_description,
        suggestedPrice: dp.suggested_price,
      })),
    };
  });
}

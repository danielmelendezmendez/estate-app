import { join } from "path";
import { existsSync } from "fs";
import { openDb, getProjectStats } from "@estate-app/db";

const DB_PATH = join(process.cwd(), "..", "phase0-cli", "phase0.db");

/**
 * Backs the persistent ProjectStats bar shown on both /upload and
 * /review — a plain GET so a client component can poll/refetch it from
 * either page without needing server-component access to the DB.
 */
export async function GET() {
  if (!existsSync(DB_PATH)) {
    return Response.json({
      totalItemsFound: 0,
      totalPublishable: 0,
      totalPublished: 0,
      estimatedRecoveredValue: 0,
    });
  }

  const db = openDb(DB_PATH);
  const stats = getProjectStats(db);
  return Response.json(stats);
}

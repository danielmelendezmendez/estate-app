import { join } from "path";
import { existsSync } from "fs";
import { openDb, getReviewData, type ReviewPhotoGroup } from "@estate-app/db";
import { CertaintyBar } from "./CertaintyBar";
import { DeepDiveCard } from "./DeepDiveCard";

// Dev-only wiring: reads the Phase 0 CLI's SQLite output directly. Real
// storage is Postgres (see docs/architecture.md) once Phase 1 exists —
// this is intentionally pointed at real data, not fake/mock data, while
// that backend doesn't exist yet.
const DB_PATH = join(process.cwd(), "..", "phase0-cli", "phase0.db");
const UPLOAD_DIR = join(process.cwd(), "public", "uploaded-photos");

// Only photos uploaded through the new /upload flow have a real image
// file sitting in public/uploaded-photos — anything processed earlier
// via the CLI has no thumbnail available (the photo lived only on the
// machine that ran the CLI). Check per-photo rather than assume either
// way, so old entries degrade gracefully instead of showing a broken image.
function thumbnailUrlFor(filename: string): string | null {
  return existsSync(join(UPLOAD_DIR, filename))
    ? `/uploaded-photos/${filename}`
    : null;
}

type FlatItem = {
  itemName: string;
  category: string;
  valueTier: "high" | "medium" | "low";
  confidence: "high" | "medium" | "low";
  uncertaintyReason: string | null;
  photoFilename: string;
  thumbnailUrl: string | null;
};

function flattenItems(groups: ReviewPhotoGroup[]): FlatItem[] {
  return groups.flatMap((g) =>
    g.triageItems.map((item) => ({
      ...item,
      photoFilename: g.filename,
      thumbnailUrl: thumbnailUrlFor(g.filename),
    }))
  );
}

function bucket(items: FlatItem[], confidence: "high" | "medium" | "low") {
  return items.filter((i) => i.confidence === confidence);
}

const BUCKET_META = {
  high: {
    title: "Ready to list",
    hint: "The AI is confident — review the details, confirm, and it's ready to publish.",
    bg: "bg-confidence-high-bg",
  },
  medium: {
    title: "Quick check",
    hint: "Mostly clear, but worth a glance before confirming.",
    bg: "bg-confidence-medium-bg",
  },
  low: {
    title: "Needs your input",
    hint: "The AI couldn't tell — take another photo or fill in the detail yourself.",
    bg: "bg-confidence-low-bg",
  },
} as const;

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ photoId?: string }>;
}) {
  const { photoId } = await searchParams;
  const scopedPhotoId = photoId ? Number(photoId) : null;

  if (!existsSync(DB_PATH)) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="font-display text-3xl text-ink">Nothing to review yet</h1>
        <p className="mt-3 text-ink-muted">
          <a href="/upload" className="underline">Upload a photo</a> to get started, or run the
          Phase 0 CLI against a folder of photos —{" "}
          <code className="rounded bg-ink/5 px-1.5 py-0.5 font-mono text-sm">
            pnpm --filter phase0-cli dev &lt;photos-folder&gt;
          </code>
          .
        </p>
      </main>
    );
  }

  const db = openDb(DB_PATH);
  const allGroups = getReviewData(db);
  // When arriving from an upload, show ONLY that photo — not every photo
  // ever processed tonight. Without a photoId (e.g. visiting /review
  // directly), fall back to the full historical view.
  const groups = scopedPhotoId
    ? allGroups.filter((g) => g.photoId === scopedPhotoId)
    : allGroups;
  const flat = flattenItems(groups);

  const buckets = {
    high: bucket(flat, "high"),
    medium: bucket(flat, "medium"),
    low: bucket(flat, "low"),
  };

  const deepDiveCards = groups.flatMap((g) =>
    g.deepPass.map((dp) => ({
      ...dp,
      photoId: g.photoId,
      filename: g.filename,
      thumbnailUrl: thumbnailUrlFor(g.filename),
    }))
  );

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <header className="mb-12 flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-4xl font-medium text-ink">Review</h1>
          <p className="mt-2 text-ink-muted">
            {flat.length} items found across {groups.length} photo{groups.length === 1 ? "" : "s"}.
          </p>
          {scopedPhotoId && (
            <p className="mt-1 text-xs text-ink-muted">
              Showing this upload only — <a href="/review" className="underline">view everything processed</a>
            </p>
          )}
        </div>
        <a
          href="/upload"
          className="rounded-md border border-ink/20 px-4 py-2 text-sm font-medium text-ink transition hover:border-ink/40"
        >
          Upload a photo
        </a>
      </header>

      <div className="space-y-12">
        {(["high", "medium", "low"] as const).map((level) => {
          const items = buckets[level];
          const meta = BUCKET_META[level];
          if (items.length === 0) return null;
          return (
            <section key={level}>
              <div className="mb-4 flex items-baseline justify-between">
                <h2 className="font-display text-xl font-medium text-ink">
                  {meta.title}
                  <span className="ml-2 font-mono text-sm font-normal text-ink-muted">
                    {items.length}
                  </span>
                </h2>
              </div>
              <p className="mb-4 text-sm text-ink-muted">{meta.hint}</p>
              <ul className="space-y-2">
                {items.map((item, i) => (
                  <li
                    key={`${item.photoFilename}-${item.itemName}-${i}`}
                    className={`flex items-start gap-4 rounded-md border border-ink/10 ${meta.bg} px-5 py-4`}
                  >
                    {item.thumbnailUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.thumbnailUrl}
                        alt={item.photoFilename}
                        className="h-16 w-16 flex-shrink-0 rounded object-cover"
                      />
                    )}
                    <div className="flex flex-1 flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-body font-medium text-ink">
                          {item.itemName}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-muted">
                          {item.category} · from {item.photoFilename}
                        </p>
                        {item.uncertaintyReason && (
                          <p className="mt-2 text-sm text-ink-muted">
                            {item.uncertaintyReason}
                          </p>
                        )}
                      </div>
                      <CertaintyBar confidence={item.confidence} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {deepDiveCards.length > 0 && (
        <section className="mt-16 border-t border-ink/10 pt-10">
          <h2 className="font-display text-xl font-medium text-ink">
            Deep-dive analysis
            <span className="ml-2 font-mono text-sm font-normal text-ink-muted">
              {deepDiveCards.length}
            </span>
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            Every item worth its own detailed look — not just one per
            photo anymore. Items below the value threshold are bundled
            instead (see "Ready to list" etc. above).
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {deepDiveCards.map((dp, i) => {
              let unresolved: any[] = [];
              try {
                unresolved = JSON.parse(dp.unresolvedAttributes);
              } catch {
                // leave empty if malformed
              }
              return (
                <DeepDiveCard
                  key={`${dp.photoId}-${dp.itemName}-${i}`}
                  photoId={dp.photoId}
                  itemKey={`${dp.photoId}-${i}`}
                  itemName={dp.itemName}
                  filename={dp.filename}
                  thumbnailUrl={dp.thumbnailUrl}
                  category={dp.category}
                  subcategory={dp.subcategory}
                  condition={dp.condition}
                  confidence={dp.confidence}
                  unresolvedAttributes={unresolved}
                  valueRangeLow={dp.valueRangeLow}
                  valueRangeHigh={dp.valueRangeHigh}
                  listingTitle={dp.listingTitle}
                  listingDescription={dp.listingDescription}
                  suggestedPrice={dp.suggestedPrice}
                />
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}

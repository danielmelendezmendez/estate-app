"use client";

import { useEffect, useState } from "react";
import { PackageCheck, Sparkles, Upload } from "lucide-react";

interface Stats {
  totalItemsFound: number;
  totalPublishable: number;
  totalPublished: number;
  estimatedRecoveredValue: number;
}

/**
 * The persistent "running total" — the strongest lever for making
 * someone want to upload another photo, since it's the one thing that
 * makes progress feel cumulative across the whole project instead of
 * resetting with every photo. Also carries the post-publish nudge: once
 * at least one item is published, a quiet "add another room" link
 * appears here rather than repeating on every individual card.
 *
 * Listens for a custom "estate-app:stats-changed" event (dispatched by
 * PublishButton on success) to refetch live, since this component has
 * no other way to know a publish happened elsewhere on the page.
 */
export function ProjectStats() {
  const [stats, setStats] = useState<Stats | null>(null);

  async function fetchStats() {
    try {
      const res = await fetch("/api/stats");
      if (res.ok) setStats(await res.json());
    } catch {
      // stats are a nice-to-have, not critical — fail quietly
    }
  }

  useEffect(() => {
    fetchStats();
    const handler = () => fetchStats();
    window.addEventListener("estate-app:stats-changed", handler);
    return () => window.removeEventListener("estate-app:stats-changed", handler);
  }, []);

  if (!stats || stats.totalItemsFound === 0) return null;

  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink/5 bg-surface px-5 py-4 shadow-card">
      <div className="flex flex-wrap items-center gap-5">
        <div>
          <p className="font-mono text-lg font-semibold text-ink">{stats.totalItemsFound}</p>
          <p className="text-xs text-ink-muted">items found</p>
        </div>
        <div className="h-8 w-px bg-ink/10" />
        <div>
          <p className="flex items-center gap-1 font-mono text-lg font-semibold text-ink">
            <PackageCheck className="h-4 w-4 text-accent" />
            {stats.totalPublished}
          </p>
          <p className="text-xs text-ink-muted">published</p>
        </div>
        {stats.estimatedRecoveredValue > 0 && (
          <>
            <div className="h-8 w-px bg-ink/10" />
            <div>
              <p className="font-mono text-lg font-semibold text-confidence-high">
                €{stats.estimatedRecoveredValue.toLocaleString()}
              </p>
              <p className="text-xs text-ink-muted">recovered so far</p>
            </div>
          </>
        )}
      </div>

      {stats.totalPublished > 0 && (
        <a
          href="/upload"
          className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3.5 py-2 text-sm font-medium text-accent transition hover:bg-accent hover:text-white"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Got another room? Add the next photo
        </a>
      )}
    </div>
  );
}

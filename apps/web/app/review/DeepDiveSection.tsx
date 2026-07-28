"use client";

import { useState } from "react";
import { DeepDiveCard, type DeepDiveCardProps } from "./DeepDiveCard";
import { PackageCheck } from "lucide-react";

type DeepDiveItem = Omit<DeepDiveCardProps, "onPublished">;

/**
 * Owns the "X of Y ready to sell" progress bar — the subtle,
 * momentum-based version of "gamified" the person asked for (progress
 * and completion, not points/badges/streaks). Needs to be a client
 * component specifically to track publish state across all the cards
 * beneath it, which the server-rendered page itself can't do.
 */
export function DeepDiveSection({ items }: { items: DeepDiveItem[] }) {
  const [publishedKeys, setPublishedKeys] = useState<Set<string>>(
    () => new Set(items.filter((i) => i.published).map((i) => i.itemKey))
  );

  const total = items.length;
  const done = publishedKeys.size;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="font-display text-xl font-semibold text-ink">Ready to sell</h2>
        <span className="flex items-center gap-1.5 font-mono text-sm text-ink-muted">
          <PackageCheck className="h-4 w-4 text-accent" />
          {done} of {total}
        </span>
      </div>
      <p className="mb-4 text-sm text-ink-muted">
        Each item below has its own AI-drafted listing — review, adjust anything
        that's not quite right, and publish when you're ready.
      </p>

      {/* Progress bar — quiet, thin, no game elements, just visible momentum */}
      <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-accent-soft">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <DeepDiveCard
            key={item.itemKey}
            {...item}
            onPublished={() =>
              setPublishedKeys((prev) => new Set(prev).add(item.itemKey))
            }
          />
        ))}
      </div>
    </section>
  );
}

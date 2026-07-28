"use client";

import { useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, Tag } from "lucide-react";

interface PublishButtonProps {
  sku: string;
  title: string;
  description: string;
  price: number;
  categoryQuery: string;
  condition: string;
  deepPassResultId?: number;
  onPublished?: () => void;
  alreadyPublished?: boolean;
  publishedUrl?: string | null;
}

export function PublishButton({
  sku,
  title,
  description,
  price,
  categoryQuery,
  condition,
  deepPassResultId,
  onPublished,
  alreadyPublished,
  publishedUrl,
}: PublishButtonProps) {
  const [status, setStatus] = useState<"idle" | "publishing" | "success" | "error">(
    alreadyPublished ? "success" : "idle"
  );
  const [result, setResult] = useState<{ url?: string; category?: string; error?: string; body?: unknown }>(
    alreadyPublished ? { url: publishedUrl ?? undefined, category: categoryQuery } : {}
  );

  async function handlePublish() {
    setStatus("publishing");
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, title, description, price, categoryQuery, condition, deepPassResultId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ error: data.error ?? "Publish failed.", body: data.body });
        setStatus("error");
        return;
      }
      setResult({ url: data.url, category: data.category });
      setStatus("success");
      onPublished?.();
      // Lets the persistent ProjectStats bar (a separate component,
      // possibly on a different part of the tree) know to refetch —
      // there's no other channel between them.
      window.dispatchEvent(new Event("estate-app:stats-changed"));
    } catch (err: any) {
      setResult({ error: err.message });
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-confidence-high-bg px-4 py-3 text-sm">
        <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-confidence-high" />
        <div>
          <p className="font-medium text-ink">Published to {result.category}</p>
          <a
            href={result.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-confidence-high underline"
          >
            View listing <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <button
        onClick={handlePublish}
        disabled={status === "publishing"}
        className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-accent-hover hover:shadow-card-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {status === "publishing" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Publishing to eBay...
          </>
        ) : (
          <>
            <Tag className="h-4 w-4" /> Publish to eBay (Sandbox)
          </>
        )}
      </button>
      {status === "error" && (
        <div className="mt-2">
          <p className="text-xs text-confidence-low">{result.error}</p>
          {result.body ? (
            <pre className="mt-1 max-w-lg overflow-x-auto rounded-lg bg-ink/5 p-2 text-[10px] text-ink-muted">
              {JSON.stringify(result.body, null, 2)}
            </pre>
          ) : null}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";

interface PublishButtonProps {
  sku: string;
  title: string;
  description: string;
  price: number;
  categoryQuery: string;
  condition: string;
}

export function PublishButton({ sku, title, description, price, categoryQuery, condition }: PublishButtonProps) {
  const [status, setStatus] = useState<"idle" | "publishing" | "success" | "error">("idle");
  const [result, setResult] = useState<{ url?: string; category?: string; error?: string; body?: unknown }>({});

  async function handlePublish() {
    setStatus("publishing");
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, title, description, price, categoryQuery, condition }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ error: data.error ?? "Publish failed.", body: data.body });
        setStatus("error");
        return;
      }
      setResult({ url: data.url, category: data.category });
      setStatus("success");
    } catch (err: any) {
      setResult({ error: err.message });
      setStatus("error");
    }
  }

  if (status === "success") {
    return (
      <div className="mt-3 rounded-md bg-confidence-high-bg px-3 py-2 text-sm">
        <p className="text-ink">Published to {result.category}.</p>
        <a href={result.url} target="_blank" rel="noreferrer" className="underline text-ink">
          View listing →
        </a>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <button
        onClick={handlePublish}
        disabled={status === "publishing"}
        className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-stone transition disabled:opacity-50"
      >
        {status === "publishing" ? "Publishing to eBay..." : "Publish to eBay (Sandbox)"}
      </button>
      {status === "error" && (
        <div className="mt-2">
          <p className="text-xs text-confidence-low">{result.error}</p>
          {result.body ? (
            <pre className="mt-1 max-w-lg overflow-x-auto rounded bg-ink/5 p-2 text-[10px] text-ink-muted">
              {JSON.stringify(result.body, null, 2)}
            </pre>
          ) : null}
        </div>
      )}
    </div>
  );
}

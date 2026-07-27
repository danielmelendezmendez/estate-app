"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setStatus("uploading");
    setErrorMessage("");

    const formData = new FormData();
    formData.append("photo", file);

    try {
      const res = await fetch("/api/analyze", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Something went wrong.");
      }

      router.push(`/review?photoId=${data.photoId}`);
    } catch (err: any) {
      setStatus("error");
      setErrorMessage(err.message ?? "Upload failed.");
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <header className="mb-10">
        <h1 className="font-display text-4xl font-medium text-ink">Upload a photo</h1>
        <p className="mt-2 text-ink-muted">
          Take a photo of a room or a single item, and the AI will identify
          what's sellable and estimate its value.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6">
        <label className="block cursor-pointer rounded-md border-2 border-dashed border-ink/20 bg-surface px-6 py-16 text-center transition hover:border-ink/40">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <p className="font-mono text-sm text-ink">{file.name}</p>
          ) : (
            <p className="text-ink-muted">Click to choose a photo, or drag one here.</p>
          )}
        </label>

        <button
          type="submit"
          disabled={!file || status === "uploading"}
          className="w-full rounded-md bg-ink px-6 py-3 font-body font-medium text-stone transition disabled:cursor-not-allowed disabled:opacity-40"
        >
          {status === "uploading" ? "Analyzing — this takes a moment..." : "Analyze this photo"}
        </button>

        {status === "error" && (
          <p className="text-sm text-confidence-low">{errorMessage}</p>
        )}
      </form>
    </main>
  );
}

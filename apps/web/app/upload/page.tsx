"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Sparkles } from "lucide-react";
import { ProjectStats } from "../review/ProjectStats";

// A few honest, calm lines cycled through during analysis — replacing a
// generic spinner so the wait feels attended-to rather than a black box.
// Deliberately not jokey/gimmicky, matching the "calm for a stressed
// person" brief throughout this project.
const STATUS_MESSAGES = [
  "Looking closely at what's in this photo…",
  "Checking each item against known price patterns…",
  "Weighing up brand, condition, and category…",
  "Almost there — drafting the listing details…",
];

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessageIndex, setStatusMessageIndex] = useState(0);
  const router = useRouter();

  function handleFileSelect(selected: File | null) {
    setFile(selected);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(selected ? URL.createObjectURL(selected) : null);
  }

  useEffect(() => {
    if (status !== "uploading") return;
    const interval = setInterval(() => {
      setStatusMessageIndex((i) => (i + 1) % STATUS_MESSAGES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [status]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    setStatus("uploading");
    setStatusMessageIndex(0);
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
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <ProjectStats />

      <header className="mb-10 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft">
          <Sparkles className="h-5 w-5 text-accent" />
        </div>
        <h1 className="font-display text-4xl font-bold text-ink">Upload a photo</h1>
        <p className="mt-2 text-ink-muted">
          Take a photo of a room or a single item, and the AI will identify
          what's sellable and estimate its value.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5">
        <label
          className={`flex cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border-2 border-dashed shadow-card transition ${
            file ? "border-accent bg-surface" : "border-ink/15 bg-surface px-6 py-16 text-center hover:border-accent/50 hover:shadow-card-hover"
          }`}
        >
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
          />
          {file && previewUrl ? (
            <div className="w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt={file.name} className="h-64 w-full object-cover" />
              <p className="flex items-center justify-center gap-1.5 border-t border-ink/5 bg-canvas px-4 py-3 font-mono text-xs text-ink-muted">
                {file.name} · click to choose a different photo
              </p>
            </div>
          ) : (
            <>
              <ImagePlus className="h-8 w-8 text-ink-muted" />
              <p className="text-ink-muted">Click to choose a photo, or drag one here.</p>
            </>
          )}
        </label>

        <button
          type="submit"
          disabled={!file || status === "uploading"}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-6 py-3.5 font-display font-semibold text-white shadow-card transition hover:bg-accent-hover hover:shadow-card-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {status === "uploading" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> {STATUS_MESSAGES[statusMessageIndex]}
            </>
          ) : (
            "Analyze this photo"
          )}
        </button>

        {status === "error" && (
          <p className="text-center text-sm text-confidence-low">{errorMessage}</p>
        )}
      </form>
    </main>
  );
}

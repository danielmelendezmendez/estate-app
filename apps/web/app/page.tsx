import Link from "next/link";
import { Camera, Sparkles, Tag, ArrowRight } from "lucide-react";
import { ProjectStats } from "./review/ProjectStats";

const STEPS = [
  {
    number: "1",
    icon: Camera,
    title: "Upload a photo",
    body: "A whole room or a single item — Clearly reads what's in frame.",
  },
  {
    number: "2",
    icon: Sparkles,
    title: "Review what's found",
    body: "See a value range, a confidence level, and exactly what's still unclear.",
  },
  {
    number: "3",
    icon: Tag,
    title: "Publish when ready",
    body: "Your price, your call — nothing goes live without you confirming it.",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <section className="mx-auto max-w-2xl text-center">
        <h1 className="font-display text-5xl font-bold leading-tight text-ink">
          Know what's worth selling —{" "}
          <span className="text-accent">before you touch a thing.</span>
        </h1>
        <p className="mt-5 text-lg text-ink-muted">
          Photograph a room. Clearly figures out what's valuable, drafts real
          listings, and helps you publish them — so clearing a house doesn't
          mean cataloguing it item by item.
        </p>
        <Link
          href="/upload"
          className="mt-8 inline-flex items-center gap-2 rounded-full bg-accent px-7 py-3.5 font-display font-semibold text-white shadow-card transition hover:bg-accent-hover hover:shadow-card-hover"
        >
          Upload your first photo <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      <div className="mt-14">
        <ProjectStats />
      </div>

      <section className="mt-16 grid gap-6 sm:grid-cols-3">
        {STEPS.map((step) => (
          <div
            key={step.number}
            className="rounded-2xl border border-ink/5 bg-surface p-6 shadow-card"
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft">
                <step.icon className="h-4.5 w-4.5 text-accent" />
              </div>
              <span className="font-mono text-sm text-ink-muted">{step.number}</span>
            </div>
            <h3 className="font-display text-base font-semibold text-ink">{step.title}</h3>
            <p className="mt-1.5 text-sm text-ink-muted">{step.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}

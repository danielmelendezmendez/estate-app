import Link from "next/link";
import { Logo } from "./Logo";

export function SiteHeader() {
  return (
    <header className="border-b border-ink/5 bg-surface/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo size={28} />
          <span className="font-display text-lg font-bold text-ink">Clearly</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm font-medium text-ink-muted">
          <Link
            href="/upload"
            className="rounded-full px-3.5 py-2 transition hover:bg-accent-soft hover:text-accent"
          >
            Upload
          </Link>
          <Link
            href="/review"
            className="rounded-full px-3.5 py-2 transition hover:bg-accent-soft hover:text-accent"
          >
            Review
          </Link>
        </nav>
      </div>
    </header>
  );
}

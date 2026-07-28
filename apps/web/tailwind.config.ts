import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // v2 palette — calm periwinkle-indigo + white, deliberately not
        // the exact default Tailwind indigo-500 (#6366F1) every AI SaaS
        // template reaches for. Confidence colors stay warm/cool-mixed
        // (teal/amber/rose) so they read as real functional signals, not
        // just more of the same accent hue.
        canvas: "#F6F6FC",
        surface: "#FFFFFF",
        ink: "#23233D",
        "ink-muted": "#6B6B8D",
        accent: "#43467E",
        "accent-hover": "#34366A",
        "accent-soft": "#E8E8F3",
        "confidence-high": "#2E8F82",
        "confidence-high-bg": "#E2F3F0",
        "confidence-medium": "#C4872E",
        "confidence-medium-bg": "#FAF0DD",
        "confidence-low": "#C2536A",
        "confidence-low-bg": "#FBE7EC",
      },
      fontFamily: {
        display: ["var(--font-manrope)", "sans-serif"],
        body: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-plex-mono)", "monospace"],
      },
      boxShadow: {
        // Shadows tinted toward the accent hue instead of flat gray —
        // reads considered, not templated. This is most of what fixes
        // the "flat DOC file" complaint on its own.
        card: "0 1px 3px rgba(87, 84, 214, 0.08), 0 6px 16px rgba(87, 84, 214, 0.06)",
        "card-hover": "0 2px 6px rgba(87, 84, 214, 0.10), 0 10px 24px rgba(87, 84, 214, 0.10)",
      },
    },
  },
  plugins: [],
};

export default config;

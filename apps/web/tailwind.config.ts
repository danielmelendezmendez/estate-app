import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        stone: "#F2F1EC",
        surface: "#FFFFFF",
        ink: "#26241F",
        "ink-muted": "#6B6862",
        "confidence-high": "#2F6F62",
        "confidence-high-bg": "#E4EEEB",
        "confidence-medium": "#B4802E",
        "confidence-medium-bg": "#F4EBDA",
        "confidence-low": "#A24A3D",
        "confidence-low-bg": "#F3E2DE",
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "serif"],
        body: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-plex-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;

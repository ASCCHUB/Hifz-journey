import type { Config } from "tailwindcss";

// Colours come from CSS variables (see globals.css) so light and dark share one set of class names.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        line: "var(--line)",
        accent: "var(--accent)",
        "accent-ink": "var(--accent-ink)",
        "accent-soft": "var(--accent-soft)",
        gold: "var(--gold)",
        strong: "var(--strong)",
        revise: "var(--revise)",
        weak: "var(--weak)",
        learn: "var(--learn)",
        veil: "var(--veil)",
      },
      fontFamily: {
        ui: ["Figtree", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        quran: ["KFGQPC Hafs", "Amiri Quran", "Scheherazade New", "serif"],
        urdu: ["Noto Nastaliq Urdu", "Jameel Noori Nastaleeq", "Noto Naskh Arabic", "serif"],
        arabic: ["Noto Naskh Arabic", "Geeza Pro", "Segoe UI", "Tahoma", "sans-serif"],
      },
      borderRadius: { card: "18px" },
    },
  },
  plugins: [],
};
export default config;

import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        terminalBg: "#0a0a0f",
        terminalPanel: "#2a2a3a",
        terminalText: "#e8e8f0",
        profit: "#00ff88",
        loss: "#ff3b5c"
      },
      fontFamily: {
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        heading: ["Syne", "sans-serif"]
      }
    }
  },
  plugins: []
} satisfies Config;

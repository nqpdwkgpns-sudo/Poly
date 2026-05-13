import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        terminal: '#0a0a0f',
        panel: '#12121a',
        grid: '#2a2a3a',
        profit: '#00ff88',
        loss: '#ff3b5c',
        textcold: '#e8e8f0'
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
        heading: ['Syne', 'sans-serif']
      }
    }
  },
  darkMode: 'class'
} satisfies Config;

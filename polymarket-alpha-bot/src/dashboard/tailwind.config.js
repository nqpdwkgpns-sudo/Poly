/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: '#0a0a0f',
        panel: '#12121a',
        border: '#2a2a3a',
        'text-primary': '#e8e8f0',
        'text-muted': '#6b6b8a',
        green: {
          DEFAULT: '#00ff88',
          dim: '#00cc6a',
          bg: 'rgba(0,255,136,0.1)',
        },
        red: {
          DEFAULT: '#ff3b5c',
          dim: '#cc2f4a',
          bg: 'rgba(255,59,92,0.1)',
        },
        yellow: {
          DEFAULT: '#ffd700',
          bg: 'rgba(255,215,0,0.1)',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        display: ['Syne', 'sans-serif'],
      },
      animation: {
        pulse: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'flash-green': 'flashGreen 0.5s ease',
        'flash-red': 'flashRed 0.5s ease',
      },
      keyframes: {
        flashGreen: {
          '0%': { backgroundColor: 'rgba(0,255,136,0.3)' },
          '100%': { backgroundColor: 'transparent' },
        },
        flashRed: {
          '0%': { backgroundColor: 'rgba(255,59,92,0.3)' },
          '100%': { backgroundColor: 'transparent' },
        },
      },
    },
  },
  plugins: [],
};

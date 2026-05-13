import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'json'],
    },
  },
  resolve: {
    alias: {
      '@config': '/workspace/polymarket-alpha-bot/src/config',
      '@market': '/workspace/polymarket-alpha-bot/src/market',
      '@strategy': '/workspace/polymarket-alpha-bot/src/strategy',
      '@execution': '/workspace/polymarket-alpha-bot/src/execution',
      '@wallet': '/workspace/polymarket-alpha-bot/src/wallet',
      '@risk': '/workspace/polymarket-alpha-bot/src/risk',
      '@monitoring': '/workspace/polymarket-alpha-bot/src/monitoring',
    },
  },
});

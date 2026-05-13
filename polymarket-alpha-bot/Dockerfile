FROM node:20-alpine AS base

# Install pnpm
RUN npm install -g pnpm@9

WORKDIR /app

# Install dependencies
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --prod

# Build TypeScript
COPY tsconfig.json ./
COPY src/ ./src/
RUN pnpm install --frozen-lockfile && pnpm run build

# ─── Production stage ───────────────────────────────────────────
FROM node:20-alpine AS production

RUN npm install -g pnpm@9

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=base /app/dist ./dist

# Data directory for state persistence
RUN mkdir -p /app/data

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]

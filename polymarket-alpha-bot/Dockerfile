FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache curl
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD curl -fsS http://localhost:3001/api/state || exit 1

CMD ["node", "dist/src/index.js"]

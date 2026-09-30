FROM node:22-bookworm-slim AS base

ENV NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM base AS prod-deps

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev --no-audit --no-fund && npx prisma generate

FROM base AS builder

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM base AS runner

ENV NODE_ENV=production

RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs --home-dir /app appuser

COPY --from=prod-deps --chown=appuser:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:nodejs /app/dist ./dist
COPY --chown=appuser:nodejs package.json package-lock.json tsconfig.json server.ts ./
COPY --chown=appuser:nodejs prisma ./prisma
COPY --chown=appuser:nodejs src ./src

RUN mkdir -p /app/uploads && chown -R appuser:nodejs /app/uploads

USER appuser
EXPOSE 3103

# 启动前应用数据库迁移，避免新版本代码跑在旧表结构上
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx server.ts"]

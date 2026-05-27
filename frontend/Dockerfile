# =============================================================================
# Stage 1: deps
# 依存関係のインストールのみを行う。キャッシュの効率化のために分離する。
# =============================================================================
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# =============================================================================
# Stage 2: dev
# ローカル開発用。`npm run dev` でホットリロードを提供する。
# compose.yaml (開発環境) で `target: dev` として使用する。
# =============================================================================
FROM node:20-alpine AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# =============================================================================
# Stage 3: builder
# 本番用の最適化ビルドを行う。
# NEXT_PUBLIC_* 変数はビルド時に埋め込まれるため、ARGで受け取る。
# =============================================================================
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build

# =============================================================================
# Stage 4: runner
# 本番実行用。builderの成果物のみをコピーした最小イメージ。
# compose.prod.yaml で `target: runner` として使用する。
# =============================================================================
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]

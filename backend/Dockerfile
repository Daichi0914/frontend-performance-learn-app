# =============================================================================
# Stage 1: builder
# Goのバイナリをビルドする。
# =============================================================================
FROM golang:1.25-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN go build -o main .

# =============================================================================
# Stage 2: runner
# ビルド済みバイナリのみをコピーした最小イメージ。
# 非rootユーザーで実行することでセキュリティを強化する。
# =============================================================================
FROM alpine:3.21

WORKDIR /app

# 証明書の更新（HTTPS通信用）
RUN apk add --no-cache ca-certificates

# セキュリティ: 非rootユーザーを作成して実行する
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=builder /app/main .

USER appuser

EXPOSE 8080
CMD ["./main"]

# Giai đoạn 1: cài thư viện (better-sqlite3 cần glibc nên dùng ảnh Debian slim)
FROM node:22-slim AS deps
WORKDIR /app
# better-sqlite3 cần biên dịch native khi không có bản dựng sẵn cho ảnh này
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Giai đoạn 2: build
FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Giai đoạn 3: chạy
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATA_DIR=/app/data
RUN groupadd -r app && useradd -r -g app app && mkdir -p /app/data && chown app:app /app/data
RUN mkdir -p /app/public
COPY --from=builder /app/public ./public
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
USER app
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "server.js"]

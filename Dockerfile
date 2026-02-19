FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm install tsx

COPY --from=builder /app/build ./build
COPY --from=builder /app/static ./static
COPY --from=builder /app/data ./data
COPY --from=builder /app/src ./src
COPY server.ts ./

# Create non-root user
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup

# Ensure data dir is writable
RUN chown -R appuser:appgroup /app/data

USER appuser

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Mount data/ as volume for quiz/history persistence: -v /path/to/data:/app/data
CMD ["npx", "tsx", "server.ts"]

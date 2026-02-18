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

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["npx", "tsx", "server.ts"]

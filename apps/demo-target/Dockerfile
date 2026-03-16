FROM oven/bun:1.2-alpine AS base
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

FROM oven/bun:1.2-alpine
RUN apk add --no-cache nodejs npm
WORKDIR /app

COPY --from=base /app/package.json /app/bun.lock ./
COPY --from=base /app/next.config.ts ./
COPY --from=base /app/.next ./.next
COPY --from=base /app/public ./public
COPY --from=base /app/node_modules ./node_modules

EXPOSE 3000
CMD ["bun", "start"]

FROM oven/bun:1-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

FROM base AS builder
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY . .
RUN rm -rf .next node_modules/.cache .swc
RUN bun run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 bunjs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:bunjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:bunjs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:bunjs /app/public ./public
USER nextjs
EXPOSE 4000
ENV PORT=4000
ENV HOSTNAME=0.0.0.0
CMD ["bun", "run", "server.js"]

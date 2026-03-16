FROM oven/bun:1.2-alpine AS base
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build
EXPOSE 3001
CMD ["bun", "run", "start"]

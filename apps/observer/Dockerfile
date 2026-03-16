FROM oven/bun:1.2-alpine AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.2-alpine
WORKDIR /app
COPY --from=build /app/package.json /app/bun.lock* ./
RUN bun install --frozen-lockfile --production
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.ts ./server.ts
COPY --from=build /app/server ./server
COPY --from=build /app/tsconfig.node.json ./tsconfig.node.json
EXPOSE 3000
CMD ["bun", "run", "start"]

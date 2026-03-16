# Stage 1: Modules caching
FROM golang:1.24 AS modules
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

# Stage 2: Build
FROM golang:1.24 AS builder
WORKDIR /app
COPY --from=modules /go/pkg/mod /go/pkg/mod
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /bin/scraper ./cmd/main.go

# Stage 3: Runtime
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates tzdata curl netcat-openbsd gnupg \
  && mkdir -p /etc/apt/keyrings \
  && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
  && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
  && apt-get update && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/* \
  # Download LightPanda browser for the correct architecture
  && ARCH=$(dpkg --print-architecture) \
  && if [ "$ARCH" = "arm64" ]; then \
       curl -L -o /usr/local/bin/lightpanda \
         https://github.com/lightpanda-io/browser/releases/download/nightly/lightpanda-aarch64-linux; \
     else \
       curl -L -o /usr/local/bin/lightpanda \
         https://github.com/lightpanda-io/browser/releases/download/nightly/lightpanda-x86_64-linux; \
     fi \
  && chmod +x /usr/local/bin/lightpanda

# Install Playwright npm package and its Chromium browser
RUN npm install -g playwright && npx playwright install --with-deps chromium

COPY --from=builder /bin/scraper /bin/scraper

# Copy the screenshot script
COPY scripts/playwright-screenshot.js /app/scripts/playwright-screenshot.js

# Copy the entrypoint script
COPY scripts/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# LightPanda CDP URL (localhost since bundled in same container)
ENV LIGHTPANDA_CDP_URL=ws://localhost:9222

# Default to Playwright for screenshots
ENV SCREENSHOT_ENGINE=playwright
ENV PLAYWRIGHT_SCRIPT_PATH=/app/scripts/playwright-screenshot.js
ENV NODE_PATH=/usr/lib/node_modules

EXPOSE 8081
ENTRYPOINT ["/docker-entrypoint.sh"]

# Start LightPanda in background, then start scraper
CMD ["/bin/sh", "-c", "/usr/local/bin/lightpanda serve --host 0.0.0.0 --port 9222 & sleep 2 && /bin/scraper"]

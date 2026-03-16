FROM golang:1.25 AS modules
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

FROM golang:1.25 AS builder
WORKDIR /app
COPY --from=modules /go/pkg/mod /go/pkg/mod
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /bin/golem-server ./cmd/server
RUN CGO_ENABLED=0 GOOS=linux go build -o /bin/golem ./cmd/golem

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN mkdir -p /app/tmp
COPY --from=builder /bin/golem-server /bin/golem-server
COPY --from=builder /bin/golem /app/tmp/golem
ENV GOLEM_CLI_PATH=/app/tmp/golem

EXPOSE 8080
ENTRYPOINT ["/bin/golem-server"]

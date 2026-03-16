FROM golang:1.24 AS modules
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

FROM golang:1.24 AS builder
WORKDIR /app
COPY --from=modules /go/pkg/mod /go/pkg/mod
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /bin/golem ./cmd/golem

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /bin/golem /bin/golem

EXPOSE 8080
ENTRYPOINT ["/bin/golem"]

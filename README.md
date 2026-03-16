# G.O.L.E.M.

**Gemini Operator for Logic Exploitation and Monitoring**

An autonomous security agent for the [Google Gemini Live Agent Challenge (2026)](https://geminiliveagentchallenge.devpost.com/). G.O.L.E.M. finds business-logic vulnerabilities that traditional scanners miss by combining Gemini's multimodal reasoning with visual web perception.

Competition category: **UI Navigator**.

## What it does

Traditional security scanners (DAST/SAST) find broken code (SQLi, XSS). G.O.L.E.M. finds **broken logic**: price manipulation, hidden privilege escalation, IDOR via visual state mapping, and more.

1. **Perceive**: uses Gemini 3 Vision to understand what a checkout page or admin panel looks like.
2. **Reason**: determines if a negative quantity should be allowed in a financial context.
3. **Execute**: manipulates the DOM and verifies exploits visually through a tool-based loop.

## Tech stack

- **Brain**: [Google Gemini 3 Flash](https://ai.google.dev/) (reasoning + multimodal vision)
- **Orchestration**: [Google ADK-Go v0.6.0](https://github.com/google/adk-go) (llmagent pattern)
- **Perception**: [Supacrawler](https://github.com/antoine-ross/supacrawler) (LightPanda browser API)
- **Observer**: Vite + React + Hono (trace visualization dashboard)
- **Language**: Go 1.23+ / TypeScript
- **Hosting**: Google Cloud (GCE VM)

## Quick start

```bash
git clone https://github.com/antoineross/golem.git
cd golem

cp .env.example .env.local
# Edit .env.local -- set GOOGLE_API_KEY at minimum

./golem env list    # verify configuration
./golem start       # start all services via docker compose
./golem status      # check health
```

Open [http://localhost:3000](http://localhost:3000) for the observer dashboard.

## Prerequisites

- Docker (required -- all services run in containers)
- Go 1.23+ (for local E2E testing only)
- Google Gemini API key

## Services

All services run via `docker compose` through the `./golem` CLI.

| Service | Host Port | Internal Port | Description |
|---------|-----------|---------------|-------------|
| observer | 3000 | 3000 | Trace visualization dashboard (Vite + Hono) |
| demo-target | 4000 | 4000 | Next.js vulnerable app for E2E testing |
| scraper | 8083 | 8081 | Supacrawler perception layer (LightPanda browser) |
| golem | 8081 | 8080 | Agent (ADK-Go, hot-reload via Air) |
| redis | 6380 | 6379 | Task queue and caching |

Ports are configurable via env vars (`SCRAPER_PORT`, `GOLEM_PORT`, `REDIS_PORT`, `DEMO_TARGET_PORT`).

## Commands

```bash
# Service lifecycle
./golem start                # start all services (detached, with build)
./golem start -t             # start and tail logs
./golem start --observer     # start observer only
./golem start --scraper      # start redis + scraper only
./golem stop                 # stop all services
./golem restart              # restart all services
./golem status               # check service health
./golem logs                 # tail all logs
./golem logs golem           # tail golem agent logs only

# Development
./golem build                # build all Docker images
./golem lint                 # run go vet + eslint
./golem test                 # run Go + observer unit tests
./golem env list             # show env configuration status

# E2E testing
./golem e2e level0           # echo + payload (no scraper needed)
./golem e2e level1a          # multi-step UI interaction
./golem e2e level1b          # visual reasoning / canvas
./golem e2e level2           # spatial reasoning / modal obstruction
./golem e2e thinking         # thinking mode test
./golem e2e agent            # full agent test with custom prompt

# Cleanup
./golem reset --confirm      # stop services, wipe volumes + tmp/
./golem clean --confirm      # remove stopped containers + build cache
```

## E2E test levels

| Level | Difficulty | What it tests | Requires |
|-------|-----------|---------------|----------|
| 0 | Trivial | Tool calling (echo + payload) | API key only |
| 1a | Easy | Hidden elements, credential extraction, multi-page navigation | Scraper + demo-target |
| 1b | Medium | Visual analysis, canvas content, API endpoint discovery | Scraper + demo-target |
| 2 | Hard | Spatial reasoning, modal dismissal, destructive action discovery | Scraper + demo-target |

## Project structure

```text
apps/
  golem/                      -- the agent (Go)
    cmd/golem/main.go         -- entry point, wiring, event loop
    internal/adk/             -- model factory, runner, agent config, tools
    internal/adk/prompts/     -- modular system prompt sections
    internal/supacrawl/       -- HTTP client for scraper API
  scraper/                    -- Supacrawler perception layer (Go)
    internal/core/            -- scrape, crawl, screenshot, parse services
  observer/                   -- trace visualization UI (TypeScript)
    src/                      -- React app (Vite + Tailwind + shadcn)
    server.ts                 -- Hono backend (API + SSE + agent runner)
  demo-target/                -- vulnerable Next.js app for E2E testing
docker-compose.yml            -- service orchestration
golem                         -- CLI wrapper (bash)
```

## Environment variables

Required:
- `GOOGLE_API_KEY` -- Gemini API key (or `GEMINI_API_KEY` as fallback)

Optional:
- `SUPACRAWL_API_URL` -- scraper URL (default: `http://localhost:8083`)
- `DEFAULT_LLM_MODEL` -- model name (default: `gemini-3-flash-preview`)
- `GOLEM_LOG_LEVEL` -- log level (default: `info`)
- `GOLEM_TIMEOUT_SECONDS` -- agent timeout (default: `120`)
- `GOLEM_THINKING_LEVEL` -- Gemini thinking depth: `low`, `medium`, `high`, `minimal` (default: `medium`)

See `.env.example` for the full list.

## Production deployment

Golem deploys to a GCE VM (`nanowhale`, `us-central1-a`) via GitHub Actions on push to `main`.

### Architecture

```
GitHub Actions (push to main)
  |-- detect changes (dorny/paths-filter)
  |-- build changed services -> Google Artifact Registry
  |-- SSH into GCE VM -> docker compose pull + up
```

### CI/CD workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | push/PR to main | Build, vet, test (Go + TS) |
| `deploy.yml` | push to main | Build images, deploy to VM |
| `build-service.yml` | reusable | Build + push one service to GAR |
| `cleanup-gar.yml` | reusable | Prune old image tags |

### GitHub Secrets required

| Secret | Purpose |
|--------|---------|
| `GCP_PROJECT_ID` | Your GCP project ID |
| `GCP_LOCATION` | GAR region (e.g. `us-central1`) |
| `GCP_REPOSITORY` | `golem` (Artifact Registry repo) |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | WIF provider for GitHub Actions |
| `GCP_SERVICE_ACCOUNT_EMAIL` | SA for GAR push |
| `DEPLOY_HOST` | VM external IP |
| `DEPLOY_USER` | SSH user for deployments |
| `DEPLOY_SSH_PRIVATE_KEY` | Ed25519 deploy key |
| `GOOGLE_API_KEY` | Gemini API key |

### First-time setup

See `.env.prod.example` for the complete list of GCP resource setup commands (Artifact Registry, service accounts, Workload Identity Federation, SSH keys).

### Manual deployment

```bash
ssh <DEPLOY_USER>@<VM_EXTERNAL_IP>
cd ~/golem
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

## Development

See `AGENTS.md` for the full workflow contract including branching, versioning, quality gates, and testing policy.

## License

Apache-2.0

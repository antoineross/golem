# agent rules

This file is the canonical, cross-agent workflow contract for `golem`.

## project overview

`golem` (Gemini Operator for Logic Exploitation and Monitoring) is an autonomous security agent built for the Google Gemini Live Agent Challenge (2026). It uses the Google ADK for Go to orchestrate a Perceive-Reason-Execute loop that finds business-logic vulnerabilities in web applications.

Competition category: **UI Navigator**.

Current development roadmap: `tmp/versions/roadmap.md`.

## architecture

```text
User Input -> ADK Runner -> Gemini Reasoning -> Tool Call (Supacrawl) -> Visual Confirmation -> Final Report
```

Monorepo layout:
- `apps/golem/` -- the agent (own go.mod)
  - `cmd/golem/main.go` -- entry point, wiring, event loop
  - `internal/adk/` -- model factory, runner setup, agent config, ADK tool definitions
  - `internal/adk/prompts/` -- modular system prompt sections (base, personas, methodology, tools, rules)
  - `internal/supacrawl/` -- HTTP client for scraper API (scrape, screenshot, health)
  - `internal/perception/` -- state mapping, hidden element detection (planned)
  - `internal/security/` -- attack trees, payload engineering (planned)
  - `internal/report/` -- regex-based parser for vulnerability reports (planned)
- `apps/scraper/` -- Supacrawler perception layer (own go.mod)
  - Provides `/v1/scrape`, `/v1/screenshots` endpoints
  - LightPanda browser automation, Redis task queue
- `apps/demo-target/` -- intentionally vulnerable Next.js 16 app for agent testing
  - E-commerce demo with 8 planted security flaws (IDOR, privilege escalation, hidden elements, client-side logic bypass)
  - Used as proof target for Gemini Live Agent Challenge submission
  - Contains deliberate vulnerabilities -- do not apply security fixes
- `apps/observer/` -- Vite + React + TypeScript observability dashboard
  - Visualizes OTel span traces and thinking-test traces from the agent
  - Hono backend with SSE for live trace streaming
  - Scenario launcher for triggering agent runs from the UI
  - Replay mode for pre-recorded trace playback at configurable speed
  - Run: `cd apps/observer && bun install && bun run dev:all`

Key constraint (ADK-Go v0.6.0): `OutputSchema` and `Tools` are mutually exclusive. Because this agent uses tools, structured output must use the Regex Parser pattern.

### ADK features in use

| Feature | Implementation | Purpose |
|---------|---------------|---------|
| `InstructionProvider` | `agent.go` | Dynamic prompt with session state injection |
| Session state | `state.go` + tools | Track visited URLs, screenshots, findings across tool calls |
| `artifact.InMemoryService` | `runner.go` | Screenshot persistence (wired, save calls deferred to v0.7) |
| Lifecycle callbacks | `callbacks.go` | Structured logging of agent/model events |
| Functional options | `agent.go` | `WithBeforeAgent`, `WithAfterAgent`, `WithBeforeModel`, `WithAfterModel` |
| `ThinkingConfig` | `config.go` + `agent.go` | Gemini 3 thinking mode (medium by default), thought logging |

### session state keys

| Key | Type | Written by | Read by |
|-----|------|-----------|---------|
| `target_url` | string | main (planned) | InstructionProvider |
| `current_step` | string | agent (planned) | InstructionProvider |
| `visited_urls` | []string | browse, click | InstructionProvider, callbacks |
| `findings` | int | agent (planned) | InstructionProvider, callbacks |
| `screenshots` | []string | screenshot, click | callbacks |

### callback contract

Callbacks are observation-only hooks. They must not modify agent behavior:
- `BeforeAgent`/`AfterAgent`: return `(nil, nil)` to continue normally.
- `BeforeModel`: return `(nil, nil)` to let the model call proceed.
- `AfterModel`: return `(resp, respErr)` to pass through the original response. Never return `(nil, nil)` -- this suppresses the model response.

### agent tools

The agent has these tools registered via `functiontool.New`:

| Tool | Purpose | Backend |
|------|---------|---------|
| `echo` | Verify tool-call loop works | built-in |
| `browse` | Scrape a URL, get markdown + links + metadata | `GET /v1/scrape` |
| `screenshot` | Take a screenshot, return image URL | `POST + GET /v1/screenshots` |
| `click` | Click a CSS selector, screenshot + scrape the result | screenshot + scrape |
| `find_hidden` | Scan HTML for hidden elements, debug attrs, route leaks | `GET /v1/scrape` (include_html) |
| `payload` | Generate security testing payloads by category | built-in |

Tool registration is graceful: if `SUPACRAWL_API_URL` is not set or the scraper is unreachable, the agent starts with `echo` and `payload` tools only and logs a warning.

## tech stack

- Brain: Google Gemini 3 Flash (reasoning + multimodal vision)
- Orchestration: Google ADK-Go v0.6.0 (llmagent pattern)
- Perception: Supacrawler (Playwright-powered API for screenshots and DOM)
- Language: Go 1.23+
- Hosting: Google Cloud (Cloud Run)

## workflow priorities

1. Foundation first: agent skeleton, ADK wiring, tool interfaces.
2. Perception second: Supacrawl client, browser_action tool, multimodal integration.
3. Security logic third: state mapping, attack personas, payload engineering.
4. Demo last: reasoning panel, report parser, video.
5. Safety always: no secrets in commits, no bypass of wrapper workflow.

## secrets and env policy

- Never print secret values in logs or docs.
- Do not inspect `.env` or `.env.local` in agent workflows.
- Use `.env.example` as the source of variable names and descriptions.
- Use `./golem env list` to verify whether required vars are set.
- Local development loads `.env` as base and then applies `.env.local` overrides.

Required variables:
- `GOOGLE_API_KEY` (or `GEMINI_API_KEY` as fallback)
- `SUPACRAWL_API_URL` (local: `http://localhost:8083`, docker: `http://scraper:8081`)

Optional variables:
- `DEFAULT_LLM_MODEL` (default: gemini-3-flash-preview)
- `FALLBACK_LLM_MODEL` (default: gemini-3.1-flash-lite-preview)
- `GOLEM_LOG_LEVEL` (default: info)
- `GOLEM_TIMEOUT_SECONDS` (default: 120)
- `GOLEM_THINKING_LEVEL` (default: medium) -- Gemini 3 thinking depth: low, medium, high, minimal
- `GOLEM_INCLUDE_THOUGHTS` (default: true) -- return thought summaries in model responses
- `GOLEM_THINKING_BUDGET` (default: 0) -- token budget for Gemini 2.5 models (0 = disabled)

## local development

The `./golem` CLI is a docker compose orchestrator. It manages env file loading, service lifecycle, and health checks. All services run in Docker containers.

```bash
cp .env.example .env.local    # fill in API keys
./golem env list               # verify config
./golem start                  # start all services (detached)
./golem status                 # check service health
./golem logs                   # tail all logs
./golem logs golem             # tail golem agent logs only
./golem stop                   # stop all services
```

Never bypass the wrapper with raw docker compose commands. The wrapper handles env file selection (`--env-file`), project naming, and consistent behavior.

**CRITICAL -- process management**: Always use `./golem stop` to shut down services. NEVER use `kill`, `kill -9`, `lsof -ti:PORT | xargs kill`, `pkill`, or any manual signal to stop golem services. This applies to ALL ports: 3000 (observer), 8083 (scraper), 6380 (redis), 8081 (golem). Killing processes by port or PID corrupts Docker containers and can break other running Docker services on the host. The `./golem stop` command runs `docker compose down` which cleanly shuts down only golem's containers without affecting anything else. There are ZERO exceptions to this rule.

**CRITICAL -- never run services directly**: NEVER run `bun run server.ts`, `bun run dev`, `node server.ts`, or any direct process start for the observer or any other service. NEVER use `PORT=3000 bun run server.ts &` or similar. All services run in Docker via `./golem start`. To start the observer specifically, use `./golem start --observer`. To rebuild after code changes, use `./golem build observer`. To verify, use `./golem status`. For E2E testing, use `./golem e2e <harness>`. For unit tests, use `./golem test`. For Playwright visual testing, point the browser at the Docker-served URL (port 3000). There are ZERO exceptions to this rule.

| Do this | Not this |
|---------|----------|
| `./golem start` | `docker compose up -d` |
| `./golem build` | `docker compose build` |
| `./golem stop` | `docker compose down` |
| `./golem logs golem` | `docker logs golem-golem-1` |
| `./golem start --observer` | `docker compose up -d observer` |
| `./golem env list` | `cat .env` |
| `./golem e2e level0` | manual go run with env vars |

### services

| Service | Host Port | Description |
|---------|-----------|-------------|
| redis | 6380 | Task queue and caching |
| scraper | 8083 | Supacrawler perception layer (LightPanda browser) |
| golem | 8081 | Agent (ADK-Go, hot-reload via Air) |
| observer | 3000 | Trace visualization UI (Vite + Hono) |
| demo-target | 4000 | Next.js vulnerable app for E2E testing (levels 1a, 1b, 2) |

Ports are configurable via env vars (`REDIS_PORT`, `SCRAPER_PORT`, `GOLEM_PORT`, `DEMO_TARGET_PORT`). Defaults are chosen to avoid collisions with other local services.

### start options

- `./golem start` -- start all services
- `./golem start -t` -- start and tail logs
- `./golem start --no-build` -- skip image rebuild
- `./golem start --scraper` -- start redis + scraper only
- `./golem start --observer` -- start observer only

### reset

`./golem reset --confirm` stops services, removes Docker volumes, and clears `tmp/` artifacts. Use for a clean slate.

## coding standards

- Use Go stdlib-first patterns and explicit error handling (`fmt.Errorf("context: %w", err)`).
- Keep `context.Context` as first parameter for request-scoped work.
- Keep business logic out of wiring/entrypoint files.
- Avoid silent failures and broad catch-all fallbacks.
- Prefer deterministic behavior and explicit timeouts.
- Inject dependencies through constructors or explicit parameters.
- Use structured JSONL logging for all agent actions.

## quality gates

Before finalizing work:
1. `pre-commit run --all-files`
2. `./golem lint` (when available)
3. `./golem test` (when available)
4. `go build ./...`

If Go modules are not yet initialized, lint/test commands should fail clearly or skip with explicit messaging (never silently).

## versioning rules

Format: `vX.Y.Z`

- `X` -- major version (milestone / competition phase)
- `Y` -- minor version (feature additions, patches)
- `Z` -- sub-features / individual issues

Example: `v0.2.1` = milestone 0, feature 2 (perception layer), sub-feature 1 (Supacrawl client).

### local vs remote tracking

- **Local (tmp/versions/)**: working todolist and version docs. Updated frequently during development. Not committed.
- **GitHub Issues**: updated when changes are confirmed and pushed. One issue per sub-feature (Z-level).

### version doc naming

```text
vX.Y.Z-{issue_number}-short-description.md
```

Statuses: `SPEC`, `IN_PROGRESS`, `IMPLEMENTED`, `DEFERRED`, `SUPERSEDED`.

## branch and PR model

- One issue = one branch = one PR.
- Naming: `{type}/{issue_number}-{short-description}` (e.g., `feat/12-visual-hashing`).
- Never merge PRs. Agents commit and push; humans review and merge.
- Keep PRs focused; split unrelated concerns.
- Every PR body must include explicit issue links:
  - Primary: `Closes #NN`
  - Secondary: `Related: #NN`
- Run quality gates before opening or updating PRs.
- Human merges; agents prepare commits and PR artifacts.

## implementation pipeline

1. **Plan**: generate a checklist (todolist) before writing code.
2. **Implement**: build the feature (ensure `go build ./...` passes).
3. **Push Early**: commit and push immediately after the first working pass to unblock the PR.
4. **Report**: generate a review report in `tmp/reports/{branch-name}-review.md`.

## verification and proof

- Proof over claims: save screenshots to `tmp/screenshots/` and logs to `tmp/tests/`.
- Never claim a test passed without providing the output file path for human verification.
- A task is NOT done until the human can inspect the results. Specifically:
  1. Every E2E or integration test MUST write its output to `tmp/tests/` (under a descriptive subdirectory).
  2. The agent MUST verify the output files exist on disk after the run (e.g. `ls -la tmp/tests/<subdir>/`).
  3. The agent MUST print or display the full contents of the output files to the human.
  4. If the output files are missing, empty, or in the wrong location, the task is failed -- fix and re-run.
  5. Never say "results saved" without showing the file path AND the file contents to the human.
- This applies to all agents working on this project, without exception.

## tmp/ workflow

The `tmp/` directory is gitignored and used for local development artifacts:

```text
tmp/
  versions/       -- local version docs and roadmap (working copies)
  reports/         -- PR review reports and implementation summaries
  screenshots/     -- visual proof of agent behavior
  tests/           -- test output logs and verification artifacts
  logs/            -- runtime logs and agent action traces
```

These files are never committed but are read during local workflows and agent verification.

## documentation model

- `AGENTS.md` -- canonical agent contract (this file)
- `CLAUDE.md` -- symlink to `AGENTS.md`
- `README.md` -- project-level overview, setup, usage
- `.env.example` -- required/optional env vars with descriptions
- `tmp/versions/` -- local working version docs

## agent behavior

- No emoji in code or docs.
- No AI signatures or "Generated by AI" co-author tags in commits.
- Be explicit about assumptions.
- Prefer concrete implementation over speculative abstraction.
- When blocked by missing context, provide what is complete and identify the exact blocker.

## how the agent uses tools

The agent does NOT use MCP. Tools are registered directly with the ADK via `functiontool.New`, which wraps a Go function as a Gemini function-calling tool. When the agent runs:

1. The ADK runner sends the user prompt + system instruction + tool schemas to Gemini.
2. Gemini decides which tool to call and generates a `FunctionCall` with JSON args.
3. The ADK runner deserializes the args, calls the Go function, and sends the result back to Gemini.
4. Gemini reasons about the result and either calls another tool or produces a final text response.

This loop continues until Gemini emits a final response (no more tool calls).

```text
Gemini LLM
  |-- decides to browse a URL
  |-- emits FunctionCall{name: "browse", args: {url: "..."}}
  |
ADK Runner
  |-- deserializes args into browseArgs struct
  |-- calls browseFn(toolContext, browseArgs)
  |-- browseFn calls supacrawl.Client.Scrape(ctx, url, opts)
  |-- supacrawl.Client makes HTTP GET to scraper /v1/scrape
  |-- returns browseResult -> serialized to JSON -> sent back to Gemini
  |
Gemini LLM
  |-- reads the markdown content, reasons about it
  |-- decides to take a screenshot for visual confirmation
  |-- emits FunctionCall{name: "screenshot", args: {url: "..."}}
  |-- ... loop continues ...
```

The tools capture a `*supacrawl.Client` via closure, so no global state or dependency injection framework is needed. Tool functions receive `tool.Context` which embeds `context.Context` for proper cancellation.

## testing policy

Every PR must document what was tested. Three test levels exist:

### level 1: unit tests (required per PR)

Test individual functions and methods in isolation using `httptest` mock servers.

| What | How | Example |
|------|-----|---------|
| HTTP client methods | `httptest.NewServer` -> client -> assert response | `client_test.go` |
| Config loading | `t.Setenv` -> `LoadLLMConfig()` -> assert values | `config_test.go` |
| Tool registration | `NewBrowseTool(client)` -> assert name/description | `tools_test.go` |
| Pure functions | Direct call -> assert output | any `_test.go` |

### level 2: integration tests (required when tooling allows)

Test tool functions end-to-end with mock HTTP servers simulating the scraper API. These verify the full chain: tool args -> client call -> HTTP request -> response -> tool result.

ADK `tool.Context` cannot be constructed outside the ADK internals, so tool invocation through `tool.Run()` is not testable without the full ADK runner. Instead, test at the client level with realistic arg patterns matching what tools would send.

### level 3: E2E tests

Test the full agent loop: real Gemini API + real/mock scraper + runner event loop. Requires `GOOGLE_API_KEY`. Run via `./golem e2e <harness>`.

#### E2E harnesses

| Harness | Command | Requires | What it tests |
|---------|---------|----------|--------------|
| `thinking` | `./golem e2e thinking` | `GOOGLE_API_KEY` | Thinking mode at LOW/MEDIUM levels, trace output |
| `agent` | `./golem e2e agent [prompt]` | `GOOGLE_API_KEY` | Full agent loop with tools, custom prompt |
| `level0` | `./golem e2e level0` | `GOOGLE_API_KEY` | Echo + payload tools only (no scraper needed) |

Output goes to `tmp/tests/<harness>/`. Each run produces:
- `*_e2e.log` -- agent stdout/stderr
- `*_otel_spans.json` -- OTel trace file for observer visualization

#### observer tests

The observer app (`apps/observer/`) has its own test suite:

```bash
cd apps/observer && bun run test     # 59 unit tests (vitest)
cd apps/observer && bun run lint     # eslint
cd apps/observer && bun run build    # tsc + vite build
```

### PR test documentation

Every PR body must include a test plan section:

```markdown
## Test plan

- [x] `go build ./...` passes
- [x] `go vet ./...` passes
- [x] `go test ./...` passes (N tests)
- [x] pre-commit hooks pass
- [ ] E2E smoke test (if applicable, with output path)
```

If any E2E tests were run (level 3), the PR description MUST include:
- The command used to run the test
- Output file path (saved to `tmp/tests/`)
- Summary of what was tested (target URL, tools exercised, findings)
- Pass/fail result with any errors encountered

This ensures human reviewers can verify E2E claims independently.

## doc map

- Canonical rules: `AGENTS.md`
- GitHub Copilot instructions: `.github/copilot-instructions.md`
- Scoped Copilot instructions: `.github/instructions/*.instructions.md`
- AI code review guide: `.github/instructions/ai-code-review.instructions.md`
- Copilot/Gemini review handler: `.github/instructions/copilot-review.instructions.md`
- Gemini Code Assist config: `.gemini/`

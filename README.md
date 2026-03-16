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
- **Orchestration**: [Google ADK-Go v0.3.0](https://github.com/google/adk-go) (llmagent pattern)
- **Perception**: [Supacrawler](https://github.com/antoine-ross/supacrawler) (Playwright-powered API)
- **Language**: Go 1.23+
- **Hosting**: Google Cloud (Cloud Run)

## Quick start

```bash
# Clone the repository
git clone https://github.com/antoine-ross/golem.git
cd golem

# Set up environment
cp .env.example .env.local
# Edit .env.local with your API keys

# Verify configuration
./golem env list

# Run the agent
./golem start
```

## Prerequisites

- Go 1.23+
- A running [Supacrawler](https://github.com/antoine-ross/supacrawler) instance
- Google Gemini API key

## Commands

```bash
./golem start       # Start the agent
./golem stop        # Stop the agent
./golem status      # Show agent process status
./golem env list    # Show env configuration status
./golem lint        # Run linters (when available)
./golem test        # Run tests (when available)
./golem help        # Show all commands
```

## Project structure

```text
cmd/golem/main.go         -- entry point
internal/adk/             -- model factory, runner, agent config
internal/browser/         -- Supacrawl client, browser_action tool
internal/perception/      -- visual hashing, state mapping
internal/security/        -- attack trees, payload engineering
internal/report/          -- regex parser for vulnerability reports
tmp/                      -- local dev artifacts (gitignored)
```

## Development

See `AGENTS.md` for the full workflow contract including branching, versioning, and quality gates.

## License

Apache-2.0

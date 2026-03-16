# AI Code Review Guide

Standard process for reviewing code generated or modified by AI assistants.

---

## Review Output Location

All review documents must be saved to `tmp/reviews/`, NOT committed to the repository.

```bash
mkdir -p tmp/reviews
# Naming convention: {branch-name}-review.md
```

The `tmp/` directory is gitignored. Reviews are working documents, not permanent artifacts.

---

## Instruction Context

Before reviewing, confirm which instruction layers apply:

1. Repository-wide instructions: `.github/copilot-instructions.md`
2. Path-specific instructions: `.github/instructions/*.instructions.md`
3. Agent instructions: `AGENTS.md` / `CLAUDE.md` (symlinked)
4. Gemini Code Assist config: `.gemini/`

---

## High-Signal Policy

Do not leave review comments for checks that pre-commit already enforce:
- Formatting (gofmt), lint (govet), type-check, build failures
- Generated-file formatting churn

Focus comments on what automation cannot catch:
- Correctness bugs and logic regressions
- Architecture violations (see AGENTS.md)
- Security and secret handling
- Error propagation and observability gaps
- Cross-service consistency (golem <-> scraper)

---

## Service Port Map

| Service | Default Port | Evidence |
|---------|--------------|----------|
| Golem agent | `8080` | `docker-compose.yml` |
| Scraper API | `8081` (internal), `8082` (host) | `docker-compose.yml`, `apps/scraper/` |
| Redis | `6379` | `docker-compose.yml` |

Inside docker-compose: scraper is `http://scraper:8081`.
From host: scraper is `http://localhost:8082`.

---

## 1. Security Checklist

### Input Validation

| Check | Action |
|-------|--------|
| Max limits | Cap user-provided limits |
| Required fields | Validate before use |
| External data | Never trust -- normalize before processing |

### Authentication/Authorization

| Check | Action |
|-------|--------|
| API keys in config | Load from env, never log |
| Bearer tokens | Never log, never expose |

### External Data Normalization

When ingesting scraped web content:

```go
func normalizeText(input string) string {
    input = strings.ReplaceAll(input, "\x00", "")
    input = norm.NFC.String(input)
    return strings.TrimSpace(input)
}
```

---

## 2. Error Handling Checklist

### API Client Errors

| Check | Action |
|-------|--------|
| Rate limits | Parse headers, implement backoff |
| Timeouts | Use context with timeout |
| Retries | Implement with exponential backoff |
| Non-2xx responses | Parse body for error details |

### Goroutine Error Recovery

| Check | Action |
|-------|--------|
| Background workers | Must have restart logic |
| Panic recovery | Use `defer recover()` in goroutines |
| Context cancellation | Check `ctx.Err()` before restarting |

---

## 3. Performance Checklist

### Redis Usage

| Check | Action |
|-------|--------|
| Key expiration | Set TTL for cache entries |
| Stream trimming | Use MAXLEN to cap stream size |
| Pipeline operations | Batch when possible |

### HTTP Handlers

| Check | Action |
|-------|--------|
| Response size | Limit with pagination or truncation |
| Timeout | Set on context |

---

## 4. Code Quality (High-Signal Only)

| Check | Action |
|-------|--------|
| File size | Split if > 500 lines |
| Function size | Split if > 50 lines |
| Exported functions | Must have doc comments |
| Package names | Lowercase, no underscores |

---

## 5. Test Coverage Checklist

### Unit Tests Required For

| Component | Test Cases |
|-----------|------------|
| HTTP client methods | httptest-based, happy + error paths |
| Tool registration | Name, description, creation |
| Config loading | Env var precedence, defaults |
| Error paths | All error conditions |

### Integration Tests Required For

| Component | Test Cases |
|-----------|------------|
| Tool invocation | Mock server -> tool function -> verify result |
| Redis operations | Streams, expiration (when used) |

### E2E Tests (Deferred to v0.6)

| Component | Test Cases |
|-----------|------------|
| Full agent loop | Model + tools + runner end-to-end |
| Scraper integration | Real scraper service running |

---

## 6. Review Process

### Step 1: Plan Review

Create checklist based on changed files:
- ADK tool changes -> verify tool registration and arg types
- HTTP client changes -> security review (URLs, auth, body reads)
- Agent config changes -> verify system prompt alignment
- Main wiring changes -> verify graceful degradation

### Step 2: Automated Checks

```bash
cd apps/golem && go build ./... && go vet ./... && go test ./...
pre-commit run --all-files
```

### Step 3: Go-specific second pass

- Enumerate every call site returning `error`; verify each is handled or logged.
- Search for `context.Background()`, `go func`, `time.NewTicker`, `Close(`.
- Verify context propagation through tool functions.
- Check for silent error swallowing.

### Step 4: Comment Format

```
[critical] Description of bug/risk with evidence and concrete fix.
[high] Logic errors, silent failure paths, broken workflow gates.
[suggestion] Non-blocking improvement with rationale.
[nit] Small non-blocking polish item.
```

Note: `.gemini/styleguide.md` restricts Gemini Code Assist automated reviews to `[critical]` and `[high]` only. This guide is for comprehensive agent-driven manual reviews, where `[suggestion]` and `[nit]` are useful for lower-severity observations.

---

## 7. Common AI-Generated Code Issues

| Issue | What to Look For |
|-------|------------------|
| Missing error handling | `_ = ` ignoring errors |
| Silent failure paths | Error swallowed, empty result returned |
| Callback passthrough | `AfterModel` must return `(resp, respErr)`, not `(nil, nil)` |
| `context.Background()` in tools | Should use tool.Context (embeds context.Context) |
| Hardcoded values | Magic numbers, URLs, credentials |
| Missing validation | User input used directly |
| Byte vs rune mismatch | `len(s)` counts bytes; `utf8.RuneCountInString(s)` counts runes. Use consistent units. |
| Unbounded prompt injection | Session state injected into prompts must be capped to prevent token explosion |
| Over-engineering | Abstractions without clear benefit |
| Under-testing | Only happy path tests |
| Committed build artifacts | Binaries, `*.test`, local executables |
| Manual `Accept-Encoding` | Go's `http.Client` skips auto-decompression when `Accept-Encoding` is set manually. Verify decompression is handled explicitly. |
| `deflate` encoding | Servers commonly send zlib-wrapped (RFC 1950), not raw deflate (RFC 1951). Use `zlib.NewReader`, not `flate.NewReader`. |
| Nondeterministic map iteration | `for k, v := range map` is random-order. Sort keys before building output strings or tool responses. |
| Intentional test delays | `time.Sleep` in production code makes tests slow. Make delays injectable (e.g., `skipDelay` field) so tests can bypass them. |

---

## 8. Review Output Template

Save to `tmp/reviews/{branch-name}-review.md`:

```markdown
# Code Review: {PR title}

**Branch**: `{branch-name}`
**PR**: #{pr_number}
**GH Issue**: #{issue_number}
**Date**: {YYYY-MM-DD}

## Verdict

- [ ] Approved
- [ ] Approved with comments
- [ ] Changes requested

## Issues Found

### [critical] {title}
**File:** `path/to/file.go:line`
**Issue:** Description.
**Fix:** code block

### [suggestion] {title}
**File:** `path/to/file`
**Issue:** Improvement.

## Files Reviewed

| File | Status | Notes |
|------|--------|-------|
| `path/to/file` | OK | |
```

---

## References

- `AGENTS.md` -- canonical agent contract and architecture
- `.github/copilot-instructions.md` -- repo-wide Copilot instructions
- `.gemini/` -- Gemini Code Assist configuration
- `docker-compose.yml` -- service port truth

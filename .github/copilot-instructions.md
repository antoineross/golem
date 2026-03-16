# Copilot instructions (golem)

Use `AGENTS.md` as the canonical repository workflow contract.

## hard requirements

1. Use `./golem` commands for local workflow lifecycle. Do not bypass with raw `go run` in normal workflows.
2. Follow env safety rules: do not print secret values, do not inspect `.env`/`.env.local`; use `.env.example` and `./golem env list`.
3. Keep changes scoped to the active version/work slice; avoid unrelated refactors.
4. Run quality checks before completion:
   - `pre-commit run --all-files`
   - `./golem lint`
   - `./golem test`
   - `go build ./...`
5. Keep versioning in sync for behavior changes (update `tmp/versions/` locally, GH issues when confirmed).
6. Every PR body must include explicit issue links: primary issues must use closing keywords (`Closes #123`), secondary references must use `Related: #123`.
7. Final output must include the PR link (or blocker), validation proof, the required `Closes`/`Related` lines, and final `git status`.

## architecture context

G.O.L.E.M. is an autonomous security agent using Google ADK-Go v0.3.0 to orchestrate a Perceive-Reason-Execute loop. Gemini 3 Flash provides multimodal reasoning. Supacrawler provides visual web perception.

Key constraint: `OutputSchema` and `Tools` are mutually exclusive in ADK v0.3.0. Use Regex Parsers for structured output.

## doc map

- Canonical rules: `AGENTS.md`
- Scoped instruction packs: `.github/instructions/*.instructions.md`
- Gemini Code Assist: `.gemini/`

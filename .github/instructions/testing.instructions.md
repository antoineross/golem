---
applyTo: "**/*"
---

# testing and verification rules

Before marking tasks done:
1. `pre-commit run --all-files`
2. `./golem lint`
3. `./golem test`
4. `go build ./...`

If the repository has not yet bootstrapped Go module/test files, commands must produce explicit skip or actionable failure output (not silent success).

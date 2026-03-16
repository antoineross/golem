---
applyTo: "**/*.go"
---

# go implementation rules

- Keep `context.Context` as first parameter for request-scoped work.
- Wrap returned errors with context (`fmt.Errorf("action: %w", err)`).
- Avoid global mutable state; inject dependencies.
- Keep command wiring in `cmd/`; keep business logic in `internal/`.
- Never swallow errors from command execution, JSON parsing, or IO operations.
- Use descriptive names for multi-step logic; short names only for tiny scopes.
- Prefer explicit constructors with dependency injection.
- Keep operational logging structured and useful for debugging.
- No silent error suppression.

# golem review style guide

## review philosophy

Only comment on correctness, reliability, security, or workflow contract violations. Do not comment on style nits that automated tooling already checks.

## severity

- `[critical]`: security risk, data loss, crash, secret exposure.
- `[high]`: logic errors, silent failure paths, broken workflow gates.

Do not produce medium/low/nit comments.

## key checks

- Secrets are never printed or committed.
- `./golem` wrapper workflow is respected.
- Error handling is explicit and contextual.
- ADK constraints (OutputSchema vs Tools exclusivity) are respected.
- Version docs updated when behavior changes.

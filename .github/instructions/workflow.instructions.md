---
applyTo: "**/*"
---

# workflow rules

- Use `./golem` as the primary local workflow entrypoint.
- Never expose or print secrets from env files.
- Keep commits focused on one work slice.
- Every PR body must include issue linking lines: primary issues with closing keywords (`Closes #123`) and secondary references as `Related: #123`.
- Update version docs when behavior or workflow contract changes.

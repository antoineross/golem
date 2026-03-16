---
applyTo: "**/*"
---

# versioning rules

Format: `vX.Y.Z` where X=major, Y=minor (features/patches), Z=sub-features/issues.

- Local working docs live in `tmp/versions/` (gitignored, updated frequently).
- GitHub Issues are the remote source of truth (updated when changes are confirmed).
- Version doc naming: `vX.Y.Z-{issue_number}-short-description.md`.
- Statuses: `SPEC`, `IN_PROGRESS`, `IMPLEMENTED`, `DEFERRED`, `SUPERSEDED`.
- One issue per Z-level sub-feature.

---
applyTo: "**/*"
---

# golem architecture context

System shape:

```
User Input -> ADK Runner -> Gemini Reasoning -> Tool Call (Supacrawl) -> Visual Confirmation -> Final Report
```

Core boundaries:
- ADK runner handles agent lifecycle, session management, and event streaming.
- Browser tool layer wraps Supacrawl API for screenshots, DOM snapshots, and actions.
- Perception layer handles visual hashing and state discovery.
- Security layer implements attack personas, payload engineering, and multi-session context.
- Report layer uses regex parsing to extract structured vulnerability data from LLM text.

Primary reference: `AGENTS.md`.

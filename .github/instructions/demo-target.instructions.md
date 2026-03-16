---
applyTo: "apps/demo-target/**"
---

# demo-target context

This is an intentionally vulnerable Next.js 16 (App Router) web app used as the proof target for the G.O.L.E.M. security agent. It contains deliberate security flaws by design.

## Key facts

- Location: `apps/demo-target/`
- Stack: Next.js 16, TypeScript, Tailwind CSS v4
- Package manager: bun (use `bunx` not `npx`)
- No database, no real auth -- all data is in-memory
- Dockerfile included for Cloud Run deployment

## Deliberate vulnerabilities (do not fix)

| Route | Flaw | Type |
|-------|------|------|
| `/` | Hidden admin link (`display:none`), HTML comment leak, `console.log` token | Hidden element, info leak |
| `/shop` | Client-side price calculation, hidden discount input | Business logic bypass |
| `/api/checkout` | No server-side total validation | Business logic bypass |
| `/admin` | No authentication, `?bypass=true` debug info | Missing auth, info leak |
| `/api/users/[id]` | No authorization check | IDOR |
| `/profile` | Hidden role field, invisible delete button (`opacity:0`) | Hidden element, privilege escalation |
| `/api/profile` | Accepts arbitrary role without authorization | Privilege escalation |
| Layout | Config leak in `__APP_CONFIG__` script tag | Info leak |

## Review policy

Do NOT flag these as security issues in code reviews -- they exist to be discovered by the agent. PRs touching this app should be reviewed for functionality and build correctness only.

# demo-target

Intentionally vulnerable Next.js 16 app for G.O.L.E.M. agent testing.

**This app contains deliberate security flaws. Do not deploy to production.**

## Setup

```bash
cd apps/demo-target
bun install
bun run build
bun run start
```

Open http://localhost:3000.

## Vulnerability Routes

| Route | Vulnerability |
|-------|--------------|
| `/` | Hidden admin link, HTML comment leak, console.log token leak |
| `/shop` | Client-side price calculation, hidden discount input |
| `/api/checkout` | No server-side total validation |
| `/admin` | No authentication required, debug bypass via `?bypass=true` |
| `/api/users/[id]` | IDOR -- no authorization check |
| `/profile` | Hidden role field, invisible delete button |
| `/api/profile` | Accepts arbitrary role without authorization |
| Layout | Config leak via `__APP_CONFIG__` script tag |

# `@spectre/web`

Next.js App Router. Port: `3001`.

**Architecture (CONFIRMED):** Feature-Sliced Design — **D-023**, `docs/21-frontend-architecture.md`, `docs/adr/ADR-0002-frontend-fsd.md`.  
Import direction: `app → widgets → features → entities → shared`.

## Run

```bash
pnpm --filter @spectre/web dev
pnpm --filter @spectre/web build
pnpm --filter @spectre/web lint       # ESLint (TS + restricted deep imports)
pnpm --filter @spectre/web lint:fsd   # Steiger FSD boundaries
pnpm --filter @spectre/web lint:all
```

API must be reachable for auth (default rewrite target `http://localhost:3000`). Override with `API_ORIGIN` (see root `.env.example`).

## FSD layout (AS-IS)

```text
src/
├── app/                 # routes only (composition)
│   └── login/
├── widgets/
│   └── session-panel/
├── features/
│   ├── login/
│   └── logout/
├── entities/
│   └── session/
└── shared/
    ├── api/
    └── ui/
```

## Behaviour

- `/login` — `features/login` → `POST /auth/login`.
- `/` — `widgets/session-panel` → `GET /auth/me`; 401 → `/login`; `features/logout` → `POST /auth/logout`.
- Synthetic banner: `shared/ui` (D-012).
- Rewrite `/api/v1/*` → Nest (`next.config.ts`).
- No registration, recovery, MFA, CSRF token, Workspace, or document UI.

Local login needs an existing User + active OrganizationMembership in Postgres (Gate A2 — no product seed yet).

Lint configs: `eslint.config.mjs`, `steiger.config.mjs`.  
Cursor rule: `.cursor/rules/08-frontend-fsd.mdc`.  
Code inventory: `docs/26-codebase-current-state.md`.

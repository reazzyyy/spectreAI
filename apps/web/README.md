# `@spectre/web`

Next.js App Router. Port: `3001`.

**Architecture (CONFIRMED):** Feature-Sliced Design — **D-023**, `docs/21-frontend-architecture.md`, `docs/adr/ADR-0002-frontend-fsd.md`.  
Import direction: `app → widgets → features → entities → shared`.

**Quality bar (CONFIRMED D-024 / ADR-0004):** SCSS Modules + CSS tokens, own `shared/ui`, RHF+Zod, TanStack Query, Vitest+RTL + Storybook+Chromatic + Playwright.  
**AS-IS (F1):** Sass tokens + SCSS Modules for new UI, Stylelint, Button/Input, RHF+Zod login, TanStack Query for session, Vitest+RTL. Storybook / Chromatic / Playwright — not wired yet. `system-map` still uses plain CSS Modules (migrate later).

## Run

```bash
pnpm --filter @spectre/web dev
pnpm --filter @spectre/web build
pnpm --filter @spectre/web test
pnpm --filter @spectre/web lint         # ESLint (TS + restricted deep imports)
pnpm --filter @spectre/web lint:fsd     # Steiger FSD boundaries
pnpm --filter @spectre/web lint:styles  # Stylelint (SCSS/CSS; system-map ignored until migrate)
pnpm --filter @spectre/web lint:all
```

API must be reachable for auth (default rewrite target `http://localhost:3000`). Override with `API_ORIGIN` (see root `.env.example`).  
Set `WEB_ORIGIN=http://localhost:3001` on the API for CSRF Origin allowlist (**W-014a**). Mutating `fetch` sends `X-CSRF-Token` from `spectre_csrf`.

## FSD layout (AS-IS)

```text
src/
├── app/                 # routes + global SCSS tokens
│   ├── login/
│   ├── system/          # AS-IS onboarding map (no auth)
│   └── styles/
├── widgets/
│   ├── session-panel/
│   └── system-map/
├── features/
│   ├── login/           # RHF + Zod
│   └── logout/
├── entities/
│   └── session/         # + TanStack Query options for /auth/me
└── shared/
    ├── api/             # fetch client + QueryProvider
    ├── lib/
    └── ui/              # SyntheticModeBanner, Button, Input
```

## Behaviour

- `/login` — `features/login` (RHF+Zod) → `POST /auth/login`.
- `/` — `widgets/session-panel` → `GET /auth/me` via TanStack Query; 401 → `/login`; `features/logout` → `POST /auth/logout`; link to `/system`.
- `/system` — `widgets/system-map`: AS-IS map + interactive system-design board; no session required.
- Synthetic banner: `shared/ui` (D-012).
- Rewrite `/api/v1/*` → Nest (`next.config.ts`). Mutating `fetch` sends `X-CSRF-Token` from `spectre_csrf` (**W-014a**).
- No registration, recovery, MFA, Workspace UI, invite accept UI, or document UI.

Local login needs an existing User + active OrganizationMembership in Postgres. Product entry is **W-011–W-012** (Email+Password+Organization ID; bootstrap + invite-only); **product seed/invite UI is not implemented yet**.

Lint configs: `eslint.config.mjs`, `steiger.config.mjs`, `stylelint.config.mjs`.  
Tests: `vitest.config.ts`.  
Cursor rule: `.cursor/rules/08-frontend-fsd.mdc`.  
Code inventory: `docs/26-codebase-current-state.md`.  
Plan: `tasks/plan.md` (F1+).

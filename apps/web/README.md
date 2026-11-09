# `@spectre/web`

Next.js App Router. Port: `3001`.

**Architecture (CONFIRMED):** Feature-Sliced Design — **D-023**, `docs/21-frontend-architecture.md`, `docs/adr/ADR-0002-frontend-fsd.md`.  
Import direction: `app → widgets → features → entities → shared`.

**Quality bar (CONFIRMED D-024 / ADR-0004):** SCSS Modules + CSS tokens, own `shared/ui`, RHF+Zod, TanStack Query, Vitest+RTL + Storybook+Chromatic + Playwright.  
**AS-IS (F5d):** login/create/edit Workspace + Matter list/create/edit, Matter↔Workspace links, AppShell/Home, Vitest+RTL, Storybook/Chromatic, Playwright auth smoke. `system-map` still plain CSS Modules. TEAM / members / Client screens — not wired.

## Run

```bash
pnpm --filter @spectre/web dev
pnpm --filter @spectre/web build
pnpm --filter @spectre/web test
pnpm --filter @spectre/web test:e2e          # Playwright; needs Postgres + bootstrap + E2E_ORGANIZATION_ID
pnpm --filter @spectre/web lint
pnpm --filter @spectre/web lint:fsd
pnpm --filter @spectre/web lint:styles
pnpm --filter @spectre/web lint:all
pnpm --filter @spectre/web storybook
pnpm --filter @spectre/web build-storybook
pnpm --filter @spectre/web chromatic   # needs CHROMATIC_PROJECT_TOKEN
```

First Playwright browsers: `pnpm --filter @spectre/web exec playwright install chromium`.

API must be reachable for auth (default rewrite target `http://localhost:3000`). Override with `API_ORIGIN` (see root `.env.example`).  
Set `WEB_ORIGIN=http://localhost:3001` on the API for CSRF Origin allowlist (**W-014a**). Mutating `fetch` sends `X-CSRF-Token` from `spectre_csrf`.

## FSD layout (AS-IS)

```text
src/
├── app/
│   ├── (product)/       # AppShell + Home + /projects + /matters
│   ├── login/
│   ├── system/
│   └── styles/
├── widgets/
│   ├── app-shell/
│   ├── home-overview/
│   ├── workspace-list/
│   ├── workspace-detail/
│   ├── matter-list/
│   ├── matter-detail/
│   └── system-map/
├── features/
│   ├── login/
│   ├── logout/
│   ├── create-workspace/
│   ├── edit-workspace/
│   ├── manage-workspace-matters/
│   ├── create-matter/
│   └── edit-matter/
├── entities/
│   ├── session/
│   ├── workspace/
│   └── matter/
└── shared/
    ├── api/
    ├── lib/
    └── ui/
```

## Behaviour

- `/login` — RHF+Zod → `POST /auth/login` (no product shell).
- `/` — `AppShell` + `HomeOverview`; session + recent workspaces; 401 → `/login`.
- `/projects` — list/create PERSONAL Workspace.
- `/projects/[id]` — detail + edit + Matter link/unlink.
- `/matters` — list/create Matter.
- `/matters/[id]` — detail + edit title/status.
- Nav: Home, Все проекты, Все дела; link to `/system`.
- Desktop gate below 1280px (Make constraint).
- `/system` — system-map onboarding (no shell).
- Synthetic banner in topbar (D-012).

Local login needs User + OrganizationMembership. Plan: `tasks/plan.md`.

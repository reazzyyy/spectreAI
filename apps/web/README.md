# `@spectre/web`

Next.js App Router. Port: `3001`.

**Architecture (CONFIRMED):** Feature-Sliced Design — **D-023**, `docs/21-frontend-architecture.md`, `docs/adr/ADR-0002-frontend-fsd.md`.  
Import direction: `app → widgets → features → entities → shared`.

**Quality bar (CONFIRMED D-024 / ADR-0004):** SCSS Modules + CSS tokens, own `shared/ui`, RHF+Zod, TanStack Query, Vitest+RTL + Storybook+Chromatic + Playwright.  
**AS-IS (F5e):** Workspace + Matter + Client list/create/edit, Matter↔Workspace links, AppShell/Home, Vitest+RTL, Storybook/Chromatic, Playwright auth smoke. `system-map` still plain CSS Modules. TEAM / members / Client linking — not wired.

## Run

```bash
pnpm --filter @spectre/web dev
pnpm --filter @spectre/web build
pnpm --filter @spectre/web test
pnpm --filter @spectre/web test:e2e
pnpm --filter @spectre/web lint
pnpm --filter @spectre/web lint:fsd
pnpm --filter @spectre/web lint:styles
pnpm --filter @spectre/web lint:all
pnpm --filter @spectre/web storybook
pnpm --filter @spectre/web build-storybook
pnpm --filter @spectre/web chromatic
```

API: `API_ORIGIN` (default `http://localhost:3000`). Set `WEB_ORIGIN=http://localhost:3001` on API for CSRF.

## FSD layout (AS-IS)

```text
src/
├── app/(product)/   # Home, /projects, /matters, /clients
├── widgets/         # app-shell, home, workspace-*, matter-*, client-*, system-map
├── features/        # login, logout, create/edit workspace|matter|client, matters links
├── entities/        # session, workspace, matter, client
└── shared/          # api, lib, ui
```

## Behaviour

- `/login` — auth form.
- `/` — home + recent workspaces.
- `/projects`, `/projects/[id]` — Workspace list/create/edit + Matter links.
- `/matters`, `/matters/[id]` — Matter list/create/edit.
- `/clients`, `/clients/[id]` — Client list/create/edit.
- Nav: Home, проекты, дела, клиенты, `/system`.
- Desktop gate below 1280px. Synthetic banner (D-012).

Plan: `tasks/plan.md`.

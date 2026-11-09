# `@spectre/web`

Next.js App Router. Port: `3001`.

**Architecture (CONFIRMED):** Feature-Sliced Design — **D-023**, `docs/21-frontend-architecture.md`, `docs/adr/ADR-0002-frontend-fsd.md`.  
Import direction: `app → widgets → features → entities → shared`.

**Quality bar (CONFIRMED D-024 / ADR-0004):** SCSS Modules + CSS tokens, own `shared/ui`, RHF+Zod, TanStack Query, Vitest+RTL + Storybook+Chromatic + Playwright.  
**AS-IS (F5k + system-map SCSS):** Workspace PERSONAL|TEAM + members picker, Matter + Client CRUD, links, org members + owner role change + invitations + `/invite/accept`, AppShell/Home, Vitest+RTL, Storybook/Chromatic, Playwright auth smoke. `system-map` on SCSS Modules (D-024).

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
├── app/(product)/   # Home, /projects, /matters, /clients, /organization
├── app/invite/      # /invite/accept (no shell)
├── widgets/         # app-shell, home, workspace-*, matter-*, client-*, organization-invites, system-map
├── features/        # login, logout, invitations, workspace|matter|client, members, matters links
├── entities/        # session, workspace, matter, client, invitation, org-member
└── shared/          # api, lib, ui
```

## Behaviour

- `/login` — auth form.
- `/invite/accept` — accept org invite (token + optional password); no product shell.
- `/` — home + recent workspaces.
- `/projects`, `/projects/[id]` — Workspace list/create (PERSONAL|TEAM)/edit + Matter links + TEAM members (org picker).
- `/matters`, `/matters/[id]` — Matter list/create/edit.
- `/clients`, `/clients/[id]` — Client list/create/edit.
- `/organization` — org members directory; Owner role change + invitations; `devToken` accept link.
- Nav: Home, проекты, дела, клиенты, Организация, `/system`.
- Desktop gate below 1280px. Synthetic banner (D-012).

Plan: `tasks/plan.md`.

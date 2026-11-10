# `@spectre/web`

Next.js App Router. Port: `3001`.

**Architecture (CONFIRMED):** Feature-Sliced Design — **D-023**, `docs/21-frontend-architecture.md`, `docs/adr/ADR-0002-frontend-fsd.md`.  
Import direction: `app → widgets → features → entities → shared`.

**Quality bar (CONFIRMED D-024 / ADR-0004):** SCSS Modules + CSS tokens, own `shared/ui`, RHF+Zod, TanStack Query, Vitest+RTL + Storybook+Chromatic + Playwright.  
**AS-IS (F5k + Phase 3 documents thin + CI e2e):** Workspace PERSONAL|TEAM + members picker, Matter + Client CRUD, links, `/documents` library upload, org members + owner role change + invitations + `/invite/accept`, AppShell/Home, Vitest+RTL, Storybook/Chromatic, Playwright auth smoke (CI `web-e2e`). `system-map` on SCSS Modules (D-024).

**Design reference:** корневая папка `designSpectreAI/` — визуальный/IA референс (Figma Make). Не runtime-зависимость и не источник копипаста. В продукте «Проект» = **Workspace** (`entities/workspace`, `/workspaces`). Стили и экраны переписываются в FSD + SCSS Modules под канон D-023/D-024. Chat UI — после Phase 5A API; до этого вкладки без фиктивных AI-действий.

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
├── app/(product)/   # Home, /projects, /matters, /clients, /documents, /organization
├── app/invite/      # /invite/accept (no shell)
├── widgets/         # app-shell, home, workspace-* (incl. project-bar UI), matter-*, client-*, document-list, organization-invites, system-map
├── features/        # login, logout, invitations, workspace|matter|client, upload-document, members, matters links
├── entities/        # session, workspace, matter, client, document, invitation, org-member
└── shared/          # api, lib, ui
```

**Chat (после Phase 5A, не AS-IS):** целевая карта — `entities/conversation`, `features/create-conversation` / `send-message`, `widgets/chat-workspace`, routes `/projects/[id]/chats[…]`. До API — только disabled tab + StateCard.

## Behaviour

- `/login` — auth form.
- `/invite/accept` — accept org invite (token + optional password); no product shell.
- `/` — home + recent workspaces.
- `/projects` — list + client search/`?visibility=` + create; `/projects/[id]` — project-bar (Обзор) + edit/matters/members; Чаты/Research/Drafts disabled.
- `/matters`, `/matters/[id]` — Matter list/create/edit.
- `/clients`, `/clients/[id]` — Client list/create/edit.
- `/documents` — Workspace-scoped list + multipart upload (PDF/DOCX/TXT); no OCR/preview.
- `/organization` — org members directory; Owner role change + invitations; `devToken` accept link.
- Nav: Home, проекты (Все/Личные/Команда), создать проект, дела, клиенты, документы, Организация, `/system`.
- Desktop gate below 1280px. Synthetic banner (D-012).

Plan: `tasks/plan.md`. Phase 5A chat foundation: same file. UI port slices: shell → projects list → project-bar → chat after API.

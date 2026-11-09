# Frontend D-024 — task list

План: `tasks/plan.md`. Roadmap продукт: `tasks/roadmap.md`.

## Gate
- [x] Канон D-024 / ADR-0004 в `main`
- [x] План F1–F5+ записан

## F1 Foundation
- [x] Done (in `main`)

## F2 App shell + Home
- [x] Done (in `main`)

## F3 Storybook + Chromatic
- [x] Storybook 10 + nextjs-vite
- [x] Stories Button / Input / Icon
- [x] Chromatic addon + CLI script
- [x] Docs / AS-IS; verify build-storybook + lint/test/build

## F4 Playwright smoke
- [x] Config + Chromium smoke (unauth → login; login → home)
- [x] Docs / AS-IS; verify test + test:e2e

## F5a Workspace list + PERSONAL create
- [x] Entity/API/Query + create form + /projects list
- [x] Nav/home wiring; docs / AS-IS; verify

## F5b Workspace detail + edit
- [x] GET/PATCH detail UI; list/home links; docs / verify

## F5c Workspace ↔ Matter links
- [x] Link/unlink panel on detail; docs / verify

## F5d Matter list/create/edit
- [x] /matters CRUD thin + nav; docs / verify

## F5e Client list/create/edit
- [x] /clients CRUD thin + nav; docs / verify

## F5f Client links on Matter / Workspace
- [x] clientId picker on edit forms; docs / verify

## F5g Org invitations UI
- [x] Entity + /organization list/create/resend/revoke; nav; docs / verify

## F5h Invite accept UI
- [x] /invite/accept + acceptInvitation API; docs / verify

## F5i TEAM create + members UI
- [x] API unlock TEAM create; create visibility; members panel; docs / verify

## F5j Org members directory
- [x] GET …/members + /organization list + TEAM picker; docs / verify

## F5k Org role change
- [x] PATCH …/members/:userId + owner UI; docs / verify

## Chore: system-map SCSS
- [x] CSS Modules → SCSS Modules; stylelint ignore removed; docs / verify

## Chore: CI Playwright
- [x] GitHub Actions `web-e2e` smoke (bootstrap + Chromium)
- [x] Stabilize login: Zod-valid email + bootstrap JSON + API Origin preflight + ignore Next route-announcer alert

## Later
- [ ] Optional: CI Chromatic publish when token ready
- [ ] Roadmap next: documents (Фаза 3) / docs/31 next screens when ready

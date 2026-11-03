# Implementation Plan: Phase 1 — web login

> Текущий срез. Глобальный живой план — `tasks/roadmap.md`. Предыдущий закрытый срез (Auth API scaffold) остаётся в истории git; этот файл описывает только активную фазу.

## Overview

Подключить `@spectre/web` к уже существующим `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`: страница `/login`, метка synthetic/test, просмотр сессии и выход. Способ входа — scaffold email+password+organizationId (не CONFIRMED в journal). MFA/SSO, invitations, register, recovery — OUT OF SCOPE. CSRF double-submit / Origin gate остаются OPEN (SameSite=Lax).

**Опора:** `tasks/roadmap.md` Фаза 1; API уже в AS-IS; `docs/21` same-origin `/api/v1`.

## Architecture Decisions

- Trunk — `main`. Ветка: `feature/web-login-phase-1`.
- Next rewrite `/api/v1/:path*` → `API_ORIGIN` (default `http://localhost:3000`) — cookie same-origin, `credentials: "same-origin"`.
- Клиентский API-слой в `apps/web/src/shared/api` (без Prisma-типов).
- `/` без сессии → redirect `/login`; после login → `/` с user/org; logout гасит сессию.
- Frontend: **D-023** FSD; login выровнен по слоям; Steiger + ESLint (`lint` / `lint:fsd`).
- OUT OF SCOPE: CSRF token, MFA/SSO (O-008), seed/invite UI, Workspace, Client/Matter UI.

## Task List

### Phase 1: Web session UI
- [x] Task 1: API client + auth endpoints (login / me / logout)
- [x] Task 2: `/login` + home session panel + synthetic banner + rewrite
- [x] Task 3: AS-IS + README + plan/todo; checkpoint build
- [x] Task 4: FSD layers + Steiger/ESLint

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| CORS / cookie cross-port | Высокий | Rewrite same-origin, не CORS `*` |
| CSRF на mutating forms | Средний | SameSite=Lax; CSRF/Origin — OPEN до отдельного среза |
| Нет seed пользователей | Средний | Документировать; Gate A2 |

## Open Questions / OUT OF SCOPE

- CSRF / Origin gate перед следующими mutating forms.
- Gate A2: способ входа CONFIRMED, кто создаёт первых пользователей.
- **O-008** MFA/SSO.

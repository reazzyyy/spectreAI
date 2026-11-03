# Implementation Plan: Phase 1 — web login (**CLOSED**)

> **Статус среза:** закрыт (2026-10-30). Глобальный план — `tasks/roadmap.md`.  
> **Следующий код-срез:** Фаза 2 (Workspace + membership + RLS) — только после утверждённого плана slices по `docs/CURSOR-INSTRUCTIONS-WORKSPACE-PHASE2.md`. Этот файл не заменяется, пока Фаза 2 не стартует.

## Overview (что было сделано)

Подключён `@spectre/web` к `POST /auth/login`, `GET /auth/me`, `POST /auth/logout`: `/login`, метка synthetic/test, session panel, logout.

**Способ входа:** Email + Password + Organization ID — **CONFIRMED (W-011)**; scaffold совпадает. MFA/SSO не в MVP (**W-013** / **O-008**). Invitations / register / recovery — OUT OF SCOPE этого среза. CSRF (**W-014**) — отдельный срез до следующих mutating forms (сейчас SameSite=Lax).

**Опора:** `tasks/roadmap.md` Фаза 1; AS-IS `docs/26`; `docs/21` same-origin `/api/v1`.

## Architecture Decisions

- Trunk — `main`. Ветка среза: `feature/web-login-phase-1` (влита).
- Next rewrite `/api/v1/:path*` → `API_ORIGIN` — cookie same-origin.
- Frontend: **D-023** FSD; Steiger + ESLint.
- OUT OF SCOPE среза: CSRF token, MFA/SSO, seed/invite UI, Workspace, Client/Matter UI.

## Task List

### Phase 1: Web session UI
- [x] Task 1: API client + auth endpoints (login / me / logout)
- [x] Task 2: `/login` + home session panel + synthetic banner + rewrite
- [x] Task 3: AS-IS + README + plan/todo; checkpoint build
- [x] Task 4: FSD layers + Steiger/ESLint

## Risks (актуально после закрытия)

| Risk | Status |
|------|--------|
| CORS / cookie cross-port | Снят rewrite same-origin |
| CSRF на следующих mutating forms | **W-014** — отдельный срез обязателен |
| Нет seed/invite в коде | Ворота A2 закрыты продуктово; bootstrap/invite — следующий технический долг (**W-012**, **O-011**) |

## Open / next (не этот срез)

- CSRF / Origin gate (**W-014**) перед новыми mutating forms.
- Seed/bootstrap + invitations (**W-012**, TTL — **O-011**).
- Фаза 2: Workspace / RLS (**W-001–W-020**, ADR-0003).
- **O-008** MFA/SSO — пост-MVP.

# Implementation Plan: Frontend quality bar (D-024) + product UI foundation

> **Статус:** в работе (старт 2026-11-06).  
> **Предыдущий план:** Phase 2 Workspace membership (S0–S4c) — **закрыт** в `main`; детали остаются в git history / `tasks/roadmap.md`.  
> **Канон:** **D-023**, **D-024** / ADR-0004, `docs/21`, `docs/22`, AS-IS `docs/26`.  
> **Эталон:** `interview-platform` (стек) + дисциплина декомпозиции из `ulbi`.  
> **Не цель этого плана:** полный перенос 11 экранов Figma Make; Storybook/Chromatic/Playwright wiring (отдельные срезы после F1–F2).

---

## Overview

Поднять в `apps/web` целевой бар **D-024** срезами, сохранив рабочий login/session, затем переносить shell и экраны из Figma Make под FSD + SCSS Modules.

## Architecture Decisions

- **Стили:** SCSS Modules + глобальные CSS variables; `sass` + Stylelint. Существующий CSS Modules (system-map) мигрирует отдельно, не блокирует F1.
- **UI-kit:** свой `shared/ui` (Button, Input первым срезом); без shadcn.
- **Формы:** RHF + Zod на login.
- **Данные:** TanStack Query для `GET /auth/me` (session panel).
- **Тесты F1:** Vitest + RTL на UI/схему; Storybook/Chromatic/Playwright — F3+.
- **Макет:** токены F1 совместимы с текущим scaffold; визуальное выравнивание с Make — в срезе shell (F2).

## Task List (slices → отдельные PR в `main`)

```text
F1  Foundation: Sass/tokens/Stylelint + Button/Input + Vitest + login RHF/Zod + Query session
F2  App shell (sidebar/topbar) + Home по Make (hash→App Router routes)
F3  Storybook + Chromatic wiring (stories на shared/ui)
F4  Playwright smoke (login → home / 401)
F5+ Product screens from Make (projects, chat, …) по docs/31 — отдельные PR
```

### F1 — Foundation ✅ в `main`

**Acceptance criteria:** выполнены (Sass/Stylelint/Button/Input/RHF+Zod/Query/Vitest).

### F2 — App shell + Home ✅ в `main`

### F3 — Storybook + Chromatic ✅ в `main`

### F4 — Playwright smoke ✅ в `main`

### F5a — Workspace list + PERSONAL create (текущий PR)

**Description:** `/projects` — `GET /workspaces` + `POST /workspaces` (PERSONAL); nav + home preview.

**Acceptance criteria:**
- [x] `entities/workspace` + `features/create-workspace` + `widgets/workspace-list`
- [x] Route `/projects`; nav «Все проекты»; home recent list
- [x] Vitest schema; AS-IS / README / plan

**Out of scope F5a:** Workspace detail, TEAM create, members/matters UI, search.

## Risks

- Next 16 + Vitest: держать unit-тесты в jsdom без browser-mode в F1.
- system-map остаётся на `.module.css` до отдельного chore — допустимый долг AS-IS.
- Не тащить demo-state из Figma Make в prod-путь.

## Checkpoint after F1

- [ ] Login/logout/`/auth/me` работают как раньше
- [ ] CI/local lint+test+build green
- [ ] Review перед F2 (shell)

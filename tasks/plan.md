# Implementation Plan: Scaffold монорепо (D-008)

## Overview

Первый исполняемый каркас платформы: pnpm-монорепо, Next.js, NestJS, PostgreSQL/Prisma, Redis/BullMQ, внутренний AI Gateway только с `SyntheticAIProvider`, и тесты, что дело одной организации не читается из контекста другой. Это scaffold, не MVP.

Подтверждено журналом: стек **D-008**, `Client`/`Matter` **D-009**, статусы AIJob **D-011**, Synthetic до **O-002** **D-012**, префикс `/api/v1`. Мультиарендность как архитектура остаётся **H-001**; тесты изоляции делаются по явному запросу и `docs/22-testing-and-quality-strategy.md`, без перевода H-001 в CONFIRMED.

## Architecture Decisions

- Trunk — `main`. Каждая строка ниже — короткоживущая ветка и merge в `main`.
- Общие пакеты: `@spectre/ai-gateway`, `@spectre/access`, `@spectre/db`. Приложения: `@spectre/api` (порт 3000), `@spectre/web` (порт 3001).
- До закрытия O-002 в репозитории нет SDK OpenAI и нет сетевого вызова модели. Gateway принимает только `dataClass: "synthetic"`.
- Организация актёра задаётся сервером. Клиентский `organizationId` не является доказательством доступа. Пока нет сессий (O-008), HTTP без серверного актёра отвечает `401`. В тестах актёр подменяется через DI.
- Чужой или неизвестный Matter отвечает `404` с кодом `NOT_FOUND` и без полей ресурса.
- Prisma 7 (не 8 RC): схема в `packages/db`, URL в `prisma.config.ts`, клиент через `@prisma/adapter-pg`. В этой итерации модели только `Organization`, `Client`, `Matter`. `workspaceId` у Matter необязателен и без FK, пока нет сущности Workspace. User/Membership не создаём до задачи аутентификации.
- BullMQ: очередь `ai-jobs` регистрируется только при `REDIS_URL`. Воркер документов не запускается.
- Локальные пароли в `docker-compose.yml` только для dev. `.env` не коммитится.

## Task List

### Phase 1: Foundation
- [x] Task 1: план в `tasks/` (`docs/scaffold-plan`)
- [x] Task 2: корень pnpm, gitignore, compose Postgres+Redis (pgvector), `.env.example` (`chore/monorepo-workspace`)

### Phase 2: Policies that do not need a database
- [x] Task 3: `SyntheticAIProvider` и запрет несинтетических данных (`feature/synthetic-ai-gateway`)
- [x] Task 4: чтение Matter только внутри организации актёра (`feature/org-matter-isolation`)

### Phase 3: Applications
- [x] Task 5: NestJS `/api/v1` — health, статус провайдера, чтение Matter, e2e изоляции (`feature/api-scaffold`)
- [x] Task 6: Next.js с явной меткой synthetic/test (`feature/web-synthetic-shell`)

### Phase 4: Confirmed infrastructure
- [ ] Task 7: Prisma-схема Organization/Client/Matter и `prisma validate` (`feature/prisma-org-matter`)
- [ ] Task 8: модуль очереди BullMQ `ai-jobs` без воркера (`feature/bullmq-ai-jobs-queue`)

### Checkpoint: Scaffold
- [ ] `pnpm test` проходит
- [ ] `pnpm --filter @spectre/api build` и `pnpm --filter @spectre/web build` проходят
- [ ] `prisma validate` проходит
- [ ] В git нет `.env`, секретов и `node_modules`

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Prisma 8 ещё RC | Средний | Фиксируем линейку 7 |
| Тест примет клиентский organization id за доступ | Высокий | Актёр только из DI; без актёра 401 |
| Случайный вызов внешнего AI | Высокий | Нет OpenAI SDK; runtime-отказ для любого `dataClass`, кроме `synthetic`; тест, что `fetch` не вызывается |
| H-001 будет воспринят как утверждённая архитектура | Средний | В коде и плане явно H-001, не CONFIRMED |

## Open Questions

- Сессии и членство — отдельная задача после `docs/12-authentication-and-sessions.md` (O-008 открыт).
- Полная модель Workspace, ACL и admin grant не входят в этот scaffold.
- Интеграционный тест Prisma против живого Postgres запускается только если поднят compose и задан `DATABASE_URL`; без этого обязательный барьер — unit/e2e на in-memory store и `prisma validate`.

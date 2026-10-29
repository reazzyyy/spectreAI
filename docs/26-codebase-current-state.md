# Текущее состояние кодовой базы (AS-IS)

**Статус:** CONFIRMED как снимок scaffold на дату ниже; не заменяет продуктовые спецификации и не утверждает MVP.  
**Дата снимка:** 2026-10-29  
**Источник истины по решениям:** `docs/decisions-log.md`  
**План scaffold:** `tasks/plan.md` / `tasks/todo.md` (все задачи scaffold отмечены выполненными)

Этот документ описывает **только то, что реально есть в репозитории**. Спецификации в `docs/00–25` могут описывать целевое MVP шире; если код ещё не реализован — ниже явно указано «не реализовано».

## 1. Что это за репозиторий сейчас

Исполняемый **scaffold монорепо** (не готовый MVP): pnpm workspace, NestJS API, Next.js shell, пакеты доступа и AI Gateway, Prisma-схема Organization/Client/Matter, регистрация имени очереди BullMQ `ai-jobs`.

| Утверждение | Статус в коде |
|---|---|
| Стек D-008 (Next.js, NestJS, PostgreSQL, Prisma, Redis/BullMQ) | Каркас есть; API и web поднимаются локально |
| SyntheticAIProvider (D-012) | Реализован; внешнего OpenAI SDK нет |
| Client / Matter (D-009) | Prisma-модели есть; `GET /matters/:matterId` читает Matter из Postgres через `@spectre/db` |
| Сессии / User / Membership | Не реализованы |
| Workspace как сущность | Не реализована; у Matter есть опциональный `workspaceId` без FK |
| Загрузка документов / OCR / RAG | Не реализованы |
| Воркер очереди AI / обработка документов | Не реализованы |
| Admin content-grant | Не реализован |

## 2. Структура монорепо

```
spectreAI/
├── apps/
│   ├── api/          @spectre/api    NestJS, префикс /api/v1, порт 3000
│   └── web/          @spectre/web    Next.js shell, порт 3001
├── packages/
│   ├── access/       @spectre/access Политика чтения Matter по organizationId
│   ├── ai-gateway/   @spectre/ai-gateway SyntheticAIProvider + AiGateway
│   └── db/           @spectre/db     Prisma 7 schema + migration
├── docs/             Канонические спецификации и этот AS-IS снимок
├── tasks/            План и чеклист scaffold
├── docker-compose.yml  Postgres (pgvector/pg16) + Redis 7 (только local)
├── .env.example
├── AGENTS.md
└── package.json      pnpm@9, Node >= 22
```

Корневые скрипты:

| Команда | Назначение |
|---|---|
| `pnpm install` | Установка workspace |
| `pnpm test` | Рекурсивно `test` во всех пакетах, где есть скрипт |
| `pnpm build` | Рекурсивно `build` |
| `pnpm dev:api` | API на `:3000` |
| `pnpm dev:web` | Web на `:3001` |
| `docker compose up -d` | Локальные Postgres + Redis |
| `pnpm --filter @spectre/db validate` | `prisma validate` |

## 3. Приложения

### 3.1 `@spectre/api` (`apps/api`)

**Точка входа:** `src/main.ts` — NestFactory, глобальный префикс `api/v1`, порт из `PORT` (по умолчанию 3000).

**Модуль:** `src/app.module.ts`

| Компонент | Путь | Поведение |
|---|---|---|
| Health | `src/health/health.controller.ts` | `GET /api/v1/health` → `{ status: "ok" }` |
| Matters | `src/matters/*` | `GET /api/v1/matters/:matterId` под `ActorGuard`; store → Prisma |
| AI | `src/ai/*` | `GET /api/v1/ai/provider`, `POST /api/v1/ai/generate` |
| Ошибки | `src/http/api-exception.filter.ts` | Единый JSON `{ error: { code, message, requestId } }` |
| Актёр | `src/auth/*` | DI-токен `ACTOR_CONTEXT`; в runtime по умолчанию `null` → 401 на Matters |
| Prisma | `src/db/prisma.service.ts` | `createPrismaClient` из `@spectre/db`; `$disconnect` на destroy |
| Очередь | `src/queue/*` | Имя `ai-jobs`, фабрика `createAiJobsQueue`; **воркер не стартует**; в AppModule только имя очереди |

**Хранилище Matter в API:** `createPrismaMatterStore` + `MatterAccess` (изоляция по `organizationId` актёра). In-memory `SYNTHETIC_MATTERS` удалён. E2e сидирует две org/matter в Postgres.

**Аутентификация:** сессий нет. Без подмены `ACTOR_CONTEXT` через DI (как в e2e) защищённые маршруты отвечают `401` / `UNAUTHENTICATED`. Клиентский `organizationId` в запросе не принимается как доказательство доступа.

### 3.2 `@spectre/web` (`apps/web`)

Next.js App Router: `src/app/layout.tsx`, `src/app/page.tsx`.

- Явная метка синтетического/тестового режима в UI.
- Нет вызовов API, сессий, рабочих пространств, загрузки файлов.

## 4. Пакеты

### 4.1 `@spectre/access`

Публичный API: `MatterRecord`, `MatterStore`, `MatterAccess.readForOrganization(actorOrganizationId, matterId)`.

- Чужой или отсутствующий Matter → `null` (вызывающий слой отдаёт одинаковый `NOT_FOUND`).
- Пустой `actorOrganizationId` → `null`.

### 4.2 `@spectre/ai-gateway`

- Константа статусов AIJob (D-011): `queued|running|succeeded|failed|cancelled|timed_out`.
- `SyntheticAIProvider.generateText` — только `dataClass === "synthetic"`; иначе `AiGatewayError` / `AI_DATA_POLICY_BLOCKED`.
- Сети нет: результат вида `synthetic:{operationId}:{inputTokens}`; `providerId: "synthetic"`, `modelId: "synthetic-echo"`.
- `AiGateway` — тонкая обёртка над единственным Synthetic-провайдером.

### 4.3 `@spectre/db`

- Prisma 7, URL в `prisma.config.ts`, клиент генерируется в `src/generated`.
- Публичный API: `createPrismaClient` (+ re-export `PrismaClient` / типов) через `@prisma/adapter-pg`.
- Модели: `Organization`, `Client`, `Matter`.
- `Matter.workspaceId` опционален, **без FK** (Workspace ещё нет).
- Composite FK: Matter → Client только в той же организации.
- Миграция: `prisma/migrations/20261027200000_init_organization_client_matter`.
- User / Membership / Document / AIJob / Audit — **в схеме нет**.
- Runtime consumer: `@spectre/api` (`PrismaService` → чтение Matter).

## 5. HTTP-контракт scaffold (фактический)

Префикс: `/api/v1`.

| Метод | Путь | Auth | Успех | Ошибки |
|---|---|---|---|---|
| GET | `/health` | нет | `{ status: "ok" }` | — |
| GET | `/ai/provider` | нет | `{ providerId: "synthetic", externalTransferEnabled: false }` | — |
| POST | `/ai/generate` | нет | `{ providerId, modelId, synthetic, text }` | `422 VALIDATION_ERROR`; `403 AI_DATA_POLICY_BLOCKED` |
| GET | `/matters/:matterId` | требуется актёр | поля Matter | `401 UNAUTHENTICATED`; `404 NOT_FOUND` |

Тело `POST /ai/generate`:

- Обязательные строки: `operationId`, `dataClass`, `content`.
- Лимиты парсера: `operationId` ≤ 128, `content` 1…2000 символов.
- Несинтетический `dataClass` блокируется gateway.

Формат ошибки:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found",
    "requestId": "<uuid>"
  }
}
```

Сообщения 5xx не раскрывают внутренности (`INTERNAL_ERROR`).

## 6. Инфраструктура локальной разработки

`docker-compose.yml` (только local):

- Postgres: образ `pgvector/pgvector:pg16`, user/password/db `spectre`, порт `5432`.
- Redis: `redis:7-alpine`, порт `6379`.

`.env.example`: `DATABASE_URL`, `REDIS_URL`, `PORT`. Файл `.env` не коммитится. Пароли compose — не для shared/production.

## 7. Тесты (что покрыто)

| Место | Что проверяет |
|---|---|
| `packages/access` | Изоляция Matter по organizationId |
| `packages/ai-gateway` | Synthetic OK; блок несинтетики; статусы AIJob; нет `fetch` |
| `apps/api` e2e | health, provider, 401 без актёра; Matter из Postgres: свой 200, чужой 404 без утечки; generate/block/validation |
| `apps/api` queue unit | имя `ai-jobs`, разбор Redis URL |
| `@spectre/db` | `prisma validate` как скрипт `test` |

E2e Matters требуют поднятый Postgres (`docker compose`) и применённые миграции (`pnpm --filter @spectre/db migrate:deploy`).

## 8. Явно не реализовано (ожидаемо по спецификациям, отсутствует в коде)

Не считать сделанным, пока нет кода и тестов:

- Аутентификация, сессии, MFA/SSO (см. `docs/12`, O-008).
- CRUD Client/Matter через БД (есть только чтение Matter); Workspace; ACL матрица; admin grant.
- Загрузка файлов, хранилище, OCR, парсинг (D-010/D-017, H-002).
- BullMQ worker, сущность/жизненный цикл AIJob в БД.
- RAG / pgvector индексы в приложении (D-018 — решение есть, кода поиска нет).
- OpenAI adapter (запрещён до O-002; целевой провайдер D-015).
- Аудит-хранилище, метрики production, деплой в РФ (D-014 — требование, реализации нет).
- Удаление по D-019/D-020 в коде.

## 9. Онбординг разработчика (минимальный путь)

1. Прочитать `AGENTS.md` → `docs/decisions-log.md` → `docs/DOCUMENTATION-GOVERNANCE.md`.
2. Прочитать этот файл и `tasks/plan.md`.
3. `pnpm install` → `docker compose up -d` → скопировать `.env.example` в `.env`.
4. `pnpm --filter @spectre/db migrate:deploy` → `pnpm test` → `pnpm dev:api` / `pnpm dev:web`.
5. Перед фичей — канонический `docs/NN-*.md` области + правило документации кода (`.cursor/rules/07-code-documentation.mdc`).
6. Git: короткоживущая ветка → merge в `main` (`.cursor/rules/06-git-commits.mdc`).

## 10. Правило актуализации этого документа

При любом изменении публичного поведения scaffold (новый endpoint, пакет, модель Prisma, очередь, способ auth) **в том же изменении** обновить:

1. этот файл (разделы фактов);
2. README затронутого `apps/*` или `packages/*`;
3. при смене контракта API — сверку с `docs/11-api-conventions.md` (или вынести расхождение как OPEN).

Не записывать сюда целевое MVP как будто оно уже в коде.

# Текущее состояние кодовой базы (AS-IS)

**Статус:** CONFIRMED как снимок scaffold на дату ниже; не заменяет продуктовые спецификации и не утверждает MVP.  
**Дата снимка:** 2026-10-30  
**Источник истины по решениям:** `docs/decisions-log.md`  
**План:** живой глобальный план — `tasks/roadmap.md` (может меняться; не описание этого снимка). Текущий срез (Фаза 1 web login) — `tasks/plan.md` / `tasks/todo.md`.

Этот документ описывает **только то, что реально есть в репозитории**. Спецификации в `docs/00–25` могут описывать целевое MVP шире; если код ещё не реализован — ниже явно указано «не реализовано».

## 1. Что это за репозиторий сейчас

Исполняемый **scaffold монорепо** (не готовый MVP): pnpm workspace, NestJS API, Next.js web (login UI + rewrite к API), пакеты доступа и AI Gateway, Prisma-схема Organization/Client/Matter/User/OrganizationMembership/Session, серверные сессии (cookie), регистрация имени очереди BullMQ `ai-jobs`.

| Утверждение | Статус в коде |
|---|---|
| Стек D-008 (Next.js, NestJS, PostgreSQL, Prisma, Redis/BullMQ) | Каркас есть; API и web поднимаются локально |
| SyntheticAIProvider (D-012) | Реализован; внешнего OpenAI SDK нет |
| Client / Matter (D-009) | Prisma-модели есть; HTTP CRU+list для Client/Matter через `@spectre/access` + Prisma (hard delete нет) |
| Сессии / User / Membership | Scaffold: email+password login, HttpOnly cookie, `ACTOR_CONTEXT` из Session |
| MFA / SSO (O-008) | **Не реализовано** (OUT OF SCOPE этой итерации) |
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
│   ├── access/       @spectre/access Политика Client/Matter (org-isolation scaffold)
│   ├── ai-gateway/   @spectre/ai-gateway SyntheticAIProvider + AiGateway
│   └── db/           @spectre/db     Prisma 7 schema + migrations
├── docs/             Канонические спецификации и этот AS-IS снимок
├── tasks/            План и чеклист текущей итерации
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

**Точка входа:** `src/main.ts` — NestFactory, `cookie-parser`, глобальный префикс `api/v1`, порт из `PORT` (по умолчанию 3000).

**Модуль:** `src/app.module.ts`

| Компонент | Путь | Поведение |
|---|---|---|
| Health | `src/health/health.controller.ts` | `GET /api/v1/health` → `{ status: "ok" }` |
| Auth | `src/auth/*` | login / logout / me; SessionService; REQUEST-scoped `ACTOR_CONTEXT` |
| Clients | `src/clients/*` | list/create/get/patch под `ActorGuard`; Prisma store + `ClientAccess` |
| Matters | `src/matters/*` | list/create/get/patch под `ActorGuard`; Prisma store + `MatterAccess` |
| AI | `src/ai/*` | `GET /api/v1/ai/provider`, `POST /api/v1/ai/generate` |
| Ошибки | `src/http/api-exception.filter.ts` | Единый JSON `{ error: { code, message, requestId } }` |
| Prisma | `src/db/prisma.service.ts` | `createPrismaClient` из `@spectre/db`; `$disconnect` на destroy |
| Очередь | `src/queue/*` | Имя `ai-jobs`, фабрика `createAiJobsQueue`; **воркер не стартует**; в AppModule только имя очереди |

**Хранилище Client/Matter в API:** `createPrismaClientStore` / `createPrismaMatterStore` + `ClientAccess` / `MatterAccess` (изоляция по `organizationId` актёра; не матрица `docs/07`). E2e сидирует org/client/matter/user/membership и проверяет cross-org `404` / чужой `clientId` → `422`.

**Аутентификация (scaffold subset `docs/12`, не полный MVP):**

- `POST /auth/login` — email + password + `organizationId`; argon2id; cookie `spectre_sid` (HttpOnly, SameSite=Lax); в БД только SHA-256 хеш токена.
- `organizationId` актёра берётся из `Session` (+ повторная проверка активного membership), не из заголовков/тела клиента.
- Без валидной сессии защищённые маршруты → `401` / `UNAUTHENTICATED`.
- TTL сессии scaffold: 7 суток абсолютных (не CONFIRMED в journal).
- MFA/SSO, invitations, register, recovery, CSRF token — **не реализованы**.

### 3.2 `@spectre/web` (`apps/web`)

Next.js App Router + **FSD (D-023)**: `app` / `widgets` / `features` / `entities` / `shared`.

- Явная метка synthetic/test: `shared/ui` на `/` и `/login` (D-012).
- `/login` — `features/login` → `POST /auth/login` (email, password, organizationId).
- `/` — `widgets/session-panel` → `GET /auth/me`; без сессии → `/login`; `features/logout` → `POST /auth/logout`.
- Сессия: `entities/session` (типы, API, `SessionMeta`).
- Browser `fetch` на `/api/v1/*` с `credentials: "same-origin"`; rewrite в `next.config.ts` на `API_ORIGIN` (по умолчанию `http://localhost:3000`).
- Линтеры: ESLint (`eslint.config.mjs`, deep-import ban) + Steiger FSD (`steiger.config.mjs`, `lint:fsd`).
- Нет регистрации, recovery, MFA, CSRF token, Workspace UI, загрузки файлов.

## 4. Пакеты

### 4.1 `@spectre/access`

Публичный API: `ClientRecord` / `ClientStore` / `ClientAccess` и `MatterRecord` / `MatterStore` / `MatterAccess` — read, list, create, update по `actorOrganizationId`.

- Чужой или отсутствующий id → `null` (HTTP → одинаковый `NOT_FOUND`).
- Create штампует `organizationId` актёра; пустой actor org → `null` / пустой list.
- Hard delete **нет** (OUT OF SCOPE первого slice).
- Это org-membership isolation scaffold, **не** полный ACL/`docs/07` / Workspace.

### 4.2 `@spectre/ai-gateway`

- Константа статусов AIJob (D-011): `queued|running|succeeded|failed|cancelled|timed_out`.
- `SyntheticAIProvider.generateText` — только `dataClass === "synthetic"`; иначе `AiGatewayError` / `AI_DATA_POLICY_BLOCKED`.
- Сети нет: результат вида `synthetic:{operationId}:{inputTokens}`; `providerId: "synthetic"`, `modelId: "synthetic-echo"`.
- `AiGateway` — тонкая обёртка над единственным Synthetic-провайдером.

### 4.3 `@spectre/db`

- Prisma 7, URL в `prisma.config.ts`, клиент генерируется в `src/generated`.
- Публичный API: `createPrismaClient` (+ re-export `PrismaClient` / типов) через `@prisma/adapter-pg`.
- Модели: `Organization`, `Client`, `Matter`, `User`, `OrganizationMembership`, `Session`.
- `Session` соответствует `AuthSession` в `docs/12` (урезанный subset) и хранит `organizationId`, привязанный при login.
- `Matter.workspaceId` опционален, **без FK** (Workspace ещё нет).
- Composite FK: Matter → Client только в той же организации.
- Миграции: `20261027200000_init_organization_client_matter`, `20261029120000_auth_user_membership_session`.
- Document / AIJob / Audit / Invitation — **в схеме нет**.
- Runtime consumer: `@spectre/api` (Client/Matter CRU + sessions).
- Поле `created_by` из `docs/06` в Prisma **ещё нет** (OPEN / отложено).

## 5. HTTP-контракт scaffold (фактический)

Префикс: `/api/v1`.

| Метод | Путь | Auth | Успех | Ошибки |
|---|---|---|---|---|
| GET | `/health` | нет | `{ status: "ok" }` | — |
| POST | `/auth/login` | нет | `{ user, organization }` + Set-Cookie | `401 UNAUTHENTICATED`; `422 VALIDATION_ERROR` |
| POST | `/auth/logout` | cookie optional | `{ ok: true }` + clear cookie | — |
| GET | `/auth/me` | сессия | `{ user, organization }` | `401 UNAUTHENTICATED` |
| GET | `/ai/provider` | нет | `{ providerId: "synthetic", externalTransferEnabled: false }` | — |
| POST | `/ai/generate` | нет | `{ providerId, modelId, synthetic, text }` | `422 VALIDATION_ERROR`; `403 AI_DATA_POLICY_BLOCKED` |
| GET | `/clients` | сессия | `{ items: Client[] }` | `401 UNAUTHENTICATED` |
| POST | `/clients` | сессия | Client (`201`) | `401`; `422 VALIDATION_ERROR` |
| GET | `/clients/:clientId` | сессия | Client | `401`; `404 NOT_FOUND` |
| PATCH | `/clients/:clientId` | сессия | Client | `401`; `404`; `422` |
| GET | `/matters` | сессия | `{ items: Matter[] }` | `401 UNAUTHENTICATED` |
| POST | `/matters` | сессия | Matter (`201`) | `401`; `422` (в т.ч. чужой/неизвестный `clientId`) |
| GET | `/matters/:matterId` | сессия | Matter | `401`; `404 NOT_FOUND` |
| PATCH | `/matters/:matterId` | сессия | Matter | `401`; `404`; `422` |

Тело Client: `{ id, organizationId, name, status }` (`status`: `active` \| `archived`).  
Тело Matter: `{ id, organizationId, title, clientId, workspaceId, status }` (`status`: `active` \| `archived`).  
`organizationId` в теле запроса игнорируется / не принимается парсером — только из сессии. Hard `DELETE` Client/Matter **нет**.

Тело `POST /auth/login`:

- Обязательные: `email`, `password`, `organizationId` (UUID).
- Одинаковый `401` при неверных credentials / неактивном аккаунте / отсутствии membership (без enumeration).
- Ответ не содержит пароль, хеш или сырой session token.

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

### Сверка с каноном (не молчать о расхождениях)

| Канон | Статус канона | Факт в коде | Вердикт |
|---|---|---|---|
| `docs/decisions-log.md` O-008 MFA/SSO | OPEN | Нет MFA/SSO | Соответствует OUT OF SCOPE |
| `docs/12` §5.1 способ входа | PROPOSED | Scaffold: email+password (без email verify) | Не CONFIRMED; выбор scaffold, не закрывает O-008 |
| `docs/12` §5.2 алгоритм login | PROPOSED | Шаги 1–7 есть; §8 audit event — нет | Audit OUT OF SCOPE |
| `docs/12` §5.3 `GET /auth/me` | PROPOSED иллюстрация `organizations[]` + `emailVerified` | Фактически: одна `organization` (из Session) без `emailVerified` | **OPEN** форма DTO до утверждения полного `docs/12` |
| `docs/12` §5.4 актёр из сессии | принцип | Cookie→Session→membership; клиентский org игнорируется | Соответствует |
| `docs/12` §6.1 cookie | PROPOSED | HttpOnly, SameSite=Lax, Secure в production, Path=/ | Соответствует scaffold |
| `docs/12` §6.2 TTL 7d + idle 24h | PROPOSED | Только абсолютные 7d; idle timeout нет | Idle — OPEN / не реализован |
| `docs/12` §6.4 logout | PROPOSED | Revoke + clear cookie, идемпотентно | Соответствует (без audit event) |
| `docs/12` §6.5 logout-all | PROPOSED | Нет | OUT OF SCOPE |
| `docs/12` §7 CSRF | PROPOSED | Только SameSite=Lax; web login/logout уже mutating | **OPEN** (см. также `docs/11` CSRF); double-submit / Origin — отдельный срез |
| `docs/21` same-origin API | PROPOSED detail | Next rewrite `/api/v1` → Nest | Соответствует локальному scaffold |
| `docs/21` / **D-023** FSD | CONFIRMED | Слои app/widgets/features/entities/shared + Steiger/ESLint | Соответствует scaffold login |
| `docs/11` префикс `/api/v1`, коды ошибок | — | `/api/v1`, `UNAUTHENTICATED` / `NOT_FOUND` / `VALIDATION_ERROR` | Согласовано |
| `docs/11` карта `clients`/`matters` | PROPOSED GET/POST (+ GET by id) | Есть также PATCH; DELETE нет | PATCH — scaffold extension; DELETE OUT OF SCOPE |
| `docs/06` `created_by` на Client/Matter | PROPOSED | Поля в Prisma нет | OPEN / отложено |
| `docs/07` ACL / Workspace для содержимого | PROPOSED | Любой active membership org видит/меняет Client/Matter своей org | Scaffold org-isolation; **не** закрывает матрицу §6 |
| `docs/11` API-002 механизм auth | OPEN | Cookie-сессии scaffold есть | API-002 **не закрыт**: CSRF/продуктовое утверждение метода входа ещё нужны |

## 6. Инфраструктура локальной разработки

`docker-compose.yml` (только local):

- Postgres: образ `pgvector/pgvector:pg16`, user/password/db `spectre`, порт `5432`.
- Redis: `redis:7-alpine`, порт `6379`.

`.env.example`: `DATABASE_URL`, `REDIS_URL`, `PORT`, `API_ORIGIN` (rewrite target для `@spectre/web`). Файл `.env` не коммитится. Пароли compose — не для shared/production. Отдельный session signing secret не используется (opaque DB sessions).

## 7. Тесты (что покрыто)

| Место | Что проверяет |
|---|---|
| `packages/access` | Изоляция Client/Matter read/list/create/update по organizationId |
| `packages/ai-gateway` | Synthetic OK; блок несинтетики; статусы AIJob; нет `fetch` |
| `apps/api` e2e | health, provider; 401 без cookie; Client/Matter CRU+list; чужой id → 404; чужой clientId → 422; header org игнорируется; generate/block/validation |
| `apps/api` queue unit | имя `ai-jobs`, разбор Redis URL |
| `@spectre/db` | `prisma validate` как скрипт `test` |

E2e требуют поднятый Postgres (`docker compose`) и применённые миграции (`pnpm --filter @spectre/db migrate:deploy`).

## 8. Явно не реализовано (ожидаемо по спецификациям, отсутствует в коде)

Не считать сделанным, пока нет кода и тестов:

- MFA/SSO (**O-008**), invitations, self-registration, email verify, recovery, logout-all, session list.
- CSRF token / Origin gate (web login уже есть; SameSite=Lax only).
- Продуктовый seed / invite первых пользователей (Gate A2).
- Полный `docs/12` (audit events, password policy product confirmation, idle timeout).
- Hard delete Client/Matter; `created_by`; Workspace entity; ACL матрица `docs/07`; admin grant.
- Загрузка файлов, хранилище, OCR, парсинг (D-010/D-017, H-002).
- BullMQ worker, сущность/жизненный цикл AIJob в БД.
- RAG / pgvector индексы в приложении (D-018 — решение есть, кода поиска нет).
- OpenAI adapter (запрещён до O-002; целевой провайдер D-015).
- Аудит-хранилище, метрики production, деплой в РФ (D-014 — требование, реализации нет).
- Удаление по D-019/D-020 в коде.

## 9. Онбординг разработчика (минимальный путь)

1. Прочитать `AGENTS.md` → `docs/decisions-log.md` → `docs/DOCUMENTATION-GOVERNANCE.md`.
2. Прочитать `tasks/roadmap.md` (порядок работ и ворота вводных), затем этот файл и текущий `tasks/plan.md`.
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

# Текущее состояние кодовой базы (AS-IS)

**Статус:** CONFIRMED как снимок scaffold на дату ниже; не заменяет продуктовые спецификации и не утверждает MVP.  
**Дата снимка кода:** 2026-11-06 (web F3 Storybook + F2 AppShell/Home + F1 D-024 + system map + S4c)  
**Сверка статусов решений:** 2026-11-06 (W-001–W-020, W-014a, **D-024**)  
**Источник истины по решениям:** `docs/decisions-log.md`  
**План:** `tasks/roadmap.md` / `tasks/plan.md`. S0–S4c в `main`. Полный W-020 / email provider / documents UI — ещё нет.

Этот документ описывает **только то, что реально есть в репозитории**. Спецификации в `docs/00–25` могут описывать целевое MVP шире; если код ещё не реализован — ниже явно указано «не реализовано».

## 1. Что это за репозиторий сейчас

Исполняемый **scaffold монорепо** (не готовый MVP): pnpm workspace, NestJS API, Next.js web (login UI + rewrite к API), пакеты доступа и AI Gateway, Prisma-схема Organization/Client/Matter/User/OrganizationMembership/Session, серверные сессии (cookie), регистрация имени очереди BullMQ `ai-jobs`.

| Утверждение | Статус в коде |
|---|---|
| Стек D-008 (Next.js, NestJS, PostgreSQL, Prisma, Redis/BullMQ) | Каркас есть; API и web поднимаются локально |
| SyntheticAIProvider (D-012) | Реализован; внешнего OpenAI SDK нет |
| Client / Matter (D-009) | Prisma-модели есть; HTTP CRU+list для Client/Matter через `@spectre/access` + Prisma (hard delete нет) |
| Сессии / User / Membership | Scaffold: email+password login, HttpOnly cookie, `ACTOR_CONTEXT` из Session |
| CSRF (W-014 / W-014a) | Origin allowlist (`WEB_ORIGIN`) + double-submit (`spectre_csrf` + `X-CSRF-Token`); login выдаёт CSRF cookie |
| Bootstrap первой Org (W-012) | CLI `bootstrap:dev` (dev-only, идемпотентный) |
| Invitations (W-012 / O-011) | Prisma + HTTP create/list/resend/revoke/accept; TTL `INVITE_TTL_HOURS`; email provider — stub/devToken |
| MFA / SSO (O-008) | **Не реализовано** (OUT OF SCOPE этой итерации) |
| Workspace как сущность | Prisma + `WorkspaceAccess` + HTTP CRU/list/members/matter-links; PERSONAL+TEAM create + web UI (F5i) |
| PostgreSQL RLS (W-020) | Tenant-boundary RLS + runtime role `spectre_app`; **неполное** (нет workspace-membership/chat/grant policies) |
| Загрузка документов / OCR / RAG | Не реализованы |
| Воркер очереди AI / обработка документов | Не реализованы |
| Admin content-grant | Не реализован |

## 2. Структура монорепо

```
spectreAI/
├── .github/workflows/ci.yml  PR/main: migrate + pnpm test (Postgres service)
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
| Workspaces | `src/workspaces/*` | list/create PERSONAL\|TEAM/get/patch, members, matter links под `ActorGuard` + `WorkspaceAccess` |
| Org members | `src/organizations/*` | `GET …/members` same-org directory (SEC-01); runtime RLS |
| Invitations | `src/invitations/*` | Org Owner invite CRUD-lite + accept; migrator store; TTL config |
| AI | `src/ai/*` | `GET /api/v1/ai/provider`, `POST /api/v1/ai/generate` |
| Ошибки | `src/http/api-exception.filter.ts` | Единый JSON `{ error: { code, message, requestId } }` |
| Prisma | `src/db/prisma.service.ts` | `createPrismaClient` из `@spectre/db`; `$disconnect` на destroy |
| Очередь | `src/queue/*` | Имя `ai-jobs`, фабрика `createAiJobsQueue`; **воркер не стартует**; в AppModule только имя очереди |

**Хранилище Client/Matter/Workspace в API:** Prisma stores + actor-scoped GUC wrappers + `ClientAccess` / `MatterAccess` / `WorkspaceAccess` (не матрица `docs/07`). E2e: cross-org `404`, чужой `clientId`/`matterId` → `422`, bad visibility → `422`.

**Аутентификация (scaffold subset `docs/12`, не полный MVP):**

- `POST /auth/login` — email + password + `organizationId`; argon2id; cookie `spectre_sid` (HttpOnly, SameSite=Lax); в БД только SHA-256 хеш токена.
- `organizationId` актёра берётся из `Session` (+ повторная проверка активного membership), не из заголовков/тела клиента.
- Без валидной сессии защищённые маршруты → `401` / `UNAUTHENTICATED`.
- TTL сессии scaffold: 7 суток абсолютных (не CONFIRMED в journal).
- MFA/SSO, register, recovery — **не реализованы**; invitations HTTP + CSRF (**W-014a**) — есть (см. таблицу HTTP).

### 3.2 `@spectre/web` (`apps/web`)

Next.js App Router + **FSD (D-023)**: `app` / `widgets` / `features` / `entities` / `shared`.

- Явная метка synthetic/test: `shared/ui` на `/`, `/login`, `/system` (D-012).
- `/login` — `features/login` (RHF + Zod) → `POST /auth/login` (email, password, organizationId); без product shell.
- `/` — `widgets/app-shell` + `widgets/home-overview`: Make-подобный chrome; `GET /auth/me` + краткий список Workspace; 401 → `/login`; logout в сайдбаре.
- `/projects` — `widgets/workspace-list` + `features/create-workspace`: `GET/POST /workspaces` (PERSONAL|TEAM).
- `/projects/[workspaceId]` — detail + edit + Matter links + TEAM members (`GET/POST/DELETE …/members`).
- `/matters`, `/matters/[id]` — list/create/edit Matter (`GET/POST/PATCH`).
- `/clients`, `/clients/[id]` — list/create/edit Client (`GET/POST/PATCH`).
- `/organization` — member directory (SEC-01) for any org member; Owner: invitations list/create/resend/revoke.
- `/invite/accept` — принять приглашение (токен + пароль для нового пользователя; существующий — с сессией, без пароля); без product shell.
- Matter/Workspace edit forms: optional `clientId` link/unlink (CRM + WS-07).
- `entities/matter`, `entities/client`, `entities/invitation`, `entities/org-member` — list/detail/create/update (+ invite mutate).
- `/system` — `widgets/system-map`: карта AS-IS без shell; не live health.
- Сессия: `entities/session`. Workspace: `entities/workspace` (типы, API, Query).
- Browser `fetch` на `/api/v1/*` с `credentials: "same-origin"` + CSRF header на мутациях; rewrite в `next.config.ts` на `API_ORIGIN` (по умолчанию `http://localhost:3000`).
- Линтеры: ESLint + Steiger FSD + Stylelint (system-map CSS пока в ignore до миграции).
- Стили AS-IS: SCSS-токены Make-aligned; `shared/ui` Button/Input/Icon; shell/home на SCSS Modules; system-map ещё plain CSS Modules.
- Тесты AS-IS: Vitest + RTL (Button, schemas, AppShell). Storybook 10 + stories `shared/ui`; Chromatic addon/CLI (publish — `CHROMATIC_PROJECT_TOKEN`). Playwright smoke: unauth `/` → `/login`; login → home (нужны Postgres + bootstrap + `E2E_ORGANIZATION_ID`). CI Playwright gate — ещё нет.
- Нет регистрации, recovery, MFA, org role change UI, загрузки файлов.

## 4. Пакеты

### 4.1 `@spectre/access`

Публичный API: Client/Matter org-isolation + **`WorkspaceAccess`** (S2).

- Client/Matter: чужой id → `null`; create штампует `organizationId` актёра.
- Workspace: content (PERSONAL owner / TEAM owner+member) отдельно от member-management (Workspace Owner **или** Org Owner/Admin без content read, **W-008**).
- Create Workspace: PERSONAL (default) или TEAM (**W-002**).
- Hard delete **нет**. Chat/grant ACL — ещё нет.

### 4.2 `@spectre/ai-gateway`

- Константа статусов AIJob (D-011): `queued|running|succeeded|failed|cancelled|timed_out`.
- `SyntheticAIProvider.generateText` — только `dataClass === "synthetic"`; иначе `AiGatewayError` / `AI_DATA_POLICY_BLOCKED`.
- Сети нет: результат вида `synthetic:{operationId}:{inputTokens}`; `providerId: "synthetic"`, `modelId: "synthetic-echo"`.
- `AiGateway` — тонкая обёртка над единственным Synthetic-провайдером.

### 4.3 `@spectre/db`

- Prisma 7, URL в `prisma.config.ts`, клиент генерируется в `src/generated`.
- `createPrismaClient({ purpose: "migrator" | "runtime" })` + `withActorContext` (GUC в interactive tx).
- Модели: Organization, Client, Matter, User, OrganizationMembership, Session, **Workspace, WorkspaceMember, WorkspaceMatter**.
- `Matter.workspaceId` legacy nullable без FK; связи Matter↔Workspace — `WorkspaceMatter` (backfill в миграции S1).
- Миграции: init, auth, **`20261103220000_workspace_rls_foundation`** (tables + `spectre_app` + tenant RLS).
- RLS FORCE на clients/matters/organization_memberships/workspaces/workspace_members/workspace_matters (только org GUC).
- Auth bootstrap / e2e seed — migrator URL; Client/Matter API — runtime + GUC.
- Document / AIJob / Audit / Chat — **в схеме нет**. `OrganizationInvitation` — есть (S4c).
- Поле `created_by` из `docs/06` на Client/Matter **ещё нет** (OPEN / отложено).

## 5. HTTP-контракт scaffold (фактический)

Префикс: `/api/v1`.

| Метод | Путь | Auth | Успех | Ошибки |
|---|---|---|---|---|
| GET | `/health` | нет | `{ status: "ok" }` | — |
| POST | `/auth/login` | нет (CSRF token не требуется) | `{ user, organization }` + `spectre_sid` + `spectre_csrf` | `401`; `422`; `403 CSRF_REJECTED` (чужой Origin) |
| POST | `/auth/logout` | cookie + CSRF | `{ ok: true }` + clear session/CSRF cookies | `403 CSRF_REJECTED` |
| GET | `/auth/me` | сессия | `{ user, organization }` | `401 UNAUTHENTICATED` |
| GET | `/ai/provider` | нет | `{ providerId: "synthetic", externalTransferEnabled: false }` | — |
| POST | `/ai/generate` | нет | `{ providerId, modelId, synthetic, text }` | `422 VALIDATION_ERROR`; `403 AI_DATA_POLICY_BLOCKED` |
| GET | `/clients` | сессия | `{ items: Client[] }` | `401 UNAUTHENTICATED` |
| POST | `/clients` | сессия + CSRF | Client (`201`) | `401`; `403 CSRF_REJECTED`; `422` |
| GET | `/clients/:clientId` | сессия | Client | `401`; `404 NOT_FOUND` |
| PATCH | `/clients/:clientId` | сессия | Client | `401`; `404`; `422` |
| GET | `/matters` | сессия | `{ items: Matter[] }` | `401 UNAUTHENTICATED` |
| POST | `/matters` | сессия + CSRF | Matter (`201`) | `401`; `403 CSRF_REJECTED`; `422` (в т.ч. чужой/неизвестный `clientId`) |
| GET | `/matters/:matterId` | сессия | Matter | `401`; `404 NOT_FOUND` |
| PATCH | `/matters/:matterId` | сессия | Matter | `401`; `404`; `422` |
| GET | `/workspaces` | сессия | `{ items: Workspace[] }` (content-visible) | `401` |
| POST | `/workspaces` | сессия + CSRF | Workspace PERSONAL\|TEAM (`201`) | `401`; `403 CSRF_REJECTED`; `422` (bad visibility, чужой `clientId`) |
| GET | `/workspaces/:workspaceId` | сессия | Workspace | `401`; `404 NOT_FOUND` |
| PATCH | `/workspaces/:workspaceId` | сессия | Workspace (OWNER) | `401`; `404`; `422` |
| GET | `/workspaces/:workspaceId/members` | сессия | `{ items: Member[] }` | `401`; `404` |
| POST | `/workspaces/:workspaceId/members` | сессия | Member (`201`) | `401`; `404`; `422` |
| PATCH | `/workspaces/:workspaceId/members/:userId` | сессия | Member | `401`; `404`; `422` |
| DELETE | `/workspaces/:workspaceId/members/:userId` | сессия | Member (`REVOKED`) | `401`; `404` |
| GET | `/workspaces/:workspaceId/matters` | сессия | `{ items: [{ matterId }] }` | `401`; `404` |
| POST | `/workspaces/:workspaceId/matters` | сессия | `{ matterId }` (`201`) | `401`; `404`; `422` (чужой/missing matter) |
| DELETE | `/workspaces/:workspaceId/matters/:matterId` | сессия | `{ ok: true }` | `401`; `404` |
| GET | `/organizations/:organizationId/members` | сессия (same org) | `{ items: OrgMember[] }` | `401`; `404` |
| GET | `/organizations/:organizationId/invitations` | сессия Owner | `{ items }` | `401`; `404` |
| POST | `/organizations/:organizationId/invitations` | сессия Owner + CSRF | Invitation (`201`, optional `devToken`) | `401`; `404`; `422` |
| POST | `/organizations/:organizationId/invitations/:id/resend` | сессия Owner + CSRF | Invitation | `401`; `404` |
| DELETE | `/organizations/:organizationId/invitations/:id` | сессия Owner + CSRF | Invitation revoked | `401`; `404` |
| POST | `/invitations/accept` | CSRF if session; new user: password | `{ organizationId, userId, role }` | `404`; `403`; `422` |

Тело Client: `{ id, organizationId, name, status }` (`status`: `active` \| `archived`).  
Тело Matter: `{ id, organizationId, title, clientId, workspaceId, status }` (`status`: `active` \| `archived`).  
Тело Workspace: `{ id, organizationId, ownerUserId, name, description, visibility, status, clientId }` (`visibility`: `PERSONAL` \| `TEAM`; `status`: `ACTIVE` \| …).  
Тело Member: `{ id, organizationId, workspaceId, userId, role, status }` (`role`: `EDITOR` \| `VIEWER`; `status`: `ACTIVE` \| `REVOKED`).  
`organizationId` / `ownerUserId` в теле запроса игнорируются / не принимаются — только из сессии. Hard `DELETE` Client/Matter/Workspace **нет**. TEAM create через API **разрешён** (`visibility: TEAM`, W-002).

**CSRF (W-014a):** mutating методы (кроме `POST /auth/login`) при наличии session/CSRF cookie требуют заголовок `X-CSRF-Token` = cookie `spectre_csrf`. Если `Origin`/`Referer` присутствует — должен входить в `WEB_ORIGIN`. Отсутствие обоих заголовков допускается для non-browser tooling (e2e). Ошибка: `403 CSRF_REJECTED`. При `NODE_ENV=production` пустой `WEB_ORIGIN` → процесс не стартует.

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
| `docs/12` §5.1 способ входа | **CONFIRMED W-011** | Scaffold: email+password+organizationId (без email verify) | Продуктовый способ совпадает; verify email — **OPEN**; MFA/SSO не в MVP (**W-013** / **O-008**) |
| `docs/12` §5.2 алгоритм login | PROPOSED детали | Шаги 1–7 есть; §8 audit event — нет | Audit OUT OF SCOPE |
| `docs/12` §5.3 `GET /auth/me` | PROPOSED иллюстрация `organizations[]` + `emailVerified` | Фактически: одна `organization` (из Session) без `emailVerified` | **OPEN** форма DTO до утверждения полного `docs/12` |
| `docs/12` §5.4 актёр из сессии | принцип | Cookie→Session→membership; клиентский org игнорируется | Соответствует |
| `docs/12` §6.1 cookie | PROPOSED | HttpOnly, SameSite=Lax, Secure в production, Path=/ | Соответствует scaffold |
| `docs/12` §6.2 TTL 7d + idle 24h | PROPOSED | Только абсолютные 7d; idle timeout нет | Idle — OPEN / не реализован |
| `docs/12` §6.4 logout | PROPOSED | Revoke + clear cookie, идемпотентно | Соответствует (без audit event) |
| `docs/12` §6.5 logout-all | PROPOSED | Нет | OUT OF SCOPE |
| `docs/12` §7 CSRF | **W-014** + **W-014a** | Origin allowlist + double-submit; SameSite=Lax доп. слой | Соответствует scaffold S4a |
| `docs/21` same-origin API | PROPOSED detail | Next rewrite `/api/v1` → Nest | Соответствует локальному scaffold |
| `docs/21` / **D-023** FSD | CONFIRMED | Слои app/widgets/features/entities/shared + Steiger/ESLint | Соответствует scaffold login |
| `docs/21` / **D-024** quality bar | CONFIRMED | SCSS Modules, `shared/ui`, RHF+Zod, Query, Vitest/Storybook/Chromatic/Playwright | F5j: org members directory; CI e2e gate нет; system-map CSS Modules |
| `docs/11` префикс `/api/v1`, коды ошибок | — | `/api/v1`, `UNAUTHENTICATED` / `NOT_FOUND` / `VALIDATION_ERROR` | Согласовано |
| `docs/11` карта `clients`/`matters` | PROPOSED GET/POST (+ GET by id) | Есть также PATCH; DELETE нет | PATCH — scaffold extension; DELETE OUT OF SCOPE |
| `docs/06` `created_by` на Client/Matter | PROPOSED | Поля в Prisma нет | OPEN / отложено |
| `docs/07` ACL / Workspace для содержимого | PROPOSED | Любой active membership org видит/меняет Client/Matter своей org | Scaffold org-isolation; **не** закрывает матрицу §6 |
| `docs/11` API-002 механизм auth | частично | Cookie + **W-011** + CSRF **W-014a** | Invitations / MFA — ещё нужны |

## 6. Инфраструктура локальной разработки

`docker-compose.yml` (только local):

- Postgres: образ `pgvector/pgvector:pg16`, user/password/db `spectre`, порт `5432`.
- Redis: `redis:7-alpine`, порт `6379`.

`.env.example`: `DATABASE_URL` (migrator), `DATABASE_URL_RUNTIME` (`spectre_app`), `REDIS_URL`, `PORT`, `API_ORIGIN`, `WEB_ORIGIN` (CSRF), optional `BOOTSTRAP_*` (dev-only W-012). Файл `.env` не коммитится. Пароли compose/runtime/bootstrap — не для shared/production. Opaque DB sessions (без отдельного signing secret).

## 7. Тесты (что покрыто)

| Место | Что проверяет |
|---|---|
| `packages/access` | Client/Matter org-isolation + WorkspaceAccess content/manage unit tests |
| `packages/ai-gateway` | Synthetic OK; блок несинтетики; статусы AIJob; нет `fetch` |
| `apps/api` e2e | health, provider; 401 без cookie; CSRF Origin/header reject; Client/Matter/Workspace CRU+list; TEAM create; members + matter links; чужой id → 404; чужой clientId/matterId → 422; generate/block/validation |
| `apps/api` bootstrap unit | guards + idempotent Org/Owner create; refuse foreign owner on same org |
| `apps/api` queue unit | имя `ai-jobs`, разбор Redis URL |
| `@spectre/db` | `prisma validate` + RLS harness (`src/rls.tenant.test.ts`) под runtime role |

E2e требуют поднятый Postgres (`docker compose`) и применённые миграции (`pnpm --filter @spectre/db migrate:deploy`).

## 7.1. CI (GitHub Actions)

Workflow: `.github/workflows/ci.yml`.

| Триггер | Поведение |
|---|---|
| `pull_request` (любой) | job `test`: pnpm install → `migrate:deploy` → `pnpm test` |
| `push` в `main` | то же |

Сервис: `pgvector/pgvector:pg16` (`spectre` migrator). Env также задаёт `DATABASE_URL_RUNTIME` для `spectre_app` (роль создаётся миграцией S1). Live Redis в CI **не** поднимается. Lint / typecheck / build как отдельные gates **ещё не** подключены.

## 8. Явно не реализовано (ожидаемо по спецификациям, отсутствует в коде)

Не считать сделанным, пока нет кода и тестов:

- MFA/SSO (**O-008** / **W-013** — не в MVP), self-registration (**W-012** запрещает public self-reg), email verify, recovery, logout-all, session list.
- Email delivery provider для invitations; audit events; rate limit каркас.
- Полный `docs/12` (audit events, password policy product confirmation, idle timeout).
- Hard delete Client/Matter/Workspace; `created_by`; полный W-020 (сверх tenant RLS); ACL матрица `docs/07`; admin grant; org role change.
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

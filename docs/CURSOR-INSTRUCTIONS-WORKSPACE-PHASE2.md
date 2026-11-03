# Cursor Instructions — Workspace Phase 2

**Назначение:** инструкция для Cursor по анализу, планированию и последующей реализации Workspace Phase 2 в репозитории `spectreAI`.  
**Спецификация:** `docs/workspace-phase2/`.  
**Режим:** сначала audit + implementation plan; не начинать массовые изменения до представления плана пользователю.

## 1. Обязательное чтение

Перед началом:

1. `AGENTS.md`
2. `docs/decisions-log.md`
3. `docs/DOCUMENTATION-GOVERNANCE.md`
4. `docs/26-codebase-current-state.md`
5. `docs/workspace-phase2/README.md`
6. Все документы `docs/workspace-phase2/`
7. По релевантности: `docs/06-data-model.md`, `07-access-control-matrix.md`, `08-data-lifecycle-and-deletion.md`, `09-threat-model.md`, `11-api-conventions.md`, `12-authentication-and-sessions.md`, `22-testing-and-quality-strategy.md`, `25-logging-monitoring-and-audit.md`, `19-conversation-and-workspace-context.md`.
8. `.cursor/rules/01-security.mdc`, `.cursor/rules/02-architecture.mdc`, `.cursor/rules/07-code-documentation.mdc`.
9. README соответствующих `apps/*` и `packages/*`.

Не использовать `docs/archive/` как источник требований. `docs/workspace-model-spec.md` — ранее предложенный входной документ; сверять его с новым addendum. В части согласованных W-решений приоритет у `docs/workspace-phase2/DECISIONS-ADDENDUM.md`, если нет конфликта с ранее подтверждёнными D-решениями.

## 2. Первое действие — audit, без изменений кода

Провести проверку фактической ветки/состояния репозитория. Snapshot может быть устаревшим.

Проверить:

- `packages/db/prisma/schema.prisma`, Prisma config и все migrations;
- `packages/db` scripts и DB client creation;
- `apps/api` auth/session/ActorContext/guards/interceptors;
- `packages/access` текущие Client/Matter policies и repositories;
- API error envelope и validation conventions;
- `docker-compose.yml`, `.env.example`, CI workflow и DB runtime credentials;
- Prisma version и transaction API;
- PostgreSQL version и доступность extensions;
- все tenant-owned таблицы и таблицы с derived/search/AI data;
- фактические поля `Matter.workspaceId` и наличие данных, которые используют его;
- все прямые Prisma queries вне repository/access layer;
- все фоновые jobs/workers и способы доступа к DB;
- текущие CORS, cookie, CSRF и Next rewrite settings.

Выдать отчёт:
1. Что уже реализовано (AS-IS).
2. Что отсутствует.
3. Конфликты/неясности.
4. Предлагаемые миграции.
5. RLS inventory.
6. Список API и модулей.
7. План тестов.
8. Риски и порядок rollout.
9. Команды, которые реально запускались, и их результат.

Не заявлять, что код/миграции/тесты существуют, пока это не проверено.

## 3. Запреты и инварианты

Нельзя:

- менять стек D-008;
- менять D-006/D-007/D-013/D-016/D-019/D-020 и другие подтверждённые D-решения без явного согласования;
- предоставлять Org Admin постоянный read-only доступ;
- разрешать self-approval admin grant;
- продлевать grant;
- превышать TTL 60 минут;
- разрешать export в MVP (O-009 открыт; документировать можно, реализовывать нельзя);
- добавлять гостевых пользователей или публичную регистрацию;
- менять D-011 AIJob statuses;
- отправлять реальные юридические документы в OpenAI/другой внешний AI до закрытия O-002; использовать только SyntheticAIProvider и синтетические данные;
- удалять `Matter.workspaceId` до проверки данных и backfill plan;
- выполнять destructive migration без rollback/restore plan;
- использовать runtime DB user с SUPERUSER/BYPASSRLS/table ownership;
- реализовывать tenant security только на frontend или только в NestJS без RLS;
- отключать RLS в production для обхода ошибки;
- доверять organizationId/userId/role/workspaceId из клиентского запроса как доказательству полномочий;
- логировать документы, сообщения, prompts/responses, cookies, passwords, tokens, secrets или invite/grant raw tokens.

Если обнаружен конфликт с D-решением, остановить только затронутую часть, описать варианты и запросить решение.

## 4. Архитектурные требования к реализации

### 4.1 Workspace domain

Реализовать отдельные модели Workspace, WorkspaceMember, WorkspaceMatter. Workspace поддерживает PERSONAL и TEAM. Matter связь M:N; Client — optional 0..1 в MVP.

Все Workspace-owned resources получают корректный organization/workspace scope. Существующие Client/Matter endpoints должны продолжить работать и пройти RLS regression tests.

### 4.2 Authorization

Создать единый серверный authorization layer (например, policy/service в `packages/access`, с NestJS adapters), чтобы не дублировать проверки по контроллерам.

Проверять отдельно:
- active session;
- active OrganizationMembership;
- Workspace access;
- Workspace role;
- Chat visibility;
- resource ownership/scope;
- действие;
- admin grant, если применимо.

Проверки выполняются на каждом read/write, включая list, count, search, pagination, download, AI context, job status/result и background worker.

Org Admin управляет организационными сущностями, но не читает Workspace content без active approved grant.

### 4.3 PostgreSQL RLS

RLS включить в MVP на всех tenant-owned tables из inventory.

Требуется:
- отдельные migration/owner и runtime DB credentials;
- runtime role не owner, не superuser, no BYPASSRLS;
- `ENABLE ROW LEVEL SECURITY` + `FORCE ROW LEVEL SECURITY` где применимо;
- transaction-local actor context через `set_config(..., true)` / `SET LOCAL`;
- fail-closed policies;
- tests под реальной runtime role;
- cross-tenant tests для SELECT/INSERT/UPDATE/DELETE/joins/search/vector results;
- tests на pool connection reuse и context leakage;
- отдельный безопасный auth bootstrap/session resolver, который не требует отключать RLS глобально;
- worker actor revalidation;
- no generic bypass helper.

Не считать RLS реализованным, если policies защищают только `workspaces`, но не documents/chats/messages/jobs/chunks/audit и другие tenant tables. Подготовить RLS inventory с policy coverage.

До выбора конкретного SQL helper или `SECURITY DEFINER` функции изучить официальную документацию PostgreSQL и текущий Prisma transaction API через Context7. Любая `SECURITY DEFINER` функция должна быть узкой, иметь fixed search_path, schema-qualified names, ограниченный owner и EXECUTE grants.

### 4.4 Matter legacy field

Текущий scaffold может иметь `Matter.workspaceId` nullable UUID без FK.

Так как выбрана M:N:
1. Проверить реальные данные.
2. Создать `WorkspaceMatter`.
3. Backfill все валидные связи.
4. Сверить количество и целостность.
5. Перевести код на join table.
6. Удалить legacy field только отдельным contract migration после проверки, что он больше нигде не используется.

Никакой потери связей.

### 4.5 Auth / invitations

Сохранить Email + Password + Organization ID. Seed/bootstrap создаёт первую Organization и Owner. Owner приглашает сотрудников. Публичная регистрация, MFA/SSO и гостевые пользователи не входят в MVP.

Invitation token:
- CSPRNG;
- в DB только hash;
- одноразовый;
- expiry configurable до отдельного решения;
- accept flow проверяет email;
- атомарность против повторного использования;
- audit без raw token.

Не позволять invitation назначать Organization Owner без отдельного процесса.

### 4.6 CSRF

До добавления Workspace mutating forms/endpoints реализовать CSRF technical slice.

Сначала проверить Next rewrite, frontend/API origins, cookie attributes, deployment domains и CORS. Выбрать synchronizer token или double-submit (не смешивать механизмы без необходимости), валидировать Origin, покрыть integration/e2e tests. CORS и SameSite не считать единственной защитой.

### 4.7 Chats

Поддержать `PRIVATE` и `WORKSPACE`. Message inherits chat ACL. Не допускать прямого чтения Message без доступа к родительскому Chat. Личные чаты не становятся общими автоматически. Передача ownership не открывает private chats автоматически.

### 4.8 Admin grant

- отдельный AdminGrant entity;
- scope — конкретный Workspace и `content:read`;
- independent approver с `admin_grant:approve`;
- requester != approver;
- TTL ≤60 минут;
- no renewal;
- read-only;
- audit request/approve/reject/revoke/use/expire;
- no access when no approver;
- no break-glass;
- re-check expiry/revoke on every request;
- grant не разрешает export/edit/delete/AI provider transfer.

### 4.9 Lifecycle

Archive — обратимый процесс, не delete.

Workspace deletion:
- requester: Workspace Owner или Org Admin;
- second independent confirmation;
- requester != confirmer;
- exact confirmer permission remains a design item; do not invent a global permission;
- after final confirmation: deny access immediately;
- D-019 purge from primary/derived data ≤24h;
- backups 35 days and deletion journal replay per D-020.

Не вводить grace period после final confirmation, который нарушает D-019.

### 4.10 Export

Только документация/extension points. Не реализовывать endpoints, UI, ZIP jobs или export storage до закрытия O-009.

## 5. Рекомендуемый порядок реализации после утверждения плана

**Slice 0 — foundation / ADR**
- зафиксировать RLS threat model и role topology;
- составить RLS inventory;
- описать transaction context/auth bootstrap;
- подготовить миграционный и rollback plan.

**Slice 1 — DB foundation**
- Workspace / WorkspaceMember / WorkspaceMatter schema;
- composite tenant constraints;
- RLS SQL migrations;
- runtime DB role configuration;
- RLS integration test harness;
- Matter legacy backfill.

**Slice 2 — authorization**
- central Workspace access policy;
- PERSONAL/TEAM checks;
- OWNER/EDITOR/VIEWER;
- Org Admin management separation;
- cross-tenant and cross-workspace tests.

**Slice 3 — Workspace API**
- list/create/get/update;
- member management;
- Client/Matter associations;
- pagination/filtering;
- audit events.

**Slice 4 — CSRF + invitations**
- CSRF before new mutating UI;
- invitation create/resend/revoke/accept;
- email adapter;
- bootstrap first Owner.

**Slice 5 — chat visibility**
- PRIVATE/WORKSPACE;
- message ACL;
- list/search/context restrictions.

**Slice 6 — admin grant**
- request/approve/reject/revoke;
- 60-minute expiry/no renewal;
- read-only checks;
- audit and RLS tests.

**Slice 7 — lifecycle**
- archive/restore;
- deletion request/second confirmation;
- immediate access denial;
- purge job ≤24h;
- deletion journal/backup restore interaction.

**Slice 8 — hardening**
- worker revalidation;
- search/pgvector filters;
- rate limiting;
- e2e/adversarial/load tests;
- AS-IS docs update;
- security review.

Не объединять все slices в один giant PR. Каждый slice должен быть небольшим, тестируемым и иметь rollback notes.

## 6. Обязательные тестовые сценарии

Сверять полный список с `docs/workspace-phase2/05-testing-and-acceptance.md`. Минимум:
- Org A cannot read/write Org B through API or direct SQL runtime role.
- Org member without Workspace membership cannot read TEAM content.
- non-owner cannot read PERSONAL content.
- private chat invisible to other Workspace members.
- viewer cannot mutate.
- admin without grant cannot read.
- admin grant requires independent approver, expires at ≤60m and is not renewable.
- no RLS context => deny.
- transaction/pool context does not leak between tenants.
- worker rechecks actor access after enqueue.
- invite token replay/email mismatch rejected.
- CSRF absent/invalid/cross-origin rejected.
- deletion hides content immediately and purges derived data ≤24h.

## 7. Documentation discipline

Этот пакет — новые документы, не повод дублировать их содержимое в новых параллельных спецификациях.

При реализации кода соблюдать `.cursor/rules/07-code-documentation.mdc`: обновить AS-IS `docs/26-codebase-current-state.md` и README затронутых packages/apps в том же изменении, но не переписывать существующие продуктовые документы без отдельной задачи на их синхронизацию.

W-решения внесены в `docs/decisions-log.md`; точечная синхронизация `06`/`07`/`08`/`12`/governance/roadmap выполнена (`docs/WORKSPACE-PHASE2-INTEGRATION-NOTES.md`). При дальнейших расхождениях с D-* — stop и запрос решения; не расширять W-* молча.

## 8. Финальный отчёт Cursor

По каждому slice сообщить:
- изменённые файлы;
- новые Prisma models/migrations и SQL RLS policies;
- какие DB roles и env vars добавлены;
- API routes/DTO/permissions;
- tests реально запущены и результаты;
- команды миграции;
- security risks/open questions;
- что осталось не реализовано.

Не использовать формулировки «RLS полностью защищает» без полного inventory + tests под runtime role. Не объявлять готовность, если critical RLS/CSRF/tenant isolation tests не проходят.

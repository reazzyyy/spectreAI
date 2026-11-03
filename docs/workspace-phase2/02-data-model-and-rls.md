# Workspace Phase 2 — модель данных и PostgreSQL RLS

**Статус:** продуктовые связи и включение RLS в MVP — `CONFIRMED`; конкретная физическая схема и SQL — `PROPOSED` до сверки с Prisma scaffold и review.  
**Связанные документы:** `01-product-and-access-model.md`, `docs/06-data-model.md`, `docs/03-data-security.md`, `docs/09-threat-model.md`, `docs/22-testing-and-quality-strategy.md`.

## 1. Основные требования

1. Organization — tenant boundary.
2. Каждый tenant-owned объект имеет `organizationId`.
3. Workspace — отдельная сущность.
4. Workspace ↔ Matter — M:N.
5. Workspace ↔ Client — optional, MVP 0..1.
6. Все данные Workspace защищены серверной бизнес-авторизацией и PostgreSQL RLS.
7. RLS обязателен в MVP; нельзя оставлять его как необязательную future enhancement.
8. RLS не заменяет проверки NestJS и не даёт AI/worker права шире прав инициатора.
9. Нельзя использовать DB runtime role с `SUPERUSER`, `BYPASSRLS` или владением tenant tables.
10. Все транзакции с пользовательскими данными должны получать transaction-local actor context.

## 2. Логическая модель

Ниже — целевая логическая модель. Это не готовый Prisma schema: перед миграцией Cursor должен сравнить её с существующими моделями, именами enum, UUID-стратегией, relation conventions и миграциями.

### 2.1 Workspace

Минимальные поля:

| Поле | Тип/смысл |
|---|---|
| `id` | UUID, согласованный с текущим scaffold |
| `organizationId` | обязательный tenant FK |
| `ownerUserId` | обязательный владелец |
| `name` | 1–160 символов |
| `description` | nullable, до 2000 символов |
| `visibility` | `PERSONAL` / `TEAM` |
| `status` | `ACTIVE` / `ARCHIVED` / `PENDING_DELETION` / `DELETING` / `DELETED` |
| `clientId` | nullable, optional 0..1 Client |
| `createdAt`, `updatedAt` | timestamps UTC |
| `archivedAt` | nullable |
| `deletionRequestedAt`, `deletionConfirmedAt` | nullable |
| `deletedAt` | nullable |

Индексы: `(organizationId, status, updatedAt)`, `(organizationId, ownerUserId, status)`, `(organizationId, clientId)`.

### 2.2 WorkspaceMember

- `workspaceId`
- `organizationId`
- `userId`
- `role`: `EDITOR` / `VIEWER`
- `createdAt`, `updatedAt`
- `addedByUserId`
- `revokedAt` либо статус `ACTIVE` / `REVOKED`

Уникальность активного членства: один активный membership на `(workspaceId, userId)`. Нужна защита от повторного добавления и гонок.

Для OWNER использовать `Workspace.ownerUserId` как единственный источник истины. Не хранить OWNER одновременно в `WorkspaceMember`, если нет явной причины; не допускать двух владельцев.

### 2.3 WorkspaceMatter

Join table:

- `organizationId`
- `workspaceId`
- `matterId`
- `createdAt`
- `createdByUserId`

Уникальность `(workspaceId, matterId)`. Добавить индексы по `(organizationId, workspaceId)` и `(organizationId, matterId)`.

Все три записи должны относиться к одной Organization. Предпочтительны составные внешние ключи `(organizationId, workspaceId)` и `(organizationId, matterId)` либо эквивалентные DB constraints, не только проверки в сервисе.

### 2.4 Существующие и будущие дочерние сущности

Любая сущность содержимого должна иметь прямой или надёжно выводимый tenant/workspace scope:

- `Chat` — `organizationId`, `workspaceId`, `createdByUserId`, `visibility` (`PRIVATE` / `WORKSPACE`), status.
- `Message` — `organizationId`, `chatId`, `authorUserId`; workspace scope выводится через Chat, но для RLS/индексов допускается денормализованный `workspaceId` с согласованным constraint.
- `Document` — `organizationId`, `workspaceId`, `uploadedByUserId`, storage key, lifecycle status.
- `Draft` — `organizationId`, `workspaceId`, `createdByUserId`, versions.
- `Research` — `organizationId`, `workspaceId`, `createdByUserId`, status/results/source references.
- `AIJob` — `organizationId`, `workspaceId`, `requestedByUserId`, `resourceType`, `resourceId`, existing D-011 status enum.
- `DocumentChunk`, embeddings, full-text search records — `organizationId`, `workspaceId`, `documentId`, document version and lifecycle metadata.
- `AdminGrant` — `organizationId`, requesting admin, approver, scope, permissions, reason, status, created/approved/revoked/expiry timestamps.
- `AuditEvent` — tenant id and actor/object metadata, without document/message content.

Если сущность ещё отсутствует в scaffold, не создавать её без проверки текущего этапа и плана. Но любая новая tenant-owned table должна быть включена в RLS inventory до миграции.

## 3. Целостность tenant-связей

Одного `organizationId` в каждой таблице недостаточно, если FK допускает связывание записей разных организаций.

Обязательные правила:

- `Workspace.organizationId` совпадает с Organization пользователя-владельца.
- Владелец и участники имеют активное OrganizationMembership в той же Organization.
- `Workspace.clientId`, если задан, указывает на Client той же Organization.
- `WorkspaceMatter.workspaceId` и `matterId` относятся к той же Organization.
- `Chat`, `Document`, `Draft`, `Research`, `AIJob` относятся к той же Organization, что и Workspace.
- `Message` относится к Chat; нельзя передать другой `workspaceId` для обхода.
- Нельзя изменить `organizationId` существующей записи через обычный PATCH.
- Cross-tenant relation должна отклоняться на уровне DB constraints, где это реализуемо, и дополнительно на уровне NestJS.

## 4. PostgreSQL RLS — обязательная архитектура MVP

### 4.1 Два уровня авторизации

**NestJS authorization:**
- проверяет actor/session;
- проверяет active OrganizationMembership;
- проверяет Workspace membership и роль;
- проверяет `PRIVATE`/`WORKSPACE` chat visibility;
- проверяет действие (read/create/update/delete/manage);
- проверяет admin grant;
- повторно проверяет права для поиска, download, export и AI context.

**PostgreSQL RLS:**
- ограничивает tenant rows текущей Organization;
- исключает чтение/изменение чужого tenant;
- для Workspace content дополнительно ограничивает строки доступными Workspace/Chat, насколько это реализовано политиками;
- действует независимо от того, передал ли сервис корректный `where organizationId` в Prisma.

Нельзя считать RLS единственным механизмом business authorization. Нельзя также считать фильтрацию Prisma достаточной заменой RLS.

### 4.2 DB roles

Разделить роли как минимум:

- **migration/owner role** — выполняет миграции, владеет схемой/таблицами; не используется API в runtime.
- **application runtime role** — используется NestJS; не владеет tenant tables, не имеет `BYPASSRLS`, не SUPERUSER.
- **worker runtime role** — отдельный runtime principal либо тот же ограниченный класс роли с отдельными credentials; не имеет глобального обхода RLS.
- **maintenance/backup role** — отдельный операционный principal с минимально необходимыми правами и аудитом; не используется обычными API endpoints.

Не подключать production API к БД под owner/superuser ролью. Проверить поведение CI и локального Docker Compose: тесты должны выполняться под ролью, на которой RLS реально действует.

### 4.3 Transaction-local context

После проверки сессии и определения активного actor context приложение устанавливает внутри той же DB-транзакции:

- `app.current_user_id`
- `app.current_organization_id`

Рекомендуемый PostgreSQL механизм — `set_config(name, value, true)` или `SET LOCAL`, где `true` означает transaction-local значение.

Правила:

1. Context устанавливается в начале транзакции, до запросов к tenant tables.
2. Все обращения к данным операции выполняются внутри той же транзакции/connection.
3. Нельзя выставлять контекст отдельным запросом вне транзакции: connection pool может выдать другое соединение или переиспользовать загрязнённое.
4. При завершении/ошибке транзакции контекст автоматически очищается.
5. Не принимать `current_user_id` или `current_organization_id` напрямую из клиентского body/header/query.
6. Organization ID берётся из проверенной серверной Session/ActorContext; повторно проверяется active membership.
7. Отсутствующий или некорректный context должен приводить к deny-by-default.
8. Не использовать глобальные mutable переменные процесса для actor context.

### 4.4 Пример policy-подхода (иллюстративный, не готовый production SQL)

```sql
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;

CREATE POLICY workspace_tenant_scope
ON workspaces
USING (
  organization_id =
    NULLIF(current_setting('app.current_organization_id', true), '')::uuid
)
WITH CHECK (
  organization_id =
    NULLIF(current_setting('app.current_organization_id', true), '')::uuid
);
```

Этот пример иллюстрирует только tenant boundary. Он **не является полной policy**: дополнительно нужно учесть active membership, Workspace visibility, `WorkspaceMember`, Chat visibility, admin grants, write permissions и особенности auth bootstrap.

Не копировать пример в production без:
- проверки типа ID и отсутствующего setting;
- миграционных тестов;
- проверки role ownership и `FORCE ROW LEVEL SECURITY`;
- тестов с runtime DB role;
- ревью всех tenant-owned tables.

### 4.5 Workspace/content policies

RLS inventory должен включать каждую tenant-owned таблицу. Для content tables политика чтения должна не допускать межорганизационное чтение. Дополнительные workspace-level ограничения следует реализовать согласованно:

- `PERSONAL`: владелец.
- `TEAM`: owner или активный WorkspaceMember.
- `Chat.PRIVATE`: только создатель (плюс отдельный grant только если его scope явно включает этот чат).
- `Chat.WORKSPACE`: owner и активные участники Workspace.
- Org Admin: содержимое только при действующем одобренном admin grant и только read-only.
- Write: только роли и действия, разрешённые бизнес-авторизацией; grant никогда не даёт write.

Чтобы избежать recursive RLS policy loops:
- не строить циклические subqueries между Workspace, WorkspaceMember и Content;
- составить dependency graph policies;
- если понадобятся helper functions `SECURITY DEFINER`, они должны быть минимальными boolean-check helpers, иметь фиксированный `search_path`, не использовать dynamic SQL, принадлежать отдельной NOLOGIN роли с ограниченными правами и проходить security review;
- не создавать универсальную функцию `is_admin()` с неограниченным обходом RLS.

Если команда решит, что на первом подэтапе RLS применяется только к tenant boundary, это должно быть явно обозначено как неполное выполнение W-020 и вынесено на подтверждение владельца продукта. Нельзя молча объявить полный RLS, имея только фильтр по organization_id.

### 4.6 Admin grant и RLS

Admin grant — отдельная запись с ограниченным scope. Для MVP:

- scope минимум содержит `workspaceId`;
- permission — только `content:read`;
- `approvedByUserId` обязателен для статуса `APPROVED`;
- requester и approver различны;
- approver имеет `admin_grant:approve` на момент одобрения;
- TTL ≤ 60 минут (D-013);
- grant не продлевается;
- истёкший/отозванный grant не даёт доступ;
- grant не разрешает export, edit, delete, AI context или download автоматически;
- при каждом чтении проверяется актуальный grant, а не только его наличие в кэше.

Если нужно предоставить скачивание файла, это отдельное разрешение и отдельное решение; не выводить его автоматически из read-only. В MVP админский grant по умолчанию не должен открывать приватные чаты, если они явно не перечислены в scope и не одобрены.

### 4.7 Auth bootstrap и RLS

RLS создаёт отдельную задачу: до аутентификации ещё нет доверенного `app.current_user_id`, но login должен найти User/Membership/Organization, а session resolver — проверить cookie session.

Нельзя решать это глобальным отключением RLS или подключением API под superuser.

Cursor должен спроектировать ограниченный bootstrap path, например:
- отдельные узкие SQL-функции с `SECURITY DEFINER` для проверки password login/session token, возвращающие только минимальные идентификаторы и статусы; либо
- иной механизм с отдельной DB ролью и минимальными правами, подтверждённый security review.

Если применяются `SECURITY DEFINER` functions:
- фиксированный `search_path`;
- schema-qualified table names;
- запрет dynamic SQL;
- ограниченный набор возвращаемых полей;
- `EXECUTE` только нужной runtime роли;
- owner функции — отдельная NOLOGIN роль;
- тесты на enumeration, token leakage и обход tenant isolation.

Не реализовывать bootstrap через временную установку произвольного actor context, который клиент может подменить.

### 4.8 Prisma и transaction boundaries

Prisma должен выполнять установку actor context и запросы к tenant tables в одном interactive transaction или через эквивалентный безопасный transaction wrapper.

Не предполагать, что обычный Prisma middleware гарантирует один connection для `set_config` и последующего запроса.

Перед реализацией проверить используемую версию Prisma и transaction API через Context7/официальную документацию. Учесть:
- nested transactions / transaction client;
- pooler mode;
- transaction timeout;
- все репозитории, которые выполняют запросы вне общего wrapper;
- background workers;
- тестовые fixtures.

### 4.9 Worker и системные операции

AI worker не должен доверять только `organizationId`, `workspaceId` и `userId`, сериализованным в BullMQ payload.

Перед исполнением и перед выдачей результата:
1. загрузить задачу;
2. восстановить actor и tenant context из доверенных DB данных;
3. проверить активность аккаунта и OrganizationMembership;
4. проверить текущий Workspace membership/роль;
5. проверить доступ к каждому source object;
6. проверить D-012 provider/data policy;
7. только после этого обработать или вернуть результат.

Если пользователь потерял доступ после enqueue, job не должен продолжать читать новые данные или выдавать результат этому пользователю. Системная очистка может использовать отдельный maintenance path с узкими правами, не доступный обычному API.

## 5. Переход с текущего scaffold

По snapshot `docs/26-codebase-current-state.md` и приложенному состоянию репозитория:

- Prisma schema содержит Organization, Client, Matter, User, OrganizationMembership, Session.
- `Matter.workspaceId` существует как nullable UUID без FK, так как Workspace ещё отсутствует.
- Workspace/WorkspaceMember, Invitations, AdminGrant и RLS policies пока не реализованы.
- `@spectre/access` содержит только базовую org isolation для Client/Matter.

Перед миграцией Cursor обязан проверить фактическую ветку и файлы, не полагаться только на snapshot.

### 5.1 Matter.workspaceId → WorkspaceMatter

Так как принято M:N:
1. Создать Workspace и WorkspaceMatter.
2. Проверить, есть ли в существующих данных непустые `Matter.workspaceId`.
3. Если значения есть и соответствующие Workspace существуют/могут быть восстановлены, спланировать backfill в WorkspaceMatter.
4. Не удалять `Matter.workspaceId`, пока backfill и проверки целостности не завершены.
5. Удаление старого поля — отдельная миграция после подтверждения, что ни код, ни данные его не используют.
6. Если поле пустое во всех данных, всё равно выполнять expand → deploy code → validate → contract, а не делать необратимое изменение без проверки.

### 5.2 Миграции

- Использовать expand-and-contract.
- Не выполнять destructive migration без backup/rollback plan.
- Все новые tenant tables должны иметь RLS включённым и forced до того, как код начнёт использовать их в production.
- Миграция должна быть проверена под migration role и runtime role.
- Не полагаться на то, что Prisma schema сама описывает/генерирует все RLS policies: добавить versioned SQL migration и тесты.

## 6. RLS inventory

До merge должен существовать список всех таблиц и статусов:

| Класс таблиц | RLS |
|---|---|
| Organization-owned business tables | Обязательно |
| Workspace / WorkspaceMember / WorkspaceMatter | Обязательно |
| Chat / Message | Обязательно |
| Document / Draft / Research | Обязательно |
| AIJob / AI result / usage records с tenant data | Обязательно |
| Chunks / embeddings / search records | Обязательно |
| AdminGrant | Обязательно |
| Audit events | Обязательно, с отдельным write path |
| User/session/auth bootstrap | Отдельно спроектировать и проверить; не отключать защиту глобально |

Любая новая tenant-owned table без RLS policy и integration test блокирует merge.

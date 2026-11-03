# S0 — RLS foundation, inventory, role topology

**Статус:** WORKING note для Slice 0 Фазы 2. Не повышает SQL/helpers до CONFIRMED.  
**Дата:** 2026-11-03  
**План:** `tasks/plan.md` (утверждён). **ADR:** `docs/adr/ADR-0003-postgresql-rls.md` (**W-020**).  
**Канон деталей:** `02-data-model-and-rls.md` (физический SQL там — PROPOSED).

---

## 1. Цель S0

Зафиксировать до миграций S1:

1. inventory таблиц и глубину RLS на первом подэтапе;
2. topology DB roles;
3. transaction-local actor context (GUC) и границы Prisma;
4. auth bootstrap path (без глобального выключения RLS);
5. rollback notes для S1;
6. legacy `Matter.workspaceId` migration outline.

**Не делать в S0:** Prisma schema Workspace*, RLS SQL в migrations, Nest endpoints, смена compose credentials в runtime (это S1).

---

## 2. Threat model (кратко, для RLS)

| Угроза | Как RLS помогает | Что остаётся NestJS |
|---|---|---|
| Пропущенный `where organizationId` / bug в Prisma | Fail-closed tenant rows | Правило действия, роли, grant |
| Worker/job читает чужой tenant | Тот же runtime class + actor GUC | Повторная authz инициатора |
| Connection pool reuse с чужим context | Только `SET LOCAL` / `set_config(..., true)` в tx | Не класть actor в process globals |
| Client подсовывает org/user/workspace id | GUC только из Session | ActorContext из cookie session |
| Owner/superuser в API | Запрет: runtime ≠ owner | Ops: отдельные credentials |

RLS **не** заменяет матрицу Workspace OWNER/EDITOR/VIEWER и admin grant (**W-005**, D-006/D-007).

---

## 3. Role topology (**PROPOSED** имена — уточнить в S1)

| Role (логическое имя) | Назначение | Ограничения |
|---|---|---|
| `spectre_migrator` | Prisma migrate, DDL, владение таблицами | Не используется Nest/CI app tests как primary runtime |
| `spectre_app` | NestJS API runtime | NOLOGIN optional for human; login role OK for app; **no** SUPERUSER, **no** BYPASSRLS, **not** table owner |
| `spectre_worker` | Future BullMQ worker (S8+) | Тот же класс ограничений, отдельный credential |
| (local today) `spectre` | Compose/CI super-ish owner | **S1:** оставить как migrator/owner; app tests переключить на `spectre_app` |

Compose/CI сегодня: один user `spectre` = owner. Это **не** соответствует W-020 для runtime. S1 обязан:

- создать runtime role + grants (`SELECT/INSERT/UPDATE/DELETE` на tenant tables, без ownership);
- `DATABASE_URL` для migrate = migrator;
- `DATABASE_URL_RUNTIME` (или аналог) для API/e2e/RLS harness;
- обновить `.env.example`, `docker-compose` init script или migration bootstrap SQL, CI env.

---

## 4. RLS inventory

### 4.1 Глубина на S1 (явное ограничение)

**S1 поставляет:** tenant-boundary RLS (`organization_id` = GUC) + `FORCE ROW LEVEL SECURITY` на таблицах ниже, где применимо.  
**Workspace-membership / chat / grant policies** — наращиваются в S1 (для новых Workspace*) и в S2–S6 по мере появления content.  

По **02 §4.5**: наличие только org filter = **неполное** выполнение W-020. В AS-IS после S1 писать честно: «tenant RLS + Workspace table policies v1; content chat/doc policies — later». Не объявлять полный W-020.

### 4.2 Таблицы AS-IS (есть в Prisma сейчас)

| Table | Tenant key | S1 RLS | Notes |
|---|---|---|---|
| `organizations` | self `id` | **org-scoped read/update via membership helper or narrow policy** | Bootstrap/login needs careful path (§6) |
| `users` | global email unique | **special** | Login lookup by email; не отдавать чужие users через API; RLS design: deny broad SELECT; SECURITY DEFINER login helper |
| `organization_memberships` | `organization_id` | **tenant** | Actor must see own memberships; org admin manage later |
| `sessions` | `organization_id` + `user_id` | **special** | Session resolve by token hash — DEFINER or constrained role; never list all sessions cross-tenant via app |
| `clients` | `organization_id` | **tenant** | Existing API |
| `matters` | `organization_id` | **tenant** | Legacy `workspace_id` column stays until later contract drop |

### 4.3 Таблицы S1 (добавляются)

| Table | Tenant key | S1 RLS | Notes |
|---|---|---|---|
| `workspaces` | `organization_id` | **tenant + workspace access v1** | PERSONAL: owner; TEAM: owner or active member (policy or Nest-first + tenant RLS) |
| `workspace_members` | `organization_id` | **tenant + parent workspace** | Revoked rows must not grant |
| `workspace_matters` | `organization_id` | **tenant + parent workspace** | Composite FKs to same org |

### 4.4 Будущие (inventory only — не создавать в S1)

`chats`, `messages`, `documents`, `document_chunks`, `drafts`, `research`, `ai_jobs`, `admin_grants`, `audit_events`, `organization_invitations` — в inventory checklist до их первой migration; каждая новая tenant table **обязана** получить RLS в том же PR, что и CREATE TABLE.

---

## 5. Transaction-local actor context

### 5.1 GUC names (PROPOSED, стабилизировать в S1)

- `app.current_user_id` (uuid text)
- `app.current_organization_id` (uuid text)

Опционально позже: `app.current_workspace_id` только если policies требуют и Nest уже проверил доступ — не принимать из клиента.

### 5.2 Правила

1. Устанавливать **только** после Session → active User → active OrganizationMembership.
2. Только внутри **interactive transaction** (или эквивалент одного connection): `select set_config('app.current_organization_id', $1, true)` затем queries на том же tx client.
3. Не middleware «set_config вне tx» — pool reuse.
4. Отсутствие/пустой setting → policy deny (fail-closed).
5. Клиентский body/header `organizationId` / `x-organization-id` **игнорировать** для GUC (как сейчас для ActorContext).

### 5.3 Prisma 7 note

Scaffold: `@prisma/adapter-pg` + `createPrismaClient`. Перед S1 проверить официальный interactive transaction API (Context7 / Prisma docs): nested tx, timeout, что `$transaction(async (tx) => …)` держит один connection для `set_config` + queries. Обертка вида `withActorContext(actor, fn)` в `@spectre/db` или `apps/api` — deliverable **S1/S2**, не S0.

---

## 6. Auth bootstrap under RLS

Login и session resolve **до** полного actor GUC.

**PROPOSED approach for S1 (выбрать один spike-ом):**

**A (preferred to spike):** узкие `SECURITY DEFINER` functions:

- `auth_lookup_login(email)` → минимальные поля для verify (no password hash leakage beyond need);
- `auth_resolve_session(token_hash)` → userId, organizationId, expiry/revoked;

с fixed `search_path`, schema-qualified names, EXECUTE только `spectre_app`, owner = NOLOGIN definer role.

**B:** отдельная DB role с GRANT только на `users`/`sessions`/`organization_memberships` для auth module — сложнее в ops.

**Запрещено:** `SET ROLE` bypass, отключение RLS, API под migrator, client-supplied GUC.

Health check (`GET /health`) остаётся без tenant queries.

---

## 7. Legacy `Matter.workspace_id`

| Step | When | Action |
|---|---|---|
| 1 | S1 | Keep column; add `workspace_matters` |
| 2 | S1 | Backfill: `INSERT INTO workspace_matters … SELECT … WHERE matters.workspace_id IS NOT NULL` (skip orphans / log count) |
| 3 | S2–S3 | App reads/writes only join table for associations |
| 4 | Later PR | Drop column after grep+AS-IS prove unused; separate contract migration |

No data loss; empty DBs (all NULL) → backfill no-op.

---

## 8. S1 migration / rollback outline

### Forward (S1)
1. Create roles + grants (SQL migration or compose init + documented SQL).
2. Prisma migrate: Workspace* models + FKs/indexes.
3. Backfill WorkspaceMatter from legacy.
4. `ENABLE` + `FORCE ROW LEVEL SECURITY` + tenant policies (and workspace v1 if ready).
5. Auth DEFINER helpers if approach A.
6. Point API/CI to runtime URL; migrator URL only for migrate job.
7. RLS harness tests under `spectre_app`.

### Rollback notes
- Prefer expand/contract: disabling FORCE/dropping policies before drop tables if revert needed in dev.
- Do not drop `workspace_*` in production without backup; local: `migrate reset` acceptable.
- Role drops only after app no longer connects as runtime.
- Keep `matters.workspace_id` until step 4 — rollback of Workspace* must not require that column’s data if backfill was one-way (re-backfill from join if needed before drop join).

---

## 9. Test harness expectations (S1 deliverable)

- Real Postgres (CI image already `pgvector/pg16`).
- Connect as **runtime** role.
- Fixtures: Org A/B, users, clients, matters, workspaces.
- Assert: cross-tenant SELECT empty; INSERT wrong org fails; no GUC → deny; sequential tx A then B on pooled connections → no leak.
- Superuser/owner-only green ≠ pass.

---

## 10. Exit criteria S0

- [x] Inventory + depth caveat documented (this file).
- [x] Role topology + GUC + bootstrap options documented.
- [x] Legacy Matter + S1 rollback outline documented.
- [ ] Linked from `docs/workspace-phase2/README.md` and `tasks/todo.md`.
- [ ] Plan marked approved; assumptions frozen.

**Next:** Slice 1 implementation PR after S0 merge.

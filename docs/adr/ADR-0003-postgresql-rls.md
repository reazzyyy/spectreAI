# ADR-0003: PostgreSQL Row-Level Security в MVP

Статус: **CONFIRMED** по журналу (**W-020**). Дата: 2026-11-03.

## Контекст

Изоляция организаций (**H-001**) и Workspace ACL требуют защиты не только в NestJS/`@spectre/access`, но и на уровне БД: ошибки фильтра Prisma, прямые SQL в workers, connection pool reuse и будущие read-paths (search/pgvector) не должны раскрывать чужой tenant. До 2026-11-03 RLS в PostgreSQL оставался OPEN (`docs/07` §13 п.12, `tasks/roadmap.md`).

## Решение

1. **PostgreSQL RLS обязателен в MVP** для всех tenant-owned tables (inventory в `docs/workspace-phase2/02-data-model-and-rls.md`).
2. RLS — **дополнительный** слой; NestJS authorization остаётся обязательным (membership, Workspace role, chat visibility, admin grant, действие).
3. Runtime DB role приложения **не** `SUPERUSER`, **не** `BYPASSRLS`, **не** table owner tenant tables. Миграции — отдельная owner/migration role.
4. Actor context — **transaction-local** (`set_config(..., true)` / `SET LOCAL`); без контекста — deny-by-default.
5. Auth bootstrap (login/session) проектируется узко (ограниченные `SECURITY DEFINER` helpers или эквивалент), **без** глобального отключения RLS.
6. Тесты RLS выполняются под **runtime** role на реальном PostgreSQL; SQLite / superuser-only не засчитываются.

Детали политики, inventory и Matter→WorkspaceMatter migration: `docs/workspace-phase2/02-data-model-and-rls.md`. Критерии: `docs/workspace-phase2/05-testing-and-acceptance.md`.

## Альтернативы

### Только application-level filters (Prisma `where organizationId`)
- Плюсы: быстрее старт, меньше SQL.
- Минусы: один пропущенный filter / worker path / join = cross-tenant leak; нет fail-closed на DB.
- Отклонено: недостаточно для заявленной модели угроз и W-020.

### Отложить RLS «после MVP»
- Плюсы: меньше работы в фазе 2.
- Минусы: переписывание data access и credentials позже; риск дыр в search/jobs.
- Отклонено владельцем продукта (ворота C6 / W-020).

## Последствия

- Нужны отдельные DB credentials, SQL migrations для policies, RLS inventory и harness тестов.
- Prisma interactive transactions / wrapper обязательны для `set_config` + queries на одном connection.
- AS-IS (`docs/26`) не описывает RLS как реализованный, пока нет policies + runtime-role tests.
- Неполное RLS (только `organization_id` без Workspace/content policies) нельзя молча называть полным выполнением W-020.

## Связанные решения

- **W-020**, **H-001**, **D-008** (PostgreSQL), **D-006/D-007/D-013/D-016** (admin content access).
- Канон: `docs/06`, `docs/07`, `docs/09`, `docs/22`; пакет: `docs/workspace-phase2/`.

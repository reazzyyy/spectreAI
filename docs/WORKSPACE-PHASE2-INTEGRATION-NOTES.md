# Заметки по интеграции Workspace Phase 2

**Дата:** 2026-11-03  
**Ветка:** `docs/workspace-phase2-integration`  
**Статус:** документационная интеграция выполнена; код Workspace/RLS/invitations **не** реализован (см. AS-IS `docs/26`).

Исходный пакет лежал во вложенном `docs/docs/` (копия архива). Перенесён в канонические пути:

- `docs/workspace-phase2/*`
- `docs/CURSOR-INSTRUCTIONS-WORKSPACE-PHASE2.md`

## Соответствие чату с воротами

Ворота A / A2 / C из `tasks/roadmap.md` и вопросы A1–A11, B1–B4, C1–C6 закрыты решениями **W-001–W-020** (`DECISIONS-ADDENDUM.md` → `docs/decisions-log.md`).

Ключевое уточнение A5/A7: итоговый доступ Org Admin к содержимому — **только через admin grant**, без постоянного read-only (согласовано с D-006/D-007).

## Что обновлено в каноне

| Файл | Изменение |
|---|---|
| `docs/decisions-log.md` | W-001–W-020 CONFIRMED; уточнения O-008/O-009; новые O-011–O-013 |
| `docs/adr/ADR-0003-postgresql-rls.md` | RLS в MVP (W-020) |
| `docs/06-data-model.md` | Workspace PERSONAL/TEAM, WorkspaceMember, WorkspaceMatter M:N, legacy `Matter.workspaceId` |
| `docs/07-access-control-matrix.md` | закрытие OPEN §13 по W-*; роли Workspace |
| `docs/08-data-lifecycle-and-deletion.md` | Workspace archive/delete dual confirm (W-009/W-010) |
| `docs/12-authentication-and-sessions.md` | W-011–W-014 в статусе |
| `docs/DOCUMENTATION-GOVERNANCE.md` | строка каталога workspace-phase2; приоритет W-* |
| `docs/workspace-model-spec.md` | NON-NORMATIVE относительно W-* |
| `tasks/roadmap.md` | ворота A / A2 закрыты |
| `AGENTS.md` | краткий приоритет W-001–W-020 |

Пакет `docs/workspace-phase2/` остаётся детальной спецификацией (PROPOSED там, где явно помечено: SQL, endpoint names, confirmer matrix proposal).

## Не менялось намеренно (на момент интеграции W-*)

- Код Workspace/RLS по-прежнему отсутствует (AS-IS честен).
- Реализация export / MFA / guest — по W-017/W-013/W-018 не стартует.
- Физический SQL RLS и CSRF mechanism — PROPOSED до audit/реализации.

## Follow-up docs sync (2026-11-03)

После merge в `main` выровнены отстающие формулировки «вход / Gate A2 не CONFIRMED»:

- `docs/12` §5.1 и таблица AUTH-*;
- `docs/26` сверка статусов + формулировка seed/invite;
- `tasks/plan.md` / `todo.md` / шапка `tasks/roadmap.md`;
- `.cursor/rules/02-architecture.mdc` (W-020/RLS);
- индекс `README.md` (`workspace-phase2/`, ADR-0003).

## Конфликты, проверенные при интеграции

| Тема | Итог |
|---|---|
| Matter 0..1 (`workspace-model-spec`) vs M:N (W-003) | Канон = M:N; черновик помечен NON-NORMATIVE |
| A5 «Org Admin read-only» vs A7 grant-only | Канон = W-005 / D-006/D-007 (grant-only) |
| RLS vs только NestJS filters | Канон = оба слоя (W-020); RLS не замена authz |
| Export в phase2 docs vs O-009 | Документировать можно; код export — нет (W-017) |

## Следующий шаг по коду

По `docs/CURSOR-INSTRUCTIONS-WORKSPACE-PHASE2.md`: audit репозитория → план slices → реализация только после утверждения плана. Не объявлять RLS «готовым» без inventory + runtime-role tests.

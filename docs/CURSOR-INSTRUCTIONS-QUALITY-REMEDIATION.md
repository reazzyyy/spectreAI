# Cursor: закрыть оставшиеся решения плана фиксов (D-035…D-042, S0/S5/S7/S8/S10)

**Дата:** 2026-11-26
**Статус:** инструкция владельца; решения ниже **подтверждены владельцем** и должны быть занесены в `docs/decisions-log.md` в этом же срезе.
**Контекст:** S1–S17 уже в `main`. Остаются S0, S5, S7, S8, S10 (см. `tasks/quality-remediation-plan.md`) и восемь открытых решений, которые владелец сейчас закрыл. Ниже — сами решения (для записи в журнал) и задачи по коду/CI.

## 0. Сначала прочитай (обязательно)

1. `AGENTS.md`, `docs/decisions-log.md`, `docs/DOCUMENTATION-GOVERNANCE.md`.
2. `.cursor/skills/using-agent-skills/SKILL.md` и выбери применимые скилы: `incremental-implementation`, `test-driven-development`, `code-review-and-quality`, `security-and-hardening`, `git-workflow-and-versioning`.
3. `tasks/quality-remediation-plan.md` (план S0–S17), `docs/26-codebase-current-state.md` (AS-IS), `docs/adr/ADR-0003-postgresql-rls.md`.
4. `docs/11-api-conventions.md`, `docs/13-file-storage-and-document-processing.md`, `docs/15-ai-jobs-and-background-processing.md` — по мере необходимости для S5/S8/S10.

## 1. Правила работы

- Одна секция = один короткий PR в `main` (`fix/…` или `chore/…`). Коммит — `<type>: <краткое описание>`. Не смешивать refactor с feat. Не оставлять готовую работу на боковой ветке.
- Каждый PR — с тестами (unit/e2e/RLS), включая негативные cross-org/PRIVATE/revoked-membership сценарии. RLS-тесты в CI обязаны исполняться, не `skip`.
- Изменение публичного поведения → в том же PR обновить `docs/26-codebase-current-state.md` и README затронутого `apps/*`/`packages/*` (правило `.cursor/rules/07-code-documentation.mdc`).
- Не менять статусы других D-/W-/O- (кроме закрытия O-012 ниже). Не выполнять destructive-миграции без плана и подтверждения. Merge — по явному подтверждению владельца.
- Для каждого PR верни отчёт по шаблону из конца этого документа.

## 2. Решения для записи в `docs/decisions-log.md` (раздел «Подтверждено»)

Занеси записи с датой **2026-11-26**, добавив «Затрагивает: …». Тексты:

- **D-035 — классификация данных vs режим выполнения (уточняет D-012).** До закрытия O-002 данные классов D3/D4 обрабатываются **только in-process** через `SyntheticAIProvider`; ни один путь не выходит в сеть. Классификация — серверная (`classifyUntrustedText`), клиентский `dataClass` игнорируется. Внешний провайдер блокируется **до** сетевого вызова (`AI_TRANSFER_BLOCKED`). Затрагивает: `docs/14`, `packages/ai-gateway`, `apps/api/src/ai`, `apps/api/src/chat`, `docs/26`.

- **D-036 — вход без owner-креды (реализует ADR-0003 п.5 / W-020).** Web-процесс не использует migrator/owner-подключение на запросном пути. Вход (поиск сессии по хэшу токена, чтение user/membership/organization) — через узкую auth-роль и `SECURITY DEFINER`-функции с фиксированным `search_path`; `users`/`sessions` под RLS. Migrator остаётся только для bootstrap/outbox/воркера/миграций. Затрагивает: `apps/api/src/auth`, `apps/api/src/db/prisma.service.ts`, `packages/db` (миграция роли и функций), RLS-тесты, `docs/26`.

- **D-037 — Org Admin не получает контент через member-management.** Запрещён self-add и добавление другого **Org Admin** с контент-ролью (EDITOR/VIEWER). Целевой пользователь должен быть **активным членом той же организации**. Право Org Admin добавлять обычных участников (W-008) сохраняется. Затрагивает: `packages/access/src/workspace.ts`, `apps/api/src/workspaces/*`, e2e, `docs/26`.

- **D-038 — жизненный цикл удаления документа (реализует D-019/D-020).** Hard delete — только для статуса `uploading` и только в одной транзакции (откат загрузки). Для готового документа — переход в статус удаления: данные недоступны сразу (ACL/store, без `storageKey`), физическая очистка версий/извлечений — отдельной задачей не позднее 24 ч + запись в журнал удалений. Затрагивает: `packages/access/src/document.ts`, `apps/api/src/documents/*`, `apps/api/src/db/actor-scoped-stores.ts`, миграция статусов/журнала, воркер purge, `docs/26`.

- **D-039 — закрывает O-012 (второй подтверждающий удаления).** Удаление Workspace (и подтверждаемое удаление готового документа) требует **второго независимого** подтверждающего; если его нет — операция **не выполняется** (fail-closed). Break-glass в MVP нет. В журнале отметить O-012 как закрытый (стиль, как O-011/O-013). Затрагивает: `docs/decisions-log.md` (O-012), `docs/workspace-phase2/`, реализация Phase 10.

- **D-040 — rate limit fail-closed в production.** В production — стартап-ассерт `REDIS_URL`; при ошибке Redis в рантайме защищённые бакеты отклоняют (`503`/`429` с кодом), сбой считается инцидентом (метрика/алерт). В non-production (local/CI) — fail-open. Затрагивает: `apps/api/src/http/rate-limit.ts`, `apps/api/src/main.ts`, `docs/26`.

- **D-041 — CI-гейты.** Добавить jobs `typecheck`, `db validate`, `build`, `lint`; сделать их required (branch protection — действие владельца). Порядок включения: сначала `typecheck` + `db validate` + `test`, затем `build` (после апгрейда Next до версии с детерминированным build), затем `lint` (после чистки Stylelint). Next апгрейд — отдельным изолированным PR (одна зависимость за раз, с обзором changelog). Затрагивает: `.github/workflows/ci.yml`, `apps/web/package.json`, `docs/22`, `docs/26`.

- **D-042 — явное production-окружение.** Production задаётся явным флагом (`APP_ENV=production`), а не `NODE_ENV === "production"`. `devToken` эмитится только при явном `INVITE_DEV_TOKEN_ENABLED=1` (или dev-окружении). `secure`-cookie — по явному флагу. Staging/preview не получает dev-токены. Затрагивает: `apps/api/src/invitations/invite-config.ts`, `apps/api/src/auth/session-cookie.ts`, `apps/api/src/main.ts`, `.env.example`, `docs/26`.

## 3. Задачи

### S0 — CI-гейты (chore)

**Файлы:** `.github/workflows/ci.yml`, `apps/web/package.json`, `package.json`.

1. Добавить job `typecheck`: web — `tsc --noEmit -p tsconfig.json` (добавить скрипт `typecheck` в `apps/web/package.json`); api — `tsc -p tsconfig.json --noEmit` (это уже `build`).
2. Добавить job `db-validate`: `pnpm --filter @spectre/db validate`.
3. Добавить job `build`: `pnpm -r build` — **после** того, как Next соберётся детерминированно с первого раза (см. п.6).
4. Добавить job `lint`: `pnpm --filter @spectre/web lint:all` — **после** чистки Stylelint.
5. `permissions: contents: read`; закрепить actions по SHA; образы Postgres/Redis — по конкретному digest.
6. **Next:** отдельным PR воспроизвести «первый `next build` в чистом процессе падает на security-warning 16.4.3, повторный проходит»; понять причину (кэш/first-run advisory) и поднять Next до версии, собирающейся с первого раза; зафиксировать версию в lockfile. Только после этого включать `build`-гейт.
7. **Stylelint:** отдельным PR довести `pnpm --filter @spectre/web lint:styles` до 0 problems (221 → 0), затем включать `lint`-гейт.

**Приёмка:** PR, ломающий `pnpm -r build` или `typecheck`, падает в CI. `main` не бывает красным из-за временно невыполнимого гейта. **Действие владельца:** включить required checks (branch protection) — Cursor это не делает.

### S5 — вход без owner-креды (fix, security)

**Файлы:** `apps/api/src/db/prisma.service.ts`, `apps/api/src/auth/*` (SessionService, ActorContext), `packages/db` (новая миграция: роль `spectre_auth` + `SECURITY DEFINER`-функции с `SET search_path`), `packages/db/src/*.test.ts`.

**Что сделать:**
1. Выделить узкую auth-роль `spectre_auth` (NOSUPERUSER, NOBYPASSRLS, минимальные права только на нужные функции/таблицы).
2. `users`/`sessions` — под RLS; операция «найти сессию по SHA-256 токена» + «прочитать user/membership/org» — через `SECURITY DEFINER`-функции с фиксированным `search_path` (анти-SQLi).
3. Web-процесс на запросном пути использует только runtime/auth-роль; migrator — только bootstrap/outbox/воркер/миграции.
4. Стартап-проверка роли fail-closed (как в `runtime-role.ts`).

**Тесты:** «`spectre_app`/`spectre_auth` не читает чужие `users`/`sessions`»; cross-org 0 строк; негативный «web не подключается owner-ролью»; RLS не skip в CI.

**DoD:** ни один аутентифицированный запрос не идёт через owner-креды; bootstrap/outbox/воркер работают; `pnpm --filter @spectre/db test` + `pnpm --filter @spectre/api test` зелёные.

### S7 — Org Admin self-add (fix, access)

**Файлы:** `packages/access/src/workspace.ts` (`upsertMember`, `canManageMembers`), `apps/api/src/workspaces/parse-workspace.ts`, `apps/api/src/workspaces/prisma-workspace-store.ts`, e2e в `apps/api/test`.

**Что сделать:**
1. Запретить `actor`'у добавлять самого себя с контент-ролью.
2. Запретить добавлять другого Org Admin (у которого `orgRole` admin/owner) с контент-ролью.
3. Проверять, что `targetUserId` — активный член той же организации (иначе 422).
4. Обычных участников Org Admin может добавлять EDITOR/VIEWER (W-008) — оставить.

**Тесты:** self-add → отказ; peer-admin add → отказ; несуществующий/чужой/неактивный `userId` → 422; обычное добавление EDITOR владельцем/Org Admin — работает.

### S8 — жизненный цикл удаления документа (fix + feat)

**Файлы:** `packages/access/src/document.ts`, `apps/api/src/documents/prisma-document-store.ts`, `apps/api/src/db/actor-scoped-stores.ts`, новая миграция (статус удаления + таблица журнала удалений), воркер purge (или job ≤24 ч).

**Что сделать:**
1. Hard delete — только `uploading`, в одной транзакции.
2. `ready`/`processing*` → переход в «удаляется»; чтение/download/поиск сразу недоступны (фильтр по статусу в ACL/store); `storageKey` не отдаётся.
3. Физическая очистка `documents`/`document_versions`/`document_extractions` — отдельной задачей ≤24 ч; запись в журнал удалений (для D-020 повторного применения при restore).
4. Подтверждение удаления готового документа — по D-039 (второй независимый confirmer; отсутствует → отказ). Полный confirmer-флоу — в Phase 10, но guard «нет confirmer → не удалять» должен быть заложен уже здесь (не додумывать модель прав самостоятельно).

**Тесты:** `uploading` удаляется атомарно; `ready` → 404 сразу, `storageKey` недоступен; purge-задача удаляет производные ≤24 ч; журнал удалений пишется; отмена/повтор — идемпотентно.

### S10 — rate limit fail-closed (fix)

**Файлы:** `apps/api/src/http/rate-limit.ts`, `apps/api/src/main.ts`, `.env.example`, `docs/26`.

**Что сделать:**
1. `NODE_ENV=production` (или `APP_ENV=production` по D-042) без `REDIS_URL` → процесс не стартует.
2. Ошибка Redis в рантайме в production → защищённый бакет отклоняет (`503`/`429`, код `RATE_LIMIT_UNAVAILABLE`), не fail-open; сбой — как инцидент (лог/метрика).
3. Non-production — fail-open (тесты/CI без Redis).

**Тесты:** production без `REDIS_URL` → startup fail; сбой Redis в production → 503/429 (не пропуск); local без Redis → лимитер не блокирует запуск.

### D-042 — явное production-окружение (chore/config)

**Файлы:** `apps/api/src/invitations/invite-config.ts`, `apps/api/src/auth/session-cookie.ts`, `apps/api/src/main.ts`, `.env.example`, `docs/26`.

**Что сделать:** ввести `APP_ENV` (или `IS_PRODUCTION`); `devToken` — только при явном `INVITE_DEV_TOKEN_ENABLED=1`; `secure`-cookie — по явному флагу production. Обновить `.env.example`.

## 4. Запреты и границы

- Не менять смысл `Document.status=ready` (D-032/D-033/D-034); новые статусы удаления — дополнение, а не переписывание `ready`.
- Не подключать внешний AI/OCR/embeddings/vector (O-002/O-004/Gate B/FILE-009 открыты).
- Не менять статусы D-/W-/O- кроме явного закрытия O-012 (D-039).
- Не реализовывать полный двухфакторный confirmer-флоу в этом срезе (это Phase 10); заложить только guard по D-039.

## 5. Шаблон отчёта по каждому PR

1. Что сломано/меняется и каким тестом воспроизведено (до/после).
2. Изменённые файлы и зачем; отдельно новая миграция/конфигурация.
3. Реально запущенные команды и результат; skipped/незапущенные — перечислить явно.
4. Failure cases (Redis outage, отзыв доступа, отсутствие confirmer, чужой org).
5. Оставшийся долг; не объявлять production-ready до O-001/O-002/O-003/O-005.
6. Commit/PR по `AGENTS.md`; merge — по подтверждению владельца.

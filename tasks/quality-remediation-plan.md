# ТЗ: доработки качества SpectreAI (для Cursor)

**Статус:** живой план доработок. S1–S16 влиты в `main` (#58–#67, #70–#72). S0 и срезы с меткой DECIDE не начаты. Этот файл не меняет статусы решений в `docs/decisions-log.md`.  
**Источник:** аудит качества 2026-11-19 (прогон `build`/`lint`/`test` на чистой БД + ревью backend/data/frontend/process).  
**Опора:** `docs/decisions-log.md` (D-008–D-034, W-001–W-020), AS-IS `docs/26-codebase-current-state.md`, `.cursor/rules/07-code-documentation.mdc`.  
**Правило работы:** каждая секция ниже = отдельный короткий PR в `main` (`.cursor/rules/06-git-commits.mdc`). Не смешивать refactor и feat. Коммит — `<type>: <кратко>`.

---

## Как читать метки

- **[GATE]** — можно начинать сразу; требования подтверждены (W-020, D-021, D-026, D-030, docs/11) либо это прямой фикс дефекта без смены контрактов.
- **[DECIDE]** — сначала запросить решение владельца (в секции «Открытые решения»), затем кодировать. Не переводить OPEN/PROPOSED в CONFIRMED самостоятельно.

После каждого PR — отчёт (шаблон в конце).

---

## S0. Включить недостающие CI-гейты — [GATE]

**Проблема.** `main` сейчас не собирается (`next build` падает на typecheck), линт красный, но CI этого не видит: `.github/workflows/ci.yml` прогоняет только `migrate` → `pnpm test` → Playwright.

**Файлы:** `.github/workflows/ci.yml`, `apps/web/package.json`, возможно `package.json`.

**Что сделать:**
1. Добавить job `lint` (web `lint:all`; для api/packages — ESLint пока отсутствует, добавить позже или временно только web).
2. Добавить job `typecheck`: api — `tsc --noEmit` (скрипт `build` уже это делает), web — `tsc --noEmit -p tsconfig.json` (добавить скрипт `typecheck`).
3. Добавить job `build`: `pnpm -r build` (web `next build`, api `tsc --noEmit`).
4. Сделать `lint`/`typecheck`/`build` required checks (заметка для владельца: включить branch protection).
5. Закрепить `permissions: contents: read`; образы `pgvector/pgvector:pg16` и `redis:7` → конкретные digest/версии; actions — по SHA.
6. Опционально job `security`: `pnpm audit --prod` (не блокирующий до триажа).

**Приёмка.** PR, ломающий `pnpm -r build` или `pnpm --filter @spectre/web lint:all`, падает в CI; `pnpm test` остаётся зелёным.

---

## S1. Починить сборку web (type error) — [GATE]

**Проблема.** `apps/web/src/shared/ui/page-head/page-head.tsx:6` — `PageHeadProps extends HTMLAttributes<HTMLDivElement>` с `title: ReactNode`, конфликт с `title: string` → `TS2430`, `next build` не проходит.

**Файл:** `apps/web/src/shared/ui/page-head/page-head.tsx`.

**Фикс (предлагаемый):** `export interface PageHeadProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> { ... }`.

**Приёмка.** `pnpm --filter @spectre/web build` зелёный; `pnpm -r build` зелёный; `pnpm --filter @spectre/web test` не регрессирует.

---

## S2. Починить lint web — [GATE]

**Проблема.** `apps/web/src/widgets/workspace-detail/ui/chat-workspace.tsx:102,144` — `react-hooks/set-state-in-effect` (2 error) + 1 warning (`react-hooks/incompatible-library` на `watch()` в `create-workspace-form.tsx:75`).

**Файлы:** `chat-workspace.tsx`, `create-workspace-form.tsx`.

**Направление:** убрать синхронный `setState` в `useEffect` — сброс `selectedId/composerSeed/pendingGenerationId/shareOpen` перенести на источник события (напр. колбэк инвалидации/`onSuccess`), либо вынести в `onClick`/обработчик, который меняет `listEpoch`; терминальный сброс `pendingGenerationId` — через `select`/`onSuccess` запроса, а не эффект. `watch()` заменить на `useWatch`/`watch` только в подписке без рендер-триггера (или оставить warning осознанно, зафиксировав причину).

**Приёмка.** `pnpm --filter @spectre/web lint` зелёный; далее отдельными PR — Stylelint (221 problems, 2 error) и Steiger (15 warnings, `features/logout` без ссылок): сначала errors, затем чистка мёртвых слайсов.

---

## S3. RLS: закрыть `users` / `sessions` / `organizations` — [GATE]

**Проблема (Critical).** Миграция `packages/db/prisma/migrations/20261103220000_workspace_rls_foundation/migration.sql:109,115` выдаёт `spectre_app` полный DML на все таблицы, а RLS на `users`/`sessions`/`organizations` не включён → runtime-роль может прочитать все `password_hash` и `token_hash` всех организаций (захват сессии). Нарушает W-020/ADR-0003.

**Файлы:** новая миграция (forward-only), `packages/db/src/rls.tenant.test.ts` (или новый `rls.auth.test.ts`), `docs/26`, `packages/db/README.md`.

**Что сделать:**
1. `ALTER TABLE users/sessions/organizations ENABLE ROW LEVEL SECURITY; FORCE ROW LEVEL SECURITY;`
2. Политики deny-by-default + узкие: `users` — self / через membership своей org (по GUC); `sessions` — только lookup собственного токена (вынести проверку за `SECURITY DEFINER` или ограничить по `user_id`); `organizations` — чтение только своей org.
3. `REVOKE` избыточные `UPDATE/DELETE` у `spectre_app` на этих таблицах (оставить минимальный набор).
4. Негативный тест: runtime-роль не видит `users`/`sessions` другой организации; cross-org `SELECT` возвращает 0 строк.
5. Учесть auth-путь: если auth временно остаётся на migrator — явно задокументировать и связать с S5.

**Приёмка.** RLS-тесты исполняются (не skip), cross-org на users/sessions — пусто; `pnpm --filter @spectre/db test` и `pnpm --filter @spectre/api test` зелёные.

---

## S4. `audit_events`: закрыть мутацию и NULL-org — [GATE]

**Проблема.** `20261110180000_phase4_hardening/migration.sql:93,128-137`: `ALTER DEFAULT PRIVILEGES` уже дал `spectre_app` UPDATE/DELETE, а политика `FOR ALL` допускает `organization_id IS NULL` (строки, видимые всем тенантам). Anti-forensics.

**Файлы:** новая миграция, `packages/db/src/rls.*.test.ts`, `docs/26`.

**Что сделать:**
1. `REVOKE UPDATE, DELETE ON audit_events FROM spectre_app` (и закрыть `ALTER DEFAULT PRIVILEGES` для будущих таблиц, где не нужно).
2. `organization_id` обязателен для tenant-событий; для анонимных (до login) — отдельный системный путь/поле, не видимое через tenant-политику.
3. Тест: `UPDATE`/`DELETE` на `audit_events` под runtime падает; NULL-org строки не читаются чужой организацией.

**Приёмка.** `has_table_privilege` проверен тестом; audit append-only для runtime.

---

## S5. Убрать migrator-креды из web-процесса — [DECIDE]

**Проблема.** `apps/api/src/db/prisma.service.ts:27-28` + `auth/session.service.ts:32-34`: аутентифицированные запросы читают сессию/пользователя/членство через migrator (owner/superuser). RLS защищает только вызовы, добровольно идущие через runtime.

**Варианты (запросить у владельца):** (а) узкая auth-роль с правами только на `users/sessions/memberships` + `SECURITY DEFINER`-функции с фиксированным `search_path`; (б) полный переход runtime-роли + RLS на auth-таблицах (S3). Не удалять migrator-клиент слепо (bootstrap/outbox/worker им пользуются).

**Файлы:** `prisma.service.ts`, `session.service.ts`, auth-модуль, новая роль/миграция, `docs/26`.

**Приёмка.** Web-процесс не подключается owner-ролью ни на одном запросе; negative-тест «runtime не читает чужую сессию»; bootstrap остаётся на отдельном dev-контуре.

---

## S6. Миграция backfill под `FORCE RLS` — [GATE]

**Проблема.** `20261117120000_phase6a_document_version/migration.sql:38-92`: backfill `document_versions`/`current_version_id` под migrate-ролью при включённом RLS на `documents` → на непустой production-БД `SELECT` вернёт 0 строк (молчаливый пропуск) или `SET NOT NULL` упадёт.

**Файлы:** новая миграция/runbook-запись, тест на «документы существуют до backfill».

**Что сделать:** выполнять backfill с `SET LOCAL row_security = off` от привилегированной роли (или отдельной migration-ролью), зафиксировать это в runbook; проверить на БД с существующими строками.

**Приёмка.** Миграция с нуля и на непустой БД даёт одинаковый результат (каждый документ имеет `current_version_id`).

---

## S7. ACL: self-add Org Admin в TEAM workspace — [DECIDE]

**Проблема.** `packages/access/src/workspace.ts:178-193,283-319` + `apps/api/src/workspaces/parse-workspace.ts:151-163`: `canManageMembers` пускает Org Admin, `upsertMember` не запрещает добавить себя/другого админа EDITOR'ом → Org Admin получает контент без grant (обход W-008/D-013). Плюс не проверяется, что целевой `userId` — активный член той же организации.

**Запросить:** это баг (запретить) или разрешённая политика? Если баг — запретить self-add и peer-admin add без grant, проверять membership цели. Если политика — задокументировать как осознанное исключение.

**Файлы:** `workspace.ts`, `prisma-workspace-store.ts`, `parse-workspace.ts`, e2e в `apps/api/test`.

**Приёмка.** Negative-тест: Org Admin добавляет себя EDITOR'ом → отказ; `userId` несуществующего/чужого пользователя → 422.

---

## S8. Hard delete документов — [DECIDE]

**Проблема.** `packages/access/src/document.ts:138-147` + `apps/api/src/documents/prisma-document-store.ts:126-138`: жёсткое удаление `documents`+`document_versions`+`document_extractions` по одной проверке org, вне одной транзакции; обход D-019/D-020/O-012.

**Запросить:** разрешить hard delete только для статуса `uploading` в одной транзакции (rollback загрузки), остальное — `deletion_pending → deleted` + журнал удалений (D-020). Согласовать confirmer (O-012).

**Файлы:** `document.ts`, `prisma-document-store.ts`, `actor-scoped-stores.ts:176-203` (единая транзакция), тесты.

**Приёмка.** Delete `uploading` — в одной транзакции; для `ready` — только переход статуса, данные недоступны сразу (D-019), физическое удаление — отдельным job ≤24ч.

---

## S9. Extract-воркер: watchdog по `running` — [GATE]

**Проблема.** `apps/api/src/worker/extract-job.processor.ts:74-84`: claim только из `queued`; при падении после claim job навсегда `running`, документ — `processing`.

**Файлы:** `extract-job.processor.ts`, `ai-jobs.service.ts`, e2e (`extract-retry.e2e-spec.ts`).

**Что сделать:** lease по `startedAt` + reclaim/`timed_out` для зависших `running` (ср. chat `chat-job.processor.ts`), либо периодический watchdog. Соблюдать D-011/D-030.

**Приёмка.** Тест: job переходит в `running` и «зависает» → по истечении lease становится `timed_out`/возвращается в очередь; нет вечного `processing`.

---

## S10. Rate limit fail-closed — [DECIDE/GATE]

**Проблема.** `apps/api/src/http/rate-limit.ts:34-38,95-101`: без `REDIS_URL` лимитер молча выключен; ошибка Redis → fail-open навсегда.

**Запросить (если поведение в production важно):** разрешить startup-ассерт `REDIS_URL` в production (как для `WEB_ORIGIN` в `csrf.ts:64-76`) и считать fail-open инцидентом (метрика/алерт).

**Файлы:** `rate-limit.ts`, `main.ts`, `docs/26` (поправить «sliding window» → фактически fixed window `INCR+EXPIRE`, либо переписать лимитер).

**Приёмка.** `NODE_ENV=production` без `REDIS_URL` → процесс не стартует; тест на это.

---

## S11. Воркер: повторная проверка org-membership — [GATE]

**Проблема.** `chat-job.processor.ts:384-422` проверяет только Workspace-роль, не `organization_memberships.status='active'`; `extract-job.processor.ts:94-105` читает документ под migrator без re-check. Отзыв участия на уровне org не останавливает публикацию/запись.

**Файлы:** оба processor'а, `packages/access`, e2e.

**Что сделать:** перед финальным коммитом проверять активное membership актёра (и workspace-роль загрузившего для extract); при отзыве — не публиковать.

**Приёмка.** Тест: отозвано org-membership → отложенный chat-job не публикует ответ; extract не пишет извлечение для отозванного пользователя.

---

## S12. Маппинг ошибок 409/429/413 — [GATE]

**Проблема.** `apps/api/src/http/api-exception.filter.ts:40-72` отдаёт `{code:"HTTP_ERROR"}` для `RATE_LIMITED`/`Conflict`/`PayloadTooLarge`, хотя `docs/26:177,212` обещает `429 RATE_LIMITED` / `409`.

**Файлы:** `api-exception.filter.ts`, e2e, `docs/11`.

**Что сделать:** сохранять серверный `code` для 400/409/413/429; добавить e2e на `429` (login/upload) и `409` (idempotency conflict).

**Приёмка.** Клиент получает стабильный `code`; `docs/11` и `docs/26` совпадают с фактом.

---

## S13. Валидация path-id как UUID → 404 — [GATE]

**Проблема.** Path-параметры не валидируются как UUID (только body). `/documents/abc` → ошибка PG → `500` вместо `404`. (documents/chat/workspaces/clients/matters controllers.)

**Файлы:** соответствующие controller'ы, e2e.

**Что сделать:** `ParseUUIDPipe`/граничная проверка; невалидный id → `404 NOT_FOUND` (не 500).

**Приёмка.** e2e: `/documents/abc` → 404; чужой валидный UUID → 404 (уже есть); 5xx без внутренних деталей.

---

## S14. Frontend: курсоры/лимиты и честные счётчики — [GATE]

**Проблема.** `apps/web/src/entities/workspace/api/workspace-api.ts:15` и `workspace-queries.ts:10` не передают cursor/limit; UI обрезается на 50, но пишет «N из N» / «Все результаты (N)». (`workspace-list.tsx:110`, `command-palette.tsx:308`; аналогично чаты/сообщения.)

**Файлы:** workspace/message/conversation api+queries, соответствующие widgets/features.

**Что сделать:** прокинуть `limit`/`cursor`, добавить «Показать ещё»; до постраничной загрузки — убрать/честно пометить «Все результаты (N)».

**Приёмка.** Список >50 проектов/сообщений полностью доступен через пагинацию; счётчики не врут.

---

## S15. Frontend: desktop-gate, TTL, тексты, enum→RU — [GATE]

**Проблемы:**
- `app-shell.module.scss:392` — при ≤1279px скрываются сайдбар и main → продукт недоступен при зуме (WCAG 1.4.10); `matchMedia("(max-width: 1000px)")` в `app-shell.tsx:50` рассинхронизирован.
- `organization-invites.tsx:121,136,332,465` — «приглашение на 7 дней» против 72ч в `invite-config.ts:2`.
- `system-map.tsx:232-259` и `home-overview.tsx:157` — тексты противоречат коду.
- Сырой enum (`ACTIVE`/`ARCHIVED`) в списках (`workspace-list.tsx:282`, `client-detail.tsx:58`, `document-list.tsx:110` и др.).

**Файлы:** указанные выше + `workspace-members-panel.tsx` (копия `canManage` vs API W-008).

**Приёмка.** На ≤1279px контент доступен (сворачивание/скролл, не скрытие); TTL из конфига; `/system` помечен как снимок/актуализирован; enum маппится в RU.

---

## S16. Герметичность тестов и RLS hard-fail — [GATE]

**Проблема.** `apps/api/test/chat-outcome.e2e-spec.ts:334` и `extract-retry.e2e-spec.ts:353` считают outbox без фильтра по org → ложные падения на «грязной» БД. RLS-тесты (`rls.tenant.test.ts`, `rls.chat.test.ts`) делают `skip()` при любой ошибке setup.

**Файлы:** оба e2e (scope ассертов по `organizationId` фикстуры), RLS-тесты (`CI=true` → fail вместо skip), `.github/workflows/ci.yml`.

**Что сделать:** ассерты по своей org; cleanup фикстур; в CI RLS-тесты должны исполняться (fail на skip), добавить assertion «выполнено ≥ N RLS-тестов».

**Приёмка.** `pnpm test` зелёный и на чистой, и на повторно-прогнанной БД; RLS не скипается в CI.

---

## S17. Документация и трекеры: синхронизация — [GATE]

**Файлы:** `docs/26-codebase-current-state.md`, `tasks/roadmap.md`, `tasks/plan.md`, `tasks/todo.md`, `README.md`, `docs/22`, `docs/09-threat-model.md`.

**Что сделано в этом срезе:**
1. Два документа 2026-11-17 закоммичены как AUDIT / PROPOSED и ссылаются из `tasks/roadmap.md`. Это снимок архива, не AS-IS.
2. `tasks/todo.md` закрывает 5A/5B, DocumentVersion v1 и P0-01…P0-06 со ссылками на PR. `tasks/plan.md` описывает оставшиеся решения, а не уже влитый чат.
3. `docs/26` описывает Redis в CI, запись аудита на входе и выходе и регистрацию OutboxPublisher в AppModule. Дата снимка включает D-032–D-034.
4. `docs/09-threat-model.md` уже ссылается на `docs/00-project-overview.md`.
5. То же про Redis в CI стоит в `README.md` и `docs/22`.

**Приёмка.** `grep` по заведомо ложным фразам пуст; ссылки существуют; `tasks/plan.md` не описывает уже сделанное как «next».

---

## Открытые решения (запросить владельца ДО кодирования)

| ID | Вопрос | Блокирует |
|---|---|---|
| D-012-семантика | Реальный текст (D3) идёт через in-process Synthetic (P0-06, #57). Согласовать формулировку «только синтетика» vs «in-process, без сети»; зафиксировать D-035. | формулировка D-035 |
| O-012 | Кто подтверждающий удаления Workspace/документа, если requester — единственный Owner/Admin. | S8 |
| S5-подход | Auth на migrator: SECURITY DEFINER / отдельная auth-роль / полный runtime+RLS. | S5 |
| S7-политика | Org Admin self-add EDITOR — баг или разрешено. | S7 |
| S10-поведение | Fail-open rate limit допустим в production? | S10 |
| env | Какие окружения считать production для `devToken`/`secure`-cookie (staging сейчас получает dev-токены). | S15-соседний |
| CI | Включить branch protection с required checks (без этого S0 не enforced). | S0 (заметка владельцу) |

---

## Шаблон отчёта по каждому PR

1. Что сломано и каким тестом воспроизведено (до/после).
2. Изменённые файлы и зачем; отдельно новая миграция/конфигурация.
3. Выбранная семантика (для атомарности/retry/RLS — без изменения D-011/W-020).
4. Реально запущенные команды и результат; skipped/незапущенные перечислить явно.
5. Failure cases (Redis outage, crash, cancel, ACL revoke).
6. Оставшийся долг; не объявлять production-ready до O-002/O-003/O-005/O-012.
7. Commit/PR по `AGENTS.md`; merge — по подтверждению владельца.

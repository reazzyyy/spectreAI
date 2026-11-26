# 35. Phase 6A — Полнотекстовый поиск по своим документам (ТЗ)

**Статус:** PROPOSED implementation specification (срез `docs/33`). Не меняет D-018, D-032–D-034, FILE-009, Gate B, O-002, O-006. Не закрывает ни один OPEN/PROPOSED.
**Дата:** 2026-11-26
**Назначение:** дать Cursor реализацию полнотекстового поиска PostgreSQL (FTS) по уже извлечённому тексту пользовательских документов, **без** векторного слоя, embeddings и chunking-решения.

> Это срез Phase 6 по `docs/33-phase6-rag-implementation-specification.md`. Соблюдает: кандидаты фильтруются в SQL до выдачи (**D-032**); `ready` не означает searchable (**D-033**); индекс/цитата привязаны к `DocumentVersion`, и `searchEligible` не включает сам extract (**D-034**). FTS — **D-018**; pgvector остаётся на Phase 6B после Gate B.

## 0. Сначала прочитай (обязательно)

1. `AGENTS.md`, `docs/decisions-log.md`, `docs/DOCUMENTATION-GOVERNANCE.md`.
2. Скилы: `spec-driven-development` → `incremental-implementation` → `test-driven-development` → `code-review-and-quality` → `git-workflow-and-versioning`.
3. Канон области: `docs/17-rag-and-knowledge-retrieval.md`, `docs/33-phase6-rag-implementation-specification.md`; PROPOSED-контракты `docs/2026-11-17-document-readiness-lifecycle-contract.md`, `docs/2026-11-17-acl-retrieval-scope-contract.md` (читать, не менять статусы).
4. AS-IS: `docs/26-codebase-current-state.md`; модель: `packages/db/prisma/schema.prisma` (модели `Document`, `DocumentVersion`, `DocumentExtraction`).

## 1. Цель и границы

**Делаем:** пользователь ищет по тексту документов, которые вправе читать, внутри Workspace; получает ранжированные фрагменты с цитатой, привязанной к `DocumentVersion`.

**НЕ делаем в 6A:**
- vector / pgvector / HNSW / embeddings — ждут **Gate B** (embedding-модель открыта);
- chunking (FILE-009 OPEN) — индексируем существующий плоский `textContent` как есть;
- reranker, RRF, hybrid, query rewriting — позже, по метрикам;
- LegalAct* / правовой корпус / внешние источники — **O-006** открыт;
- OCR — **O-004**; скан без текста уже `failed` (D-031) и в поиск не попадает;
- внешний AI / передача текста — **O-002**; здесь текст никуда не уходит, только локальный FTS.

## 2. Инварианты (закрепить тестами)

1. **ACL в SQL до выдачи (D-032):** запрос возвращает кандидатов только после применения предикатов организации, workspace и права чтения контента в **том же** SQL. Постфильтр в приложении не заменяет это.
2. **`ready` ≠ searchable (D-033):** документ в `ready` без `searchEligible=true` в выдаче **не появляется**.
3. **`searchEligible` не включает extract (D-034):** успешное извлечение само флаг не ставит; флаг ставит отдельный явный шаг «publish to search» (job), привязанный к версии.
4. **Цитата привязана к версии (D-034):** в ответе всегда `documentVersionId`; фрагмент (`ts_headline`) строится из `textContent` той же версии, по которой флаг был поставлен.
5. **Курсорная пагинация (D-026)** по стабильному ключу; offset для поиска не использовать.
6. **Идемпотентность publish (D-027):** повторная публикация той же версии не создаёт второй записи/не дублирует работу.
7. **RLS (W-020):** новый индекс/таблица под `FORCE ROW LEVEL SECURITY` с deny-by-default; runtime-роль не видит чужое.

## 3. Модель данных (миграция, forward-only)

### 3.1 Флаг уже есть
`DocumentVersion.searchEligible` (`@default(false)`) уже в схеме — использовать его как источник «версия допущена к поиску». Смысл не менять.

### 3.2 FTS-индекс на тексте извлечения
Индексируем `DocumentExtraction.textContent` (уже версионирован через `documentVersionId`). Добавить **generated** tsvector-колонку (raw SQL в миграции; Prisma-схему не засорять):

```sql
ALTER TABLE document_extractions
  ADD COLUMN search_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('russian', coalesce(text_content, ''))) STORED;

CREATE INDEX document_extractions_search_tsv_idx
  ON document_extractions USING GIN (search_tsv);
```

Ограничения/примечания:
- русский конфиг встроен (`russian`), отдельный `CREATE EXTENSION` не нужен; `pg_trgm` для 6A **не** требуется.
- title-буст в 6A не делаем (title живёт на `Document`, не на version); при желании title учитывается отдельным предикатом `ILIKE` без изменения ранжирования — отметить как «позже».
- backfill не нужен: колонка generated, заполнится сама по существующим строкам; проверить на непустой БД (см. тесты).

### 3.3 Не менять уникальность `document_extractions`
Сейчас `documentId` и `documentVersionId` — оба `@unique` (одна extraction на документ). Для 6A оставляем как есть: поиск использует extraction текущей версии (`document.currentVersionId = extraction.documentVersionId`). Переход к нескольким extraction-версиям — отдельный срез, не сюда.

## 4. Публикация в поиск (publish)

**Правило:** после успешного extract документ становится `ready`, но **не** searchable. Отдельный идемпотентный шаг публикует версию.

- Новый тип `AIJob`: `document.search_publish` (статусы строго **D-011**). Создаётся после успешного extract для той же `documentVersionId`.
- Воркер (в существующем dispatcher `worker:ai`) выполняет: проверить ACL/org, что версия — текущая и текст непустой; атомарно `searchEligible = true` на версии; при повторной доставке — no-op.
- Extract **не** ставит `searchEligible`. Падение publish не ломает extract: документ остаётся `ready`, но в поиск не попадает (честно).
- При новой версии документа: publish выполняется для новой версии; старую версию в поиске не трогаем (поиск фильтрует по `currentVersionId`), при желании `searchEligible=false` на старой — отдельным явным шагом (не обязателен для 6A).

## 5. Поиск (API)

**Endpoint (основной, workspace-scoped):**

```
GET /api/v1/workspaces/:workspaceId/search?q=<query>&cursor=<opaque>&limit=<n>
```

- Auth: сессия + **content-read** в workspace (`WorkspaceAccess`); иначе `404` (не раскрывать существование).
- `q` — обязательный, 1…512 символов, без `\0`; пустой → `422`.
- `limit` — по умолчанию 20, max 50.

**SQL-контур (один запрос, ACL внутри):**

```sql
SELECT d.id AS document_id,
       dv.id AS document_version_id,
       d.title,
       ts_headline('russian', de.text_content, websearch_to_tsquery('russian', $q),
                   'MaxWords=40, MinWords=15, MaxFragments=3, FragmentDelimiter= …') AS snippet,
       ts_rank_cd(de.search_tsv, websearch_to_tsquery('russian', $q)) AS rank
FROM document_extractions de
JOIN document_versions dv ON dv.id = de.document_version_id
JOIN documents d ON d.id = de.document_id
WHERE de.search_tsv @@ websearch_to_tsquery('russian', $q)
  AND dv.search_eligible = true
  AND dv.id = d.current_version_id
  AND d.organization_id = current_setting('app.org_id', true)::uuid   -- tenant GUC
  AND d.workspace_id = $workspaceId
  AND d.status NOT IN ('deletion_pending','deleted','archived')
  AND <workspace content ACL: PERSONAL owner / TEAM active member / grant>   -- RLS/EXISTS, не в приложении
ORDER BY rank DESC, d.created_at DESC, d.id DESC
```

- Пагинация — курсором по `(rank, createdAt, id)` или `(createdAt, id)` (D-026); не offset.
- **Ответ DTO:** `{ items: [{ documentId, documentVersionId, title, snippet, rank, createdAt }], nextCursor }`. Никакого `storageKey` и полного текста.

**Точный поиск реквизитов (6A.2, отдельный срез):** нормализованный exact-match по номерам статей/пунктов — требует структурного парсера и касается FILE-009; в 6A **не** входит. В 6A отдаём только полнотекст.

## 6. Безопасность

- RLS-политики на `document_extractions`/новый индекс — deny-by-default, наследуют `EXISTS documents` с org-GUC и workspace-условием (как существующие documents-политики). Не давать `search_tsv` отдельного SELECT без родителя.
- Повторная проверка доступа **перед** возвратом (D-032): если членство отозвано между SQL и ответом — не отдавать (или перепроверить в той же транзакции).
- `ts_headline` рендерит только извлечённый текст своей org; чужие фрагменты невозможны из-за SQL-предикатов.
- Не логировать `q`, полный текст, сниппеты сверх лимита.

## 7. Русский FTS: качество и ограничения

- Использовать конфиг `russian` + `websearch_to_tsquery` (пользователь вводит фразу, не tsquery-синтаксис).
- **Обязательный golden-тест** (небольшой набор ~15–30 запросов на синтетических текстах): проверять словоформы/склонения юридических терминов («расторжение договора» находит «расторгнуть договор», «договором»), регистронезависимость, стоп-слова.
- Зафиксировать в AS-IS как известное ограничение: синонимы/юридические эквиваленты («расторжение» vs «отказ от исполнения») 6A **не** различает — это терминологический слой позже (P1, из аудитов). Не выдавать это за решённое.

## 8. Тесты (обязательные)

**Миграция/RLS (`packages/db`):**
- `search_tsv` заполняется на существующих строках; GIN-индекс есть; backfill на непустой БД не падает.
- runtime-роль: чужая org → 0 строк; без GUC → 0 строк; `search_tsv` не читается в обход родителя.

**Поиск (`apps/api` e2e):**
- счастливый путь: документ в `ready` + `searchEligible=true` → находится; сниппет и `documentVersionId` корректны.
- `ready`, но `searchEligible=false` → **не** находится (D-033).
- extract успешный сам флаг не ставит; publish ставит; повторный publish — idempotent (D-034/D-027).
- чужая org / чужой workspace / отозванное членство → 0 результатов, `404` на чужой workspace.
- `deletion_pending`/`deleted`/`archived` → не находятся.
- курсорная пагинация: >limit результатов, полный обход без дублей и пропусков (D-026).
- русская морфология (golden-набор) — см. §7.
- `q` >512 / пустой / `\0` → `422`; 5xx не раскрывает деталей.

## 9. Приёмка (DoD)

- [ ] `pnpm -r build`, `pnpm --filter @spectre/web lint:all`, `pnpm --filter @spectre/db validate`, `pnpm test` зелёные (чистая БД, RLS не skip).
- [ ] `docs/26` и README затронутых пакетов обновлены в том же PR.
- [ ] Ни один из FILE-009 / Gate B / O-002 / O-006 / DEC-05 не закрыт и не изменён.
- [ ] Негативные cross-org/workspace/revoked тесты добавлены и проходят.

## 10. Срезы (PR)

1. **6A-0 `feat`:** миграция `search_tsv` + GIN + RLS на нём; RLS/backfill-тесты.
2. **6A-1 `feat`:** тип `document.search_publish` + воркер + идемпотентный флаг `searchEligible`; e2e «extract не ставит флаг / publish ставит / повтор no-op».
3. **6A-2 `feat`:** search service + endpoint `GET /workspaces/:id/search` с ACL-in-SQL и курсором; e2e из §8.
4. **6A-3 `feat`:** web UI — поле поиска в `/documents` и в проекте; FSD; RHF/Zod; пустое/ошибка/пустая выдача.
5. **6A-4 `test`:** русский golden-набор + документация ограничений в AS-IS.

## 11. Шаблон отчёта по каждому PR

1. Что реализовано и каким тестом покрыто (до/после).
2. Изменённые файлы; отдельно миграция.
3. Реально запущенные команды и результат; skipped/незапущенные — явно.
4. Failure cases: отзыв доступа, чужая org, повторный publish, пустой q.
5. Оставшийся долг (6A.2 exact lookup, title-boost, синонимы, вектор после Gate B).
6. Commit/PR по `AGENTS.md`; merge — по подтверждению владельца.

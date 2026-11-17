# Алгоритмический аудит — этап 1: консолидация документации и AS-IS

**Дата проверки:** 2026-11-16  
**Основание:** архив `spectreAI-main` от 2026-11-16.  
**Статус:** AUDIT / FINDINGS; не является архитектурным решением и не меняет статусы D/O/H.  
**Область:** документация `docs/17`, `docs/18`, `docs/26–30`, `docs/32–34`, `docs/ai/retrieval/`, `tasks/roadmap.md`, `tasks/phase5-6-gaps.md`; выборочная проверка Prisma, extraction worker и файлов ingestion.

## 1. Резюме

В проекте уже описано больше алгоритмических механизмов, чем следует из первичного поверхностного чтения. Не нужно создавать параллельные спецификации для source authority, conflict handling, court-decision relationships, incremental synchronization, citation validation или temporal retrieval: эти темы уже присутствуют в `docs/18` и/или `docs/ai/retrieval/`.

Главная проблема этапа 1 — не отсутствие концепций, а **несколько пересекающихся документов с разной глубиной детализации, неодинаковой степенью нормативности и несколькими незафиксированными алгоритмическими контрактами**. До реализации Phase 6 необходимо устранить неоднозначность по ACL-порядку, готовности документа к поиску, оценке доказательств и статусам извлечения.

В исходниках архива не обнаружены реализации DocumentVersion, structure parser, chunking, FTS retrieval, embeddings, pgvector/HNSW, RRF, reranker, Context Builder для retrieval или executable retrieval evaluation runner. Это согласуется с `docs/26` и `tasks/phase5-6-gaps.md`: сейчас есть scaffold Phase 4–5, а Phase 6 ещё не реализована.

## 2. Иерархия документов — как читать без дублирования

| Область | Основной документ | Дополнение / детализация | Граница |
|---|---|---|---|
| Продуктовая архитектура RAG | `docs/17-rag-and-knowledge-retrieval.md` | `docs/33-phase6-rag-implementation-specification.md` | `17` задаёт общие требования; `33` конкретизирует Phase 6 для пользовательских документов |
| Внешние правовые источники | `docs/18-legal-research-and-external-sources.md` | `docs/ai/retrieval/` | `18` задаёт продуктовый контур Legal Research; пакет `ai/retrieval` развивает логический Retrieval Engine и temporal retrieval, оставаясь PROPOSED |
| Текущая реализация | `docs/26-codebase-current-state.md` | исходный код + `tasks/phase5-6-gaps.md` | `26` — AS-IS на 2026-11-13; трекер уточняет статусы срезов |
| Переносимость / целостность | `docs/27`, `docs/28`, `docs/29`, `docs/30` | `docs/33` | `27–30` описывают перенос и validation; `33` ссылается на них, не должен создавать второй manifest/portability механизм |
| Оценка retrieval | `docs/33` для user-docs; `docs/18` для Legal Research | `docs/ai/retrieval/07` для legal retrieval | Нужен общий формат evaluation runner/report, но разные экспертные datasets и критерии по доменам |
| Исторический аудит Phase 5–6 | `docs/34` | `tasks/phase5-6-gaps.md`, `docs/26` | `docs/34` — снимок 2026-11-10; его нельзя читать как актуальный AS-IS после закрытия 5A/5B |

Приоритет, уже установленный `AGENTS.md`: `decisions-log.md` → канонический документ области → `docs/33` для Phase 6 → `docs/ai/retrieval/` как PROPOSED дополнение. Этот аудит не меняет эту иерархию.

## 3. Подтверждённые факты AS-IS

### 3.1. Что есть

- Prisma-модели `Document`, `DocumentExtraction`, `AiJob`.
- Upload, private local object storage scaffold, extraction worker.
- Извлечение TXT, DOCX и цифрового PDF; сканы без текстового слоя завершаются ошибкой по D-031.
- `DocumentExtraction` хранит полный extracted text в PostgreSQL по D-025.
- Chat 5A–5B: Conversation/Message/Generation, ACL/RLS, Outbox/worker, ContextSnapshot и MessageSource для `conversation_only`; thin chat UI.
- PostgreSQL/pgvector image присутствует в Docker Compose, но это не доказывает включение extension или наличие vector schema.

### 3.2. Чего нет в коде на момент архива

- `DocumentVersion` и versioned extraction;
- structure parser / StructureNode;
- chunks и chunk lineage;
- FTS/GIN search implementation;
- embedding provider/profile и сохранённые embeddings;
- pgvector migration / vector column / HNSW index;
- index generation/build worker;
- retrieval SQL, RRF, reranker, retrieval Context Builder;
- citation/claim validation для найденных документов;
- executable retrieval evaluation runner и golden dataset.

Наличие спецификации, Docker image или будущей модели данных не считать реализацией.

## 4. Найденные конфликты и неоднозначности

### A-01. Порядок ACL-фильтрации в общем RAG-документе

**Приоритет:** P0, устранить до реализации retrieval.

`docs/17`, раздел 10.3, описывает порядок: получить lexical/vector результаты → объединить → удалить дубликаты → применить ограничения по доступу/версии → RRF. В разделе 11 сказано применять фильтры до передачи контента в прикладной контекст, но формулировка «по возможности» оставляет неоднозначность. `docs/33`, разделы 10.1, 10.3 и 11, требует, чтобы tenant/workspace/document/version/index-generation predicates применялись внутри SQL каждого канала до того, как кандидаты покидают БД; reranker получает только разрешённые кандидаты.

**Риск:** недоступные пользователю фрагменты могут попасть в application memory, fusion diagnostics или reranker до постфильтра. Это расширяет поверхность утечки и конфликтует с принципом least privilege.

**Нормативная трактовка для Phase 6:** использовать более строгий контракт `docs/33`: scope формируется сервером; ACL/RLS/версия применяются в каждом retrieval query до выдачи кандидатов; после retrieval и перед Context Builder выполняется повторная проверка актуальности прав. `docs/17` следует синхронизировать с этим порядком. Не считать постфильтрацию достаточной.

### A-02. `Document.status=ready` не означает готовность к поиску

**Приоритет:** P0, решить до появления поискового UI/API.

Текущий `extract-worker.ts` переводит `Document.status` в `ready` сразу после успешного extraction. При этом `docs/17` RAG-012 определяет доступность для поиска как успешную индексацию и проверку целостности; `docs/33` раздел 9 отдельно предупреждает не приравнивать extraction-ready к searchable-ready.

**Риск:** UI/API/будущие workflow могут считать документ индексированным, хотя у него ещё нет структуры, chunks и FTS entries.

**Требование:** развести состояния extraction и indexing/searchability (например, отдельный index status / `searchableAt` либо другой согласованный контракт). Не менять существующий enum/публичный API молча: сначала проверить `docs/13`, `docs/17`, модель статусов и UX; физическое решение оформить в Phase 6 specification/ADR после согласования.

### A-03. Две логические модели правового корпуса

**Приоритет:** P1, обязательно до Prisma schema / ingestion code нормативного корпуса.

`docs/18` описывает `LegalSource`, `LegalDocument`, `LegalDocumentVersion`, `LegalProvision`, `CourtDecisionMetadata`, `LegalEvidence`. Пакет `docs/ai/retrieval/03` описывает `LegalAct`, `LegalActVersion/SourceSnapshot`, `LegalProvision`, `LegalProvisionTextVersion`, `SearchChunk`, `Embedding`, а temporal model дополняет `AmendmentOperation` и `ApplicabilityRule`.

Это не обязательно противоречащие модели: `18` — более широкий продуктовый контур источников/исследования, пакет — более детальная логическая модель нормативного текста и временной применимости. Но crosswalk не определён.

**Риск:** две команды/итерации могут создать разные сущности для одного акта/версии/положения и дублировать provenance, citations, versions и source registry.

**Требование:** до реализации LegalAct* подготовить crosswalk: одна логическая сущность → каноническое имя → ответственность → связь с source snapshot / legal version / provision / evidence / citation. До закрытия O-006 и юридической проверки не создавать Prisma schema на основании ни одного PROPOSED пакета.

### A-04. Временная модель описана на нескольких уровнях, но нет единого временного контракта

**Приоритет:** P0 для Legal Research; не блокирует user-document Phase 6A.

`docs/18` задаёт `asOfDate`, исторические редакции, даты действия отдельных положений и статусы документа. `docs/ai/retrieval/03` и `06` отдельно различают valid time, recorded/transaction time, publication time, ingestion time, период охватываемых правоотношений, контрольную дату фактов и переходные правила.

Пакет `ai/retrieval` полезно уточняет модель, но пока не является подтверждённым полным покрытием российского законодательства. Три temporal кейса не доказывают универсальность.

**Требование:** создать единый glossary/contract временных координат и crosswalk полей до импорта нормативного корпуса. Для каждой даты определить: смысл, источник, точность, timezone/calendar semantics, допустимость unknown и уровень сущности (акт, provision, событие/отношение, source observation). Не превращать `ApplicabilityRule` в универсальный Rule Engine.

### A-05. Evaluation распределён по нескольким документам

**Приоритет:** P1, до масштабирования тестов и выбора моделей.

Оценка качества описана в `docs/17`, `docs/18`, `docs/30`, `docs/33` и `docs/ai/retrieval/07`. `docs/30` — validation переносимости/целостности и regression после импорта; `docs/33` — retrieval user-docs; `docs/18` — Legal Research; `07` — temporal/legal retrieval.

**Риск:** метрики похожи, но datasets, unit of evaluation, labels, thresholds и отчёты могут разойтись. Одно число Recall@10 не покажет временную корректность, citation support или юридическую применимость.

**Требование:** не сливать все наборы в один benchmark. Ввести общий формат `EvaluationRun / DatasetVersion / QueryCase / ExpectedEvidence / RetrievedEvidence / Metrics / Report`, но отдельные domain suites: user documents, legal provisions, court decisions, temporal cases, ACL/security. `docs/30` оставить для portability/integrity + retrieval regression на source/target, а не превращать в единственный алгоритмический evaluation spec.

### A-06. Смешение relevance ranking и legal authority/applicability ranking

**Приоритет:** P1, до настройки legal ranking.

`docs/18` перечисляет в одном разделе ранжирования lexical/semantic relevance, юрисдикцию, дату применимости, статус источника, уровень судебной инстанции и процессуальный контекст. Пакет `docs/ai/retrieval/05` корректно ограничивает reranker задачей релевантности: он не устанавливает юридическую силу, применимость или авторитетность.

**Риск:** один непрозрачный score может смешать «похоже на запрос» с «юридически применимо/авторитетно». Reranker способен поднять семантически похожее, но юридически нерелевантное решение.

**Требование:** описать многоступенчатый pipeline отдельно: (1) hard eligibility filters (доступ, юрисдикция/дата/статус, если достоверно известны); (2) candidate relevance retrieval; (3) reranking только релевантности; (4) domain-specific legal metadata/authority presentation and grouping; (5) unresolved conflicts/unknown surfaced explicitly. Не задавать универсальный юридический authority score.

### A-07. Citation integrity и claim support — разные уровни

**Приоритет:** P0 для ответов с юридическими источниками.

`docs/18` Citation Validator проверяет существование документа/версии, реквизиты, текст цитаты, URL и temporal status. `docs/33` добавляет структурированную связь claim → citation keys и support type. `docs/ai/retrieval/07` измеряет Citation Support и Unsupported Claim Rate.

**Риск:** валидная ссылка или точная цитата может не подтверждать сформулированный вывод; а поддержка отдельного утверждения ещё не доказывает юридическую применимость всей нормы к фактам.

**Требование:** разделить минимум три проверки:
1. **Reference integrity** — источник, версия, locator и quote существуют и совпадают.
2. **Claim support** — конкретное утверждение ответа действительно поддерживается указанным evidence (direct / inference / unsupported; оценка может требовать LLM-judge + экспертной выборки, но judge не является истиной).
3. **Legal applicability/reasoning** — редакция, переходные положения, факты, исключения, иерархия и противоречия; отдельная экспертная оценка.

Не называть первый уровень «проверкой юридической корректности».

### A-08. Два описания chunking — не конфликт решения, но риск разночтения

**Приоритет:** P1, до закрытия FILE-009.

`docs/17` даёт baseline 500–800 tokens с overlap 50–100. `docs/33` предлагает эксперимент Structure-Aware Parent-Child: Child 300–500, Parent 800–1800; fixed-size 500–800 остаётся baseline для сравнения. FILE-009 остаётся OPEN.

**Требование:** считать параметры `docs/17` одним baseline-кандидатом, а `docs/33` — набором альтернативных кандидатов. Не кодировать ни один размер как подтверждённый default до benchmark. Golden set должен отдельно проверять сохранение исключений, условий, таблиц, ссылок и границ юридических пунктов.

### A-09. Extraction сейчас не обеспечивает доказуемую структурную полноту

**Приоритет:** P0 перед production RAG; часть ограничений допустима для текущего Phase 4 scaffold.

В `apps/api/src/documents/extract-text.ts`:
- TXT читается как UTF-8;
- DOCX извлекает `word/document.xml`, заменяет отдельные теги и удаляет остальные XML-теги регулярным выражением;
- PDF извлекает плоский `parsed.text` и общее число страниц;
- нет устойчивого page/paragraph/heading/table locator, структурного дерева, source offsets, качества извлечения или полноты по страницам;
- скан без текстового слоя отклоняется согласно D-031.

Это честный thin extraction, но не достаточный parser для юридического поиска/цитирования. DOCX flattening может терять структуру таблиц/заголовков/сносок; PDF plain text не гарантирует точные page/paragraph locators.

**Требование:** Phase 6 parser contract должен выдавать extraction quality report и структурные locators; публикация в search index должна блокироваться или требовать review при пропусках/необъяснимой потере текста. Оригинал и точный extracted text сохраняются отдельно от normalized/retrieval text. OCR остаётся за D-031/O-004.

### A-10. Retry semantics extraction worker требуют проверки/исправления

**Приоритет:** P1 для надёжности ingestion.

В `apps/api/src/worker/extract-worker.ts` при `result.ok === false` worker обновляет DB job status на `queued`, если попытки ещё остались, а затем возвращается из processor. Для BullMQ такой processor завершает job успешно; в просмотренном коде не обнаружен автоматический republisher/re-enqueue для этого случая. `AiJobsService` повторно публикует существующую queued job при повторном вызове enqueue, но это не равнозначно гарантированному retry loop.

**Риск:** DB может показывать `queued`, хотя соответствующее BullMQ job уже завершилось; повторная попытка может не произойти до внешнего повторного enqueue.

**Требование:** определить единый источник истины и механизм retry: либо бросать retryable error и использовать BullMQ attempts/backoff с согласованием DB state, либо реализовать явный DB-driven dispatcher/reconciler. Добавить тесты на transient failure, timeout, max attempts, Redis outage, duplicate delivery и worker crash. Не объявлять это закрытым без теста.

### A-11. Актуальность audit snapshot и tracker

**Приоритет:** P1 для документационной дисциплины.

`docs/34` явно датирован 2026-11-10 и описывает отсутствие Chat/Outbox/Snapshots. Это исторический снимок, а не текущий AS-IS. `docs/26` фиксирует состояние на 2026-11-13, а `tasks/phase5-6-gaps.md` отмечает P5-01…P5-05 как closed и P6-01…P6-09 как open/blocked.

**Требование:** в новых задачах ссылаться на `docs/26` + `tasks/phase5-6-gaps.md` для актуального состояния. `docs/34` сохранять как исторический audit trail; не переписывать его задним числом.

## 5. Что уже достаточно проработано — не дублировать

Следующие темы уже имеют существенное описание и требуют последующей проверки/реализации, а не новой параллельной спецификации:

- source registry, лицензии и capabilities источников — `docs/18`, O-006;
- court-decision metadata, appellate links и процессуальный контекст — `docs/18`;
- source conflict handling и явное представление противоречий — `docs/18`;
- incremental sync/change detection — `docs/18`;
- versioned index manifest, reproducibility, checksums — `docs/28`;
- corpus export/import и deletion journal — `docs/27`, `docs/29`;
- portability/integrity/search validation — `docs/30`;
- server-derived RetrievalScope, SQL/RLS filtering, cache invalidation/deletion — `docs/33`;
- temporal model hypotheses, `unknown` state, manual review boundary — `docs/ai/retrieval/03`, `06`, `09`;
- RRF baseline, optional reranker/MMR and evidence-gated rollout — `docs/33`.

## 6. Приоритетный backlog после этапа 1

| ID аудита | Действие | Приоритет | Зависимость / ворота | Результат |
|---|---|---|---|---|
| A-01 | Синхронизировать ACL order в `docs/17` с `docs/33` | P0 | Без изменения D/O | Один безопасный retrieval contract |
| A-02 | Уточнить lifecycle extraction-ready vs searchable-ready | P0 | Проверить `docs/13`, UX и API contract | Нельзя принять extraction за индексацию |
| A-07 | Разделить reference integrity / claim support / legal applicability | P0 | Без изменения D/O | Проверяемая доказательная цепочка |
| A-09 | Утвердить parser quality/locator contract | P0 | Phase 6A; OCR остаётся gated | Контролируемое качество корпуса |
| A-03 | Составить crosswalk моделей `docs/18` ↔ `ai/retrieval/03` | P1 | До O-006 implementation | Нет дублирующих legal entities |
| A-04 | Свести временные координаты в единый glossary | P1 (P0 для legal ingestion) | Юридическая проверка; O-006 | Единый temporal contract |
| A-05 | Определить общую evaluation schema + domain suites | P1 | До выбора моделей/порогов | Сопоставимые benchmark runs |
| A-06 | Разделить relevance ranking и legal authority/applicability | P1 | До legal ranking implementation | Нет одного непрозрачного score |
| A-08 | Свести chunking candidates в benchmark matrix | P1 | FILE-009 остаётся OPEN | Выбор по результатам тестов |
| A-10 | Проверить retry/reconciler extraction jobs | P1 | Тесты BullMQ/DB state | Нет зависших queued jobs |
| A-11 | Явно закрепить актуальные источники AS-IS | P1 | Документационная правка | Cursor не опирается на исторический снимок |

## 7. Не менять на этом этапе

- Не менять статусы D/O/H, Gate B, FILE-009, O-002, O-004, O-006, O-007.
- Не выбирать embedding model/dimensions и не добавлять provider.
- Не подключать ParadeDB или отдельный search service.
- Не создавать LegalAct*/LegalProvision*/ApplicabilityRule Prisma schema.
- Не включать OCR и не отправлять реальные документы внешним AI.
- Не фиксировать chunk size, RRF k, HNSW parameters или quality thresholds без benchmark.
- Не переписывать `docs/34` исторического аудита.

## 8. Следующий этап

Этап 2 должен превратить подтверждённые пробелы A-01…A-10 в согласованные алгоритмические контракты и тестовые сценарии. Рекомендуемый порядок: ACL contract → document readiness lifecycle → extraction quality/locator contract → evidence validation levels → evaluation framework. Параллельно подготовить crosswalk legal data model и temporal glossary, не переходя к Prisma implementation до O-006.

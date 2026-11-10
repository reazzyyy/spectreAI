# 34. Phase 5–6 Code and Design Audit

**Статус:** AS-IS audit snapshot, 2026-11-10. Это отчёт о найденных расхождениях, не изменение решений.

## 1. Источники проверки

- `spectreAI-main` repository snapshot от 2026-11-10;
- `design-figmaI` React/Vite prototype и `plans/neurojurist-spectrum-flow-register.md`;
- `docs/decisions-log.md` и `docs/06–30`;
- текущая Prisma schema, migrations, NestJS modules, workers и Next.js FSD tree.

Figma-прототип является UX reference и source of scenarios, но не production frontend/backend. Его seed state, in-memory context и mock flows не являются контрактом API.

## 2. Фактический AS-IS

| Подсистема | Состояние в коде |
|---|---|
| Workspace / membership | Prisma + API + access layer |
| Documents | Upload, download, lifecycle scaffold |
| Extraction | TXT/DOCX/digital PDF worker; DocumentExtraction хранится в PostgreSQL |
| AI Gateway | Synthetic provider; только `generateText` |
| AIJob | Есть таблица и extract job; статусы D-011 |
| BullMQ | Очередь/worker для extraction |
| Conversation / Message | Нет Prisma models/API/UI |
| AI Generation | Нет |
| Context Snapshot | Нет |
| DocumentVersion | Нет; Document сейчас flattened single version |
| DocumentChunk | Нет |
| Embedding | Нет |
| pgvector extension migration | Не найдена в migrations на дату снимка |
| FTS/GIN index | Не найден |
| HNSW index | Не найден |
| Hybrid retrieval/RRF | Не реализован |
| Reranker | Не реализован |
| RAG evaluation runner | В коде приложения не найден; design docs 30 описывают требования к validation |

Образ `pgvector/pgvector:pg16` в Docker — подготовка окружения, не готовый vector store.

## 3. Критические технические пробелы

### P0 — блокируют безопасную Phase 5/6

1. Нет Conversation/Message API и Prisma модели.
2. Нет chat ACL и RLS policies, хотя `workspace-phase2/02` требует RLS для Chat/Message.
3. Текущий `/ai/generate` — синхронный synthetic endpoint, не persistence/orchestration чата.
4. Нет AI generation entity; AIJob сейчас связан преимущественно с document extraction.
5. Нет transactional outbox/publisher implementation в текущем code snapshot, хотя `docs/15` описывает надёжную доставку.
6. Нет DocumentVersion; `DocumentExtraction.documentId` unique, поэтому нельзя надёжно ссылаться на разные версии документа.
7. Нет chunk/embedding/index generation schema, indexing worker и retrieval SQL.

### P1 — нужны до полноценного RAG

1. Нет structure parser output (heading path, clause, paragraph, table rows, source offsets).
2. Нет русскоязычного FTS config и exact identifier path.
3. Нет embedding provider abstraction и выбранной модели/dimensions.
4. Нет vector extension migration/HNSW benchmark.
5. Нет RRF/reranking/context builder/citation validator.
6. Нет search ACL tests, cache invalidation и delete tombstone flow.
7. Нет golden dataset и executable retrieval regression tests.

## 4. Design / workflow observations

- Figma описывает полный набор Chat flows: create/open/continue, rename/delete, attach docs, document analysis, follow-up, citations, copy, regenerate, stop, edit message, team chat and private chat in team workspace.
- Flow register маркирует отдельные действия как требующие решения; в частности, regenerate/edit и cancellation details связаны с DEC-05. Наличие UI не означает, что эти product rules закрыты.
- `workspace-phase2/03` уже задаёт `PRIVATE`/`WORKSPACE` visibility: backend derives creator/owner from ActorContext; не доверять `createdByUserId` от клиента.
- `workspace-phase2/02` требует RLS для Chat/Message, AIJob/AI result и Chunks/embeddings/search records.
- Figma prototype uses local/mock state and cannot be copied wholesale into Next.js application.

## 5. Важные архитектурные наблюдения

1. Не начинать vector indexing до DocumentVersion. Иначе embeddings/chunks нельзя будет однозначно связать с конкретной редакцией.
2. Не строить Chat как прямой вызов `/ai/generate`. Нужны persisted messages, generation, AIJob, Outbox, worker, context snapshot and ACL.
3. Не считать Workspace membership достаточным для PRIVATE Conversation. Conversation visibility — отдельный ACL layer.
4. Не считать Org Admin content access автоматически предоставленным.
5. Не передавать реальные документы внешним embeddings/LLM/reranker providers до O-002.
6. Не путать PostgreSQL FTS ranking с BM25.
7. Не фиксировать vector dimensions до Gate B.
8. Не выдавать ссылки, сгенерированные моделью, без серверной проверки источников.
9. Не запускать regeneration/edit semantics до закрытия DEC-05 details.
10. Не добавлять новые search engine services до измеренного доказательства, что PostgreSQL D-018 не закрывает MVP.

## 6. Предлагаемая последовательность

1. Phase 5A: Conversation/Message/Generation, ACL/RLS, API, synthetic worker, history persistence.
2. Phase 5B: source references/context snapshots and document selection contracts; only synthetic-safe data until O-002.
3. Phase 6A: DocumentVersion backfill, structure-aware chunking experiment, FTS, exact identifiers, index generation and evaluation.
4. Gate B: select embedding profile/dimensions.
5. Phase 6B: pgvector/HNSW + EmbeddingProvider + RRF.
6. Phase 6C: reranker/query rewrite/MMR only if evaluation proves improvement.

## 7. Existing decisions to preserve

Do not modify D-008, D-011, D-012, D-018, D-025–D-031, W-006–W-020, O-001–O-010, O-012 or other D/O/H statuses. FILE-009 and Gate B remain open. This audit adds implementation detail only.


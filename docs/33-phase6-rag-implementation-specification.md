# 33. Phase 6 — Search and RAG Implementation Specification

**Статус:** PROPOSED implementation specification. Не меняет D-018, Gate B, FILE-009, O-002 и другие решения в `docs/decisions-log.md`.

**Дата аудита исходников:** 2026-11-10.

**Назначение:** определить физическую и алгоритмическую реализацию индексации и retrieval. Документ дополняет, а не пересказывает `docs/17`, `docs/19`, `docs/27–30`.

## 1. Ключевой вывод аудита

Проект уже подтверждает D-018: PostgreSQL FTS + pgvector. Документы 17 и 27–30 описывают логические этапы, provenance, переносимость и retrieval validation. Но в текущем коде отсутствуют `DocumentVersion`, `DocumentChunk`, `Embedding`, index generation, FTS/vector retrieval и соответствующие workers.

`docker-compose` использует образ `pgvector/pgvector:pg16`, однако на дату аудита нет migration с `CREATE EXTENSION vector`, нет vector column и нет HNSW index. Наличие Docker image не означает, что pgvector включён в схему.

`Document` сейчас хранит один файл; `DocumentExtraction` имеет unique `documentId`, то есть extraction не версионирован. До индексации требуется ввести immutable document version и безопасно перенести текущий документ в version 1.

## 2. Решения и ограничения

- `D-018`: PostgreSQL FTS + pgvector; не добавлять отдельную vector DB без нового решения.
- `FILE-009`: chunking strategy/config остаётся OPEN.
- `Gate B`: embedding model + dimensions остаются OPEN; физический vector index не фиксировать до решения.
- `O-002`: реальный клиентский текст нельзя передавать внешнему embedding/reranking/LLM provider до правовой проверки.
- `D-025`: полный extracted text Phase 4 хранится в PostgreSQL; original binary — object storage.
- `D-031`: scan/insufficient text extraction завершается failed до утверждения OCR.
- `D-027`: indexing jobs должны быть идемпотентны.
- `D-030`: extract caps не превращать в тарифные лимиты; indexing limits определить отдельно после тестов.
- `docs/28`: фиксировать независимые версии extractor, normalization, structure parser, chunker, embedding и search config.

## 3. Рекомендуемая архитектура

```text
Document upload
  -> DocumentVersion (immutable source)
  -> Extract worker (existing Phase 4)
  -> DocumentExtraction
  -> Structural parsing / normalization
  -> Structure nodes
  -> Parent + child chunks
  -> FTS index --------------------+
  -> EmbeddingProvider -> vectors -+-> Index generation
                                      |
User query                            |
  -> Query preparation                |
  -> Server-derived RetrievalScope    |
  -> PostgreSQL FTS candidates -------+
  -> pgvector candidates -------------+-> RRF
  -> optional reranker                   -> parent expansion / dedupe
  -> final ACL + version validation      -> Context Builder
  -> source/citation registry             -> AI Gateway
  -> validated answer + evidence mapping
```

Не создавать отдельные микросервисы только ради логических блоков. В NestJS допустимы отдельные modules/interfaces; тяжёлые indexing/embedding operations выполняются worker process. Python parser/worker допустим только как отдельный adapter, если фактические parser requirements оправдывают отдельный runtime; текущая codebase уже TypeScript/NestJS и не требует Python только потому, что это часто встречается в RAG проектах.

## 4. DocumentVersion — обязательный prerequisite

### 4.1 Рекомендуемая модель

Сохранить `Document` как логическую карточку и ввести `DocumentVersion` как immutable конкретный файл/содержимое.

Минимальные поля:

- `id`, `organizationId`, `documentId`;
- `versionNumber`;
- `originalFileName`, `mimeType`, `byteSize`, `checksumSha256`, `storageKey`;
- `uploadedByUserId`, `createdAt`;
- `status` / processing state;
- `isCurrent` или `currentVersionId` на Document (выбрать один способ, не дублировать источник истины).

Ограничения:
- unique `(documentId, versionNumber)`;
- unique `(organizationId, id)`;
- source artifact immutable после upload;
- новая загрузка создаёт новую version, не перезаписывает старый blob;
- обычный retrieval использует только current/eligible version; historical comparison требует явного scope.

### 4.2 Backfill

Для существующих документов миграция создаёт version 1 из текущих полей Document. `DocumentExtraction` переносится/связывается с `documentVersionId`. Старые поля нельзя удалять в той же миграции: применить expand-and-contract, проверить counts/checksums/FK, затем отдельной миграцией убрать legacy shape.

`DocumentExtraction` должна стать version-scoped; уникальность `documentId` заменить уникальностью `(documentVersionId, extractionRevision)` либо `(documentVersionId)` для одной активной extraction. Выбрать одну политику и описать повторную обработку.

## 5. Structural parsing и нормализация

Не индексировать только один плоский `textContent` без координат и структуры.

### 5.1 StructureNode (кандидат)

- `id`, `organizationId`, `documentVersionId`;
- `parentId`, `ordinal`, `nodeType` (`document`, `heading`, `section`, `clause`, `paragraph`, `list_item`, `table`, `table_row`, `table_cell`, `page`);
- `headingPath` / structured JSON path;
- `label` (например, номер пункта, если он действительно распознан);
- `rawText`;
- `startOffset`, `endOffset` в canonical extracted text;
- `pageStart`, `pageEnd`;
- `parserVersion`, `confidence`/quality marker при эвристическом распознавании.

Не выдавать эвристически угаданный номер статьи/пункта за гарантированную структуру. Сохранять provenance и качество распознавания.

### 5.2 Нормализация

Разделить:
- `rawText` — точное извлечённое представление для цитирования;
- `normalizedText` — поисковая нормализация;
- `retrievalText` — текст для поиска с добавленным title/heading path;
- metadata — номер, страницы, тип блока.

Нельзя цитировать normalized/retrieval text как дословный исходник. Unicode, параграфы, тире, кавычки, номера пунктов и табличные заголовки должны сохраняться в raw layer.

Таблицы индексировать как самостоятельные row groups с повторением заголовков колонок в retrievalText. Не сплющивать таблицу так, чтобы значение теряло связь с колонкой.

## 6. Chunking: рекомендуемый кандидат FILE-009

### 6.1 Сравнение

| Подход | Плюсы | Минусы | Решение-кандидат |
|---|---|---|---|
| Fixed-size 500–800 tokens | Прост, baseline | Разрезает пункты/исключения, теряет структуру | Только baseline в evaluation |
| Structure-aware single-level | Сохраняет юридические границы | Большие статьи/разделы становятся слишком длинными | Лучше fixed-size, но недостаточно гибок |
| Structure-aware parent-child | Ищет мелкими точными фрагментами, возвращает широкий контекст | Сложнее хранение и дедупликация | **Рекомендуемый вариант** |

### 6.2 Начальные параметры для эксперимента

Это стартовая конфигурация, не CONFIRMED:

- child target: 300–500 tokens;
- parent: структурный пункт/подпункт/секция, обычно 800–1 800 tokens, с жёстким верхним пределом из token budget;
- overlap: 40–60 tokens только внутри длинного структурного блока, не пересекать границу соседнего юридически самостоятельного пункта без причины;
- таблица: отдельные row groups, целевой размер 1–3 логически связанных строк с заголовками;
- chunking version/config hash обязателен.

### 6.3 Алгоритм

1. Получить canonical text + structure nodes.
2. Определить естественные юридические единицы: статья/раздел/пункт/подпункт/абзац.
3. Сформировать parent по наиболее сильной распознанной границе.
4. Если parent превышает лимит — разбить по child boundaries (пункты/абзацы/предложения), не разрывая короткие условия и исключения.
5. Объединять короткие соседние абзацы только внутри одной смысловой/структурной единицы.
6. Сформировать child chunks с `parentChunkId`, ordinal и exact offsets.
7. Создать `retrievalText = title + headingPath + structural label + rawText`; заголовки хранить отдельно и не добавлять в citation quote.
8. Рассчитать tokenCount токенизатором, совместимым с embedding model после Gate B; до Gate B использовать выбранный tokenizer только для baseline и явно версионировать его.
9. Сохранить SHA-256 canonical chunk payload и config hash.
10. Проверить coverage: каждый значимый текстовый offset либо покрыт chunk, либо имеет явную причину исключения.

## 7. Предлагаемая физическая модель индекса

### 7.1 DocumentChunk

- `id`, `organizationId`, `documentId`, `documentVersionId`;
- `indexGenerationId`;
- `parentChunkId` nullable;
- `chunkIndex`, `chunkType`;
- `rawText`, `retrievalText`;
- `headingPath`, `structuralLabel`;
- `pageStart`, `pageEnd`, `startOffset`, `endOffset`;
- `tokenCount`, `contentHash`, `chunkingVersion`, `createdAt`.

### 7.2 SearchIndexGeneration / IndexBuild

Согласовать с `docs/28` и `docs/27`, не создавать параллельную manifest system.

Минимум:
- `id`, `status` (`building`, `validated`, `active`, `failed`, `retired`);
- parser/normalization/structure/chunking versions;
- embedding profile ID/version (nullable для FTS-only build);
- search config version;
- source snapshot/watermark;
- counts, error counts, validation report reference;
- created/activated timestamps.

Один активный generation на выбранный corpus scope. Переключение active generation — атомарная операция после coverage, checksum и retrieval validation. Не удалять старый generation до успешного переключения и retention decision.

### 7.3 EmbeddingProfile / ChunkEmbedding

Embedding profile хранит provider, model ID/revision, dimensions, distance metric, preprocessing version, tokenizer, data processing class/approval state.

`ChunkEmbedding` связывает `chunkId`, `indexGenerationId`, `embeddingProfileId`, vector payload, dimensions, checksum и generatedAt.

Не смешивать разные embedding spaces. Размерность и physical vector typmod фиксируются только после Gate B. Если модель/размерность меняются, строить отдельный generation и физически изолировать несовместимые vectors/indexes; не делать in-place overwrite.

### 7.4 PostgreSQL extensions / indexes

- `vector` extension должна быть создана versioned migration `CREATE EXTENSION IF NOT EXISTS vector` после проверки extension доступности в используемом Postgres image/runtime.
- FTS: `tsvector`/GIN index, построенный из `retrievalText` и структурных полей; индексировать `rawText` отдельно от metadata для цитирования.
- Русский язык: начать с PostgreSQL `russian` text search configuration; провести тесты stemming/stopwords на юридическом golden set. Для идентификаторов, номеров договоров/статей и exact strings предусмотреть отдельный exact-match path; FTS не должен быть единственным способом найти номер.
- `unaccent`/`pg_trgm` не добавлять как обязательные extension без проверки окружения и migration support.
- Векторный индекс: HNSW с cosine distance как первый кандидат. Стартовые `m=16`, `ef_construction=64`, `ef_search=100` — только benchmark defaults; сравнить с exact search и подобрать по latency/recall. Конкретный operator class и vector dimensions зависят от Gate B.

Важно: PostgreSQL FTS rank (`ts_rank`/`ts_rank_cd`) — не BM25. Не маркировать его BM25. D-018 не разрешает автоматически добавлять ParadeDB/OpenSearch.

## 8. EmbeddingProvider и Gate B

Embedding — отдельная capability, не `generateText`.

Предлагаемый контракт:

```ts
interface EmbeddingProvider {
  readonly providerId: string;
  readonly modelId: string;
  readonly dimensions: number;
  embedDocuments(inputs: readonly EmbeddingInput[]): Promise<EmbeddingBatchResult>;
  embedQuery(input: EmbeddingInput): Promise<EmbeddingResult>;
}
```

Контракт должен поддерживать batch, deterministic ordering, per-item errors, input token accounting, timeout/cancellation и model metadata.

До выбора модели:
- не хардкодить dimensions;
- не создавать production vector column/index с guessed dimensions;
- можно создать interfaces, fake provider для contract tests и FTS baseline;
- fake/deterministic embeddings не использовать для оценки semantic retrieval и не называть RAG quality.

Gate B должен выбрать model/provider/revision/dimensions/tokenizer/distance metric/hosting mode и оценить русский юридический golden set, latency, throughput, стоимость и data transfer class. Внешний embedding provider запрещён для реальных клиентских документов до O-002.

## 9. Indexing orchestration

Использовать существующий AIJob + BullMQ; не вводить вторую очередь.

Рекомендуемый job type: `document.index` с idempotency key `documentVersionId:index:<pipelineConfigHash>`.

Worker stages:
1. verify DocumentVersion still eligible and accessible to system worker;
2. load extraction by version;
3. parse structure;
4. normalize and build chunks;
5. build FTS records;
6. if Gate B + data policy permit, batch embeddings;
7. validate counts/checksums/dimensions;
8. mark document index entry ready;
9. activate generation only after required validation.

Не делать `Document.status=ready` автоматически только после extraction, если продуктовый контракт требует готовности к поиску. Развести статусы extraction и indexing либо определить явный `searchableAt`/index status, не ломая существующий `DocumentStatus` без решения.

Новая версия документа должна индексироваться отдельно; обычный retrieval переключается на неё только после успешного index build. Ошибка новой версии не должна разрушать предыдущую валидную версию, если политика current-version не требует немедленной блокировки.

## 10. Retrieval pipeline

### 10.1 Server-derived RetrievalScope

Клиент не может передать доверенные `organizationId`, `allowedWorkspaceIds`, `allowedDocumentIds`.

Scope собирается backend из:
- ActorContext;
- Conversation visibility/owner;
- WorkspaceAccess;
- explicitly attached/selected documents;
- active document membership;
- allowed version policy;
- current active index generation.

Пример контракта:

```ts
interface RetrievalScope {
  organizationId: string;
  userId: string;
  conversationId: string;
  workspaceIds: readonly string[];
  documentIds?: readonly string[];
  documentVersionIds?: readonly string[];
  indexGenerationId: string;
  sourceMode: "conversation_only" | "selected_documents" | "workspace";
}
```

`workspaceIds` должны быть уже проверенным серверным результатом. PRIVATE chat не делает документы всего Workspace автоматически private; но retrieval не должен расширять выбранный scope без явного режима/настройки Conversation.

### 10.2 Query preparation

MVP deterministic preparation:
- trim/normalize whitespace;
- detect exact identifiers, article/paragraph numbers, quoted phrase;
- retain original query;
- derive query terms for FTS;
- apply structured filters only when explicit and validated.

LLM query rewriting/decomposition — optional later stage behind Gateway, only if provider/data policy allows. Rewritten query never changes ACL or source scope. Preserve original query in trace metadata. Do not make synthetic rewrite pretend semantic improvement.

### 10.3 Candidate retrieval

When Gate B active:
- FTS top 30–50 candidates;
- vector ANN top 30–50 candidates;
- exact identifier/phrase matches as a separate high-confidence candidate channel;
- all channels apply tenant/workspace/document/version/index-generation predicates inside SQL before results leave DB.

Candidate counts are initial benchmark values, not fixed SLA.

Before Gate B: FTS + exact path works as staged Phase 6A; UI must label semantic/vector search as unavailable, not silently fake it.

### 10.4 Hybrid fusion

Use Reciprocal Rank Fusion as initial fusion candidate:

`RRF(d) = Σ_i 1 / (k + rank_i(d))`

Initial `k=60` is a conventional tuning starting point, not confirmed. Deduplicate by chunk ID; retain channel ranks and scores for diagnostics. Do not sum raw `ts_rank` and cosine similarity without normalization/calibration.

### 10.5 Parent expansion and reranking

- Retrieve child chunks for precision.
- Expand selected children to parent/neighbor context only after ACL and version filtering.
- Deduplicate overlapping child chunks.
- Preserve source ordering and page locators.
- Initial MVP may use RRF + deterministic parent expansion.
- Cross-Encoder reranker is a later candidate; run only after a golden-set benchmark proves uplift and its hosting/data policy is approved. Reranker must only receive already-authorized candidates.

### 10.6 MMR

MMR is an optional diversity selection stage after relevance retrieval, not a replacement for reranking. Use it only when tests show top results are overly redundant. Enforce a per-document/parent cap to avoid one long document consuming the full context.

## 11. ACL, RLS, deletion and cache

- Apply `organizationId`, Workspace membership/ownership, Document status, current version and index generation in SQL before returning candidates.
- Re-check current ACL before context assembly and again before result/source retrieval.
- RLS on `document_versions`, `structure_nodes`, `document_chunks`, `chunk_embeddings`, `index_generations`, and retrieval metadata. Every table tenant-owned must be included in RLS inventory.
- RLS GUCs must be set through existing `PrismaService.withActor` transaction pattern; system workers require an explicit narrowly scoped service actor/path, not a global RLS bypass.
- On access revoke/delete: deny new retrieval immediately; invalidate caches; mark index entries unavailable/tombstoned; async purge chunks/vectors according to lifecycle policy; active AI jobs must re-check ACL before publication.
- Cache key includes org, actor/permission version, source scope, selected doc/version IDs, index generation, normalized query, filters, retrieval config. Re-check ACL before returning cached results.

## 12. Context Builder and citations

Context Builder receives only authorized ranked candidates.

Recommended order:
1. system/developer policy and task instructions;
2. recent relevant conversation history or validated summary;
3. current user request;
4. selected evidence chunks;
5. source registry with stable citation keys.

Use token budget partitioning: reserve output budget and instruction/history budget first; allocate evidence budget from remainder. Never truncate a legal clause in a way that removes exception/condition without a marker. If context cannot fit, choose fewer complete evidence units or ask for narrower scope.

Each evidence item includes stable `citationKey`, `documentId`, `documentVersionId`, `chunkId`, page/locator, exact raw quote and content hash. Model output may cite only supplied keys. Server validates keys against generation's ContextSnapshot; unknown keys are dropped/flagged. If exact quote verification is requested, verify returned quote is a substring/normalized span of the raw source; do not trust model-created citations.

Represent answer claims with structured evidence mapping when structured output is available: `claimId`, `text`, `citationKeys`, `supportType` (`direct`, `inference`, `not_supported`). This is a candidate response contract; do not claim that a citation proves legal correctness. UI distinguishes citation presence from legal conclusion quality.

No evidence / incomplete extraction / retrieval failure must be different states. Absence of hits does not prove absence of a clause.

## 13. Evaluation

Reuse `docs/30` as the canonical portability/search validation baseline; this document adds implementation gates, not a second evaluation framework.

Create a versioned synthetic/approved golden dataset with:
- exact clause/identifier queries;
- semantic paraphrases;
- Russian legal terminology and inflections;
- negation/exceptions;
- table rows;
- multi-document queries;
- missing-answer cases;
- current vs historical versions;
- duplicate/near-duplicate chunks;
- adversarial prompt-injection text;
- ACL-negative pairs.

Track at minimum:
- Recall@5 and Recall@10;
- Precision@5/10;
- MRR;
- nDCG@10;
- citation precision / unsupported claim rate;
- empty-result rate;
- ACL leakage count (must be 0);
- exact vs ANN recall delta;
- p50/p95 latency by stage;
- indexing coverage and error rate.

Compare baselines in this order:
1. exact + PostgreSQL FTS;
2. FTS + vector ANN;
3. FTS + vector + RRF;
4. RRF + parent expansion;
5. optional reranker/MMR.

Do not add reranker or external search infrastructure based on anecdotal examples. Require measured uplift and acceptable p95/cost.

## 14. Delivery stages

### Phase 6A — FTS + structure baseline (can begin before Gate B)

- DocumentVersion + safe backfill;
- extraction version relation;
- structure parsing and chunking experiment;
- DocumentChunk + provenance;
- Russian PostgreSQL FTS + exact identifier path;
- index job + generation/manifest linkage;
- ACL/RLS + tests;
- retrieval golden dataset and metrics.

### Phase 6B — vector retrieval (blocked by Gate B)

- choose embedding model/profile and dimensions;
- enable pgvector extension in migration;
- implement EmbeddingProvider adapter and approved hosting path;
- build vector embeddings/index generation;
- HNSW vs exact benchmark;
- hybrid RRF retrieval and ACL tests.

### Phase 6C — quality improvements (evidence-gated)

- query rewrite/decomposition;
- Cross-Encoder reranking;
- MMR diversity;
- retrieval caching;
- claim/evidence validation enhancements.

No stage may bypass O-002 for real client content.

## 15. Acceptance criteria

- Every chunk is linked to immutable DocumentVersion and source offsets.
- Index build has a manifest/version and checksums per docs 28–30.
- Reprocessing is idempotent.
- New index generation does not replace active generation until validation passes.
- FTS queries return only permitted documents/versions.
- Vector results (after Gate B) use one compatible embedding space per index generation.
- Hybrid fusion is reproducible and diagnostics retain ranks per channel.
- Source citations resolve to real accessible source versions and locators.
- No ACL leaks in cross-org/workspace/private negative tests.
- Deleted/revoked content cannot be retrieved from SQL, vector index, cache or AI result.
- Search evaluation reports exact-vs-ANN quality and p50/p95 latency.
- UI never presents FTS as BM25 or fake vectors as semantic search.

## 16. Unresolved gates — do not auto-close

| Item | Status / dependency |
|---|---|
| FILE-009 chunking | OPEN; choose after golden-set benchmark of candidate strategies |
| Gate B embedding model + dimensions | OPEN; blocks physical vector schema/HNSW deployment |
| O-002 external transfer legality | OPEN; blocks real client data to external embeddings/LLM/reranker |
| O-003 Russian hoster/object storage | OPEN; impacts production hosting/self-hosted inference |
| O-004 OCR | OPEN; scan PDFs fail per D-031 until confirmed |
| O-007 load/cost limits | OPEN; indexing/search concurrency and budgets need tests |
| O-005 retention/legal hold | OPEN; deletion/purge policy must not be invented |


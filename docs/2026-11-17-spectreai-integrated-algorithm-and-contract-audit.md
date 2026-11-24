# НейроЮрист Спектр — повторный интегральный аудит алгоритмов, кода и контрактов

**Дата:** 17.11.2026  
**Тип:** новый самостоятельный аудиторский документ, без изменения существующих файлов  
**Статус:** AUDIT / PROPOSED. Находки и рекомендации; не меняет `CONFIRMED`, `OPEN`, `PROPOSED` в `docs/decisions-log.md`.  
**Как читать сейчас:** аудит архива от 2026-11-17, не текущий AS-IS. Поздние PR закрыли описанные там P0-01…P0-06 (#52–#57) и срез DocumentVersion (#51). Открытые ворота этот файл не закрывает.  
**Срез:** архив `spectreAI-main (2).zip`, предоставленный пользователем 17.11.2026; описание состояния кода в `docs/26-codebase-current-state.md` датировано 13.11.2026. Дополнительно сопоставлены десять самостоятельных контрактов и аудитов от 16–17.11.2026 из предыдущих обсуждений и зафиксированные решения по RAG/Qwen.

> **Главный вывод.** Мы уже описали большую часть *правильной целевой архитектуры* RAG. Однако сейчас главные риски продукта — не отсутствие ещё одного алгоритма ранжирования, а несколько конкретных дефектов обработки фоновых заданий и несогласованность между работающим кодом и новыми правилами provenance/evidence. Следующий шаг — исправить критическую механику существующего MVP, затем реализовать узкий измеримый FTS-поиск по пользовательским документам. Добавление новых абстрактных контрактов без исполняемых тестов даёт быстро убывающую пользу.

---

## 1. Как проводился аудит и чего он не доказывает

Проверены:

1. Реальные исходники NestJS, BullMQ, Prisma, RLS migrations, API, FSD UI и тесты внутри архива.
2. `docs/decisions-log.md`, `docs/26`, `docs/28`, `docs/32–34`, `docs/17–19`, `docs/ai/retrieval/*`, `docs/security/data-classification.md`, `tasks/roadmap.md`.
3. Предыдущие отдельные документы: `2026-11-16-stage1-consolidation.md`, `2026-11-17-acl-retrieval-scope-contract.md`, `2026-11-17-document-readiness-lifecycle-contract.md`, `2026-11-17-document-readiness-consistency-decision.md`, `2026-11-17-extraction-quality-parser-contract.md`, `2026-11-17-evidence-validation-contract.md`, `2026-11-17-evaluation-framework-contract.md`, `2026-11-17-claim-support-applicability-taxonomy.md`, `2026-11-17-cross-contract-consistency-review.md`, `2026-11-17-extraction-eligibility-immutable-evidence-binding.md`.
4. Из предыдущих обсуждений: D-018 (PostgreSQL FTS + pgvector), кандидаты Qwen3-Embedding/Reranker, HNSW/exact, RRF, Structure-Aware + упрощённый Parent–Child, экспериментальное сравнение с BM25, ориентация на скромный бюджет.

**Уровень доказанности:** `КОД` — непосредственно видно по алгоритму исходников; `ДОК` — подтверждено текстом документа/журнала; `РИСК` — потенциальный сценарий, требующий теста. Анализ статический. CI, PostgreSQL, Redis и end-to-end прогон здесь не запускались: в копии архива отсутствуют установленные зависимости и запущенная инфраструктура. Это **не** сертификат безопасности и **не** аудит текущей live-ветки GitHub после даты архива.

**Как читать приоритет:**

- **P0 / исправить прежде дальнейшей сборки:** потеря заданий, нарушение детерминированности обработки, опасные разрешения, ложные гарантии.
- **P0 / gate следующей фазы:** нет нужной реализации либо продуктового решения; это не обязательно ошибка существующего кода.
- **P1:** закрыть до реальных данных/production или до включения зависящей возможности.
- **P2:** улучшение только при подтверждённой потребности/измеримом эффекте.

---

## 2. Реальное состояние: что уже есть и что пока только описано

| Подсистема | В архиве | В документации | Честная оценка |
|---|---|---|---|
| Organization / Workspace / Client / Matter | Prisma, API, RLS foundation, UI | W-001–W-020, D-006/007 | Есть рабочий каркас; grant и удаление не закончены |
| PRIVATE / WORKSPACE chat | Conversation, Message, AiGeneration, HTTP, thin chat UI | `docs/32` | **Есть.** Записи в старом `docs/34` «chat отсутствует» устарели |
| Фоновые chat jobs | Outbox, BullMQ, `chat-worker` | `docs/15`, `docs/32` | Есть, но выявлены критические гонки и маршрутизация |
| Документы и extraction | Upload, download, `DocumentExtraction`, extract worker TXT/DOCX/PDF | D-017, D-025, D-030/031 | Есть тонкий parser; citation-grade extraction **нет** |
| Immutable DocumentVersion / parser representation | **Нет** | `docs/33`, новые extraction/evidence контракты | Критическая предпосылка Phase 6 |
| FTS, chunk, embedding, pgvector index, RRF | **Нет** | `docs/17`, `docs/33`, `docs/ai/retrieval/*` | Архитектура описана, поиска ещё нет |
| Reranker / Cross-Encoder | **Нет** | Кандидат после benchmark | Не блокирует 6A; можно отложить |
| AI source citation / claim support | `ContextSnapshot`, `MessageSource` только `conversation_message` | Новые Evidence/Claim/Applicability контракты | Provenance scaffold ≠ юридическая проверка цитат |
| Legal sources / temporal legal research | **Нет корпусного коннектора/индекса** | `docs/18`, `docs/ai/retrieval` | O-006 остаётся OPEN; юридическую актуальность пока не обещать |
| Evaluation | Unit/e2e ACL + dev tests | Отдельный большой Evaluation Framework | Нет исполняемого retrieval benchmark с размеченным corpus |
| Реальный внешний AI | **Нет; только SyntheticAIProvider** | D-012, D-015, O-002 | Так и должно оставаться до compliance gate |

Обнаруженная проблема управления состоянием: `docs/34-phase5-6-code-and-design-audit.md` описывает снимок от 10.11.2026 и поэтому **не должен использоваться Cursor как текущий список отсутствующих моделей Chat**. `docs/26` от 13.11.2026 ближе к актуальному состоянию архива.

---

## 3. Критические подтверждённые дефекты кода

### CODE-01 · P0 · Два специализированных Worker конкурируют за одну очередь BullMQ

**Доказательство (КОД):** `apps/api/src/queue/ai-jobs.queue.ts` объявляет единственную очередь `ai-jobs`. `apps/api/src/worker/extract-worker.ts` создаёт `new Worker(AI_JOBS_QUEUE, ...)` и при несовпадении `aiJob.type !== 'document.extract'` просто `return`. `apps/api/src/worker/chat-worker.ts` слушает **ту же** очередь, а при `type !== 'chat.generate'` также просто `return`.

**Сценарий:** одновременно запущены оба обработчика. `chat-worker` получает из общей очереди `document.extract` → возвращает успешно, не извлекая текст. Для BullMQ это завершённое задание. Запись в PostgreSQL может остаться `queued`/документ `processing` навсегда. Симметрично `extract-worker` может «съесть» chat job.

**Решение:** для ближайшего среза выбрать **ровно один способ корректного dispatch**:

- единый worker-процесс на `ai-jobs`, у которого `switch(job.name)` вызывает оба специализированных processor и выдаёт ошибку для неизвестного типа;
- либо разные очереди для `document.extract` и `chat.generate` с отдельными consumers (лучше ресурсная изоляция, но две очереди и маршрутизация вместо одной).

Нельзя оставлять два несовместимых consumers общей очереди. `docs/33` рекомендует переиспользовать BullMQ, но это не обязывает сохранять ошибочную маршрутизацию.

**Обязательный тест:** при параллельно работающих extract+chat consumers отправить по 50 заданий каждого типа; все получают ожидаемый terminal outcome и запись результата, ни один job не «completed без выполнения».

### CODE-02 · P0 · Ретрай extraction может потеряться; исключение маскируется под timeout

**Доказательство (КОД):** `apps/api/src/worker/extract-worker.ts:71–90`: `Promise.race([extractDocumentText, timer]).catch(...)` преобразует **любое** rejected исключение в `timed_out`; при обычной ошибке и не исчерпанных attempts PostgreSQL статус переводится в `queued`, затем BullMQ processor **возвращает успех**, не ставя задание повторно. `queue.add` для extraction вызывается только при upload/повторном enqueue (`apps/api/src/documents/ai-jobs.service.ts`), постоянного republisher для extraction нет.

**Последствия:** попытка №1 может не повториться; «таймаут» скрывает первопричину; фактический timeout через `Promise.race` не прерывает тяжёлую синхронную/асинхронную работу парсера. `maxAttempts=3` в БД сам по себе не обеспечивает три выполнения.

**Решение:** явное разделение parser error / timeout / transient storage/queue error; retries через BullMQ `attempts/backoff` **или** PostgreSQL scheduler с lease и повторной публикацией (один источник истины, не две независимые схемы), конечные статусы согласовать с D-011. Для timeout предусмотреть контролируемое прерывание/изоляцию процесса тяжёлого parser; тесты crash/restart, delayed retry, Redis outage, poison file.

### CODE-03 · P0 · Неверное окно истории чата и отсутствие cutoff на исходное сообщение

**Доказательство (КОД):** `apps/api/src/chat/chat-job.processor.ts:109–113`: `orderBy: createdAt asc, id asc`, `take: 50`. PostgreSQL отдаёт **первые** 50 сообщений разговора, а не последние. Для разговора из 100 сообщений модель не видит новые 50. Запрос выбирает историю только при выполнении worker и не ограничивает её моментом/ID `generation.userMessageId`.

**Сценарий:** пользователь отправил A, затем B, пока A ждёт обработки. Worker A может прочитать B и последующие ответы, то есть ответить на другой контекст, хотя generation привязан к A.

**Решение:** server-side `targetUserMessage` cutoff + детерминированный подбор последних N сообщений **до и включая** него (`desc → take N → reverse`), ограничение token budget, привязка ContextSnapshot к конкретному cutoff; определить serial/per-conversation ordering policy.

**Тест:** >50 сообщений, два быстрых сообщения подряд, отложенная очередь, сдвиг createdAt, одинаковые timestamps.

### CODE-04 · P0 · Отмена/дублирующая обработка чата имеет гонку с финальной записью

**Доказательство (КОД):** `apps/api/src/chat/chat-job.processor.ts:29–96` не делает атомарный claim `queued→running`: уже `running` не считается terminal и допускает повторный запуск. После `freshGen` и ACL-проверки worker создаёт snapshot, assistant message и **безусловно** обновляет generation в `succeeded` (`:158–240`). `apps/api/src/chat/chat.service.ts:393–432` может независимо установить `cancelled`.

**Последствие (РИСК с видимой причиной):** cancel успевает между проверкой и транзакционным commit, но worker возвращает `succeeded`; два worker могут повторно запросить модель или столкнуться на unique key, что оставит неочевидный terminal outcome.

**Решение:** `UPDATE ... WHERE status='queued' ... RETURNING`/CAS + lease для единственного владельца job; в одной транзакции проверять terminal/cancel/revocation и публиковать сообщение только при допустимом переходе `running→succeeded`; повторный consumer должен быть no-op; явная политика late cancellation. Не считать «проверили ACL перед запросом» защитой от всех гонок.

**Тест:** отмена непосредственно перед commit, два одновременных процессора, потеря Redis lock, worker crash во время generation.

### CODE-05 · P0 для production · Возможен незаметный переход runtime Prisma на privileged DB URL

**Доказательство (КОД):** `packages/db/src/index.ts:73–77` для `purpose:'runtime'` выбирает `DATABASE_URL_RUNTIME ?? DATABASE_URL ?? DEFAULT_RUNTIME_URL`. Если `DATABASE_URL_RUNTIME` пропал, backend может подключиться под владельцем схемы (`DATABASE_URL` используется как migrator), фактически обходя runtime RLS.

**Решение:** в любом shared/prod окружении **fail at startup**, если отсутствует отдельный runtime URL или runtime identity имеет права владельца/BYPASSRLS; проверить `current_user`, `rolbypassrls`, права и политики; не давать API/worker постоянные migrator credentials. Для bootstrap/миграций — отдельный административный процесс. Наличие `FORCE ROW LEVEL SECURITY` не заменяет проверку привилегий подключения.

**Тест:** старт без runtime URL должен завершиться ошибкой; попытка runtime прочитать чужую организацию должна дать 0 строк даже при ошибочной конфигурации окружения.

### CODE-06 · P1 сейчас, P0 перед реальным AI · Класс данных не определяется по содержимому

**Доказательство (КОД):** `apps/api/src/chat/chat-job.processor.ts:118–124` передаёт реальную строку пользовательского сообщения, но задаёт `dataClass:'synthetic'`; аналогично `apps/api/src/ai/ai.controller.ts`. Текущий `SyntheticAIProvider` **не делает внешних сетевых запросов**: актуальной внешней утечки из этого факта нет.

**Риск:** при замене gateway/провайдера константа `synthetic` будет создавать ложное разрешение передачи D3-контента, несмотря на O-002. Пользовательский чат может содержать реальные клиентские факты даже без прикреплённого документа.

**Решение:** разделить `environmentMode=synthetic` (какой backend вызван) и **серверную data classification / transfer policy** (какое содержание допустимо к провайдеру); для будущего внешнего adapter — fail-closed enforcement D3/O-002 на входе gateway. Пока O-002 OPEN, с текущим Synthetic можно продолжать разработку, но не включать внешнего провайдера простой сменой переменной.

### CODE-07 · P1 · Доступ к удалённым/архивным объектам не доказан status-aware на всех путях

**Доказательство (КОД):** `packages/access/src/workspace.ts:136–169` проверяет владельца/участника, но не `workspace.status`; `apps/api/src/documents/prisma-document-store.ts:59` исключает `deleted` лишь из **list**, тогда как `findById` и download используют чтение по ID без проверки `document.status`. В текущем API физического удаления и полноценного archive/delete workflow ещё **нет**, поэтому это **latентный риск** при добавлении lifecycle, а не доказанная действующая возможность удаления.

**Решение:** для каждого `ACTIVE/ARCHIVED/PENDING_DELETION/DELETING/DELETED` формально зафиксировать `canRead/canSearch/canDownload/canGenerate`, применять один status policy на API, RLS, worker, search и citation resolver. D-019 требует **немедленного запрета** после подтверждённого удаления — не только скрытия из списка.

### CODE-08 · P1 · При переработке extraction перезаписывается исходная доказательная привязка

**Доказательство (КОД):** `packages/db/prisma/schema.prisma` — `DocumentExtraction.documentId @unique`; `apps/api/src/worker/extract-worker.ts:99–120` делает `upsert` с заменой `textContent`. `DocumentVersion`, `ExtractionArtifact`, `TextRepresentation` отсутствуют. В существующем Phase 4 это допустимый scaffold, **но** несовместим с immutable citation requirements Phase 6.

**Решение:** перед chunking/цитированием ввести цепочку `DocumentVersion → ExtractionArtifact → TextRepresentation → SourceBlock/Chunk`, идентификаторы parser/config/hash; старые ссылки никогда не переназначать на latest extraction. Реализовывать отдельно от миграции legal corpus.

### CODE-09 · P1 · Chat provenance сейчас не доказывает цитатную поддержку

**Доказательство (КОД):** `apps/api/src/chat/chat-job.processor.ts:179–223` создаёт `ContextSnapshotItem` и `MessageSource` **для каждого сообщения истории** с `sourceType='conversation_message'`. Нет reference integrity / quote / claim support проверки на этих записях.

**Решение:** до citation-grade реализации показывать их как **трассу контекста** (provenance), не как юридические «источники ответа». Citation key в JSON snapshot не равен подтверждённой цитате; UI не должен обещать пользователю доказательную силу списка `sources`.

### CODE-10 · P1 · Outbox для чата и idempotency требуют race/recovery тестов

**Доказательство (КОД):** `apps/api/src/chat/outbox-publisher.service.ts:56–96` читает `publishedAt:null` без claim/row lock, затем вызывает `queue.add`. Несколько экземпляров publisher могут читать одни и те же строки. `apps/api/src/chat/chat.service.ts` проверяет idempotency перед insert, но не демонстрирует обработку одновременной гонки двух POST с одинаковым ключом как idempotent success (тест только последовательный).

**Решение:** атомарный claim/`SKIP LOCKED` либо optimistic `claimedBy/claimUntil`, dedupe на уровне AIJob и BullMQ; 2 параллельных одинаковых POST должны вернуть один job, а не 500; crash между enqueue и `publishedAt` не создаёт двойной generation. Для extraction требуется такой же recovery-contract.

### CODE-11 · P1 · Безопасность и качество parser пока недостаточны для юридических цитат

**Доказательство (КОД):** `apps/api/src/documents/extract-text.ts` DOCX преобразует `word/document.xml` regex-удалением тегов; формулы/сноски/таблицы/колонтитулы/порядок блоков не имеют гарантированного mapping. Для PDF возвращается только text без точных locators. Ошибки и пределы частично учтены, OCR сознательно не включён по D-031.

**Решение:** реализовывать ранее описанный `Extraction Quality & Parser Contract` как **набор проверяемых parser fixtures**, а не сразу писать универсальный парсер. Если структура не доказана, маркировать `review_required`/`unverifiable`, не публиковать уверенные цитаты. Неполный PDF не должен становиться доказательством отсутствия условия.

**Отдельно:** `Promise.race` без отмены CPU-bound parsing и доверие архивным служебным размерам требуют resource/ZIP-bomb тестов; не делать из текущих защит сертификат безопасности файла.

---

## 4. Контракты: какие разрывы остаются после документов от 16–17 ноября

| ID | Статус после новых документов | Риск / требуемое согласование | Что делать |
|---|---|---|---|
| **CCR-01 / CCR-02** | Есть новый `claim-support-applicability-taxonomy`, но в canonical journal эти enum не закреплены | Runtime/evaluation могут независимо переопределить словарь | Согласовать **один** словарь, затем тестировать mapping; без немедленной Prisma-миграции |
| **CCR-03** | Есть `document-readiness-consistency-decision`, DR-01…DR-09 помечены OPEN | `ready` у Phase 4 не эквивалентен `ftsSearchable`/`citationReady` | Принять семантику status + capabilities, не требовать сейчас все режимы |
| **CCR-04 / CCR-05** | Есть `extraction-eligibility-immutable-evidence-binding` | Отчёт качества, eligibility, immutable representation описаны, но не реализованы | Свести к executable fixtures и одной source binding chain |
| **CCR-06** | **Не закрыт отдельным полным контрактом** | Nullable `sourceVersionId/sourceSnapshotId/documentVersionId/chunkId` допускают невозможные сочетания | `EvidenceReference` сделать discriminated union по sourceKind; source-specific required fields |
| **CCR-07** | ACL contract качественно описывает **user documents** | Legal/public/licensed/court sources используют другие entitlement rights | Отдельная source authorization policy на resolver/preview/context; O-006 не закрывать |
| **CCR-08 / CCR-11** | Evaluation и ACL contracts описаны | Нет исполняемого harness для `valid_with_limitations`, `unverifiable` и ID-based leakage на каждом stage | Один baseline runner, один security hard-gate 0 leakage |
| **CCR-09** | Manifest в `docs/28`; уточнения во многих новых документах | Неоднозначно, что такое build **одного документа** и generation **всего корпуса** | Единый ID/manifest/active pointer и чёткий уровень scope |
| **CCR-10** | Temporal координаты уже хорошо разведены в `docs/ai/retrieval/06` | `retrievedAt` по ошибке могут использовать как дату вступления нормы в силу | Отдельный typed temporal context; `unknown` не конвертировать в «сегодня» |
| **CCR-12** | Несколько отраслевых enum описаны | `failed`, `unsupported`, `not_assessed`, `unverifiable` смешиваются | Короткая outcome matrix между стадиями; **не** один суперенум |

### 4.1. Новая логическая неточность в контрактах: поколение индекса и representation

В `2026-11-17-extraction-eligibility-immutable-evidence-binding.md` встречается абсолютная формулировка «все chunks generation происходят из одной ... representation» / «generation не смешивает chunks разных representations». Для corpus-wide generation это **неверно**: один индекс организации неизбежно содержит разные файлы и разные representations.

**Корректный инвариант:** **в пределах одной generation для каждой конкретной `DocumentVersion` используется один явно выбранный `ExtractionArtifact/TextRepresentation`**, если специальный multi-representation build policy не утверждён. При этом corpus generation может содержать много `DocumentVersion` и `TextRepresentation`. Источники должны явно ссылаться на нужный representation. Это согласуется с `docs/28` и разграничением scope в CCR-09.

Не стоит переносить исходную абсолютную формулировку в БД/валидаторы: иначе multi-document index окажется логически невозможен.

### 4.2. Новый минимальный source identity contract (CCR-06, только recommendation)

Требуется **не** ещё одна огромная универсальная схема, а типизированный минимальный envelope:

```ts
type EvidenceOrigin =
  | { kind: 'user_document'; organizationId: string;
      documentId: string; documentVersionId: string;
      extractionArtifactId: string; representationId: string;
      representationHash: string; locator: SourceLocator }
  | { kind: 'legal_primary_source' | 'court_source';
      sourceRegistryId: string; scopedExternalIdentity: string;
      immutableSourceSnapshotId: string; locator: SourceLocator }
  | { kind: 'licensed_secondary_source' | 'secondary_publication';
      sourceRegistryId: string; editionOrSnapshotId: string;
      rightsDecisionId: string; locator: SourceLocator }
  | { kind: 'system_fact'; factType: string;
      immutableFactRef: string; capturedAt: string };
```

`chunkId` и `indexGenerationId` допустимы **дополнительно** для retrieval provenance, но не заменяют source identity. Для legal sources внешний ID должен быть scoped по provider/jurisdiction/authority, а запись без проверенного snapshot не может тихо становиться citation-grade. Перед content resolution всегда повторно проверять source-specific authorization.

Это **не утверждённое API/Prisma DTO** и **не закрывает O-006**. При реализации сначала сделать 6–10 type-validation tests на невозможные сочетания IDs.

### 4.3. Не переоткрывать то, что уже решено

- **D-018:** PostgreSQL FTS + pgvector. `ts_rank` не равен BM25; ParadeDB — только сравнительный эксперимент, не второй обязательный движок.
- **D-012 / D-015 / O-002:** Synthetic provider до compliance; выбор local Qwen для разработки не разрешает внешнюю передачу клиентских данных.
- **W-005 / D-006 / D-007:** Org Admin не читает контент автоматически; только scoped approved grant.
- **D-028:** invite TTL 72 часа (O-011 закрыт).
- **D-029:** EDITOR удаляет только свои объекты (O-013 закрыт).
- **D-031:** сканы до согласования OCR завершаются ошибкой; это сознательное ограничение, не «дыра».
- **D0–D4:** security-классификация уже согласована; C0–C4 ненормативна. Не объявлять этот конфликт вновь открытым.
- **O-012:** модель второго подтверждения удаления TEAM Workspace всё ещё открыта.

---

## 5. Аудит алгоритмического стека RAG: что действительно нужно для MVP

| Слой | Наша текущая позиция | Вердикт | Контроль качества |
|---|---|---|---|
| Source/version/provenance | DocumentVersion + immutable representation | **Обязателен до FTS** | смена parser не ломает старую citation identity |
| Parser + structure | TXT/DOCX/PDF, Structure-Aware | Начать с достоверных блоков; не обещать полный OCR | coverage, bad tables, locators, false completeness |
| Exact lookup | реквизиты, номера пунктов, цитата/фраза | **Реализовать рано**, особенно для юристов | exact identifier accuracy и wrong-source rate |
| Lexical | PostgreSQL FTS (`russian` + тесты) | **Phase 6A baseline** | Recall@K/nDCG и разбор русской морфологии |
| Chunking | Structure-Aware + ограниченный Parent–Child | **Кандидат**, FILE-009 остаётся OPEN | сравнение с fixed-size на том же корпусе |
| Embedding | Qwen3-Embedding-0.6B локально как dev candidate | **Прототип**, Gate B ещё OPEN | quality/latency/dimensions/revision и data policy |
| Vector | pgvector; exact на малой выборке, HNSW при масштабе | Вторая итерация, после Gate B | exact vs ANN recall delta, p95, memory |
| Fusion | RRF | Разумный простой baseline после двух каналов | сравнение FTS vs vector vs RRF |
| Parent expansion | top-child → ограниченный parent | Полезно для условий/исключений, но budget-gated | missing-exception rate, token use |
| Reranking | Qwen3-Reranker-0.6B / Cross-Encoder | **Отложить**, пока нет измеренного выигрыша | nDCG/Recall и p95/$ с/без |
| Legal applicability | version + temporal + facts + review | Отдельный этап после O-006 и экспертных кейсов | wrong-version/unknown-as-false hard failures |
| Claim support | reference integrity → claim support → applicability | Правильное разделение; **не запускать всё в первом релизе RAG** | false-support, unknown/refusal, traceability |

**Важный анти-паттерн:** нельзя называть продукт «юридически точным» только потому, что выбран более мощный embedding или reranker. Первичный источник, дата редакции, источник правоотношения и целостность locator важнее 1–2 пунктов nDCG.

### 5.1. Минимальный benchmark, который пора исполнять, а не описывать

Для первого CI baseline достаточно **30–50 тщательно размеченных синтетических/разрешённых кейсов**, расширяемых к 100–300 по мере появления реального корпуса:

1. 8–10 exact identifiers/quotes (номера статей, пунктов, дел).
2. 8–10 русскоязычных перефразировок и склонений.
3. 8–10 отрицания/исключения/таблицы/условия.
4. 5–8 multi-document и no-answer/abstention.
5. 5–8 ACL / revoked / deleted / PRIVATE / cross-org hard gates.

Числа — предложение объёма *первого рабочего набора*, не продуктовый стандарт качества. Temporal/legal-corpus suites нельзя объявлять успешно пройденными до доступа к допустимым источникам O-006. Записывать для каждого case ожидаемую **версию/locator**, не только «похожий ответ». Первые прогоны: `exact+FTS`, затем `FTS+vector`, `+RRF`, потом опционально `+parent`, `+reranker`.

**Release hard gates:** ноль утечек на stage boundaries, ноль придуманных citation IDs, отсутствие ложного подтверждения неполного/непрочитанного документа, отсутствие тихой подмены даты или версии; численные quality thresholds принимать **до** финального сравнения, а не задним числом.

---

## 6. Что ещё закрыто только на бумаге (production gates)

| Область | Почему это реально блокирует | Владелец решения / следующий шаг |
|---|---|---|
| O-002 внешняя обработка D3 | Конфиденциальность клиентских данных, договоры/передача/субпроцессоры | юридическая/compliance проверка, шлюз policy enforcement |
| O-003 РФ инфраструктура | Файлы, БД, индексы, логи, бэкапы и AI-инференс должны пройти data-flow inventory | хостер/архитектор инфраструктуры |
| O-006 правовые источники | Без источника и прав нельзя строить достоверную «базу законов/судов» | source registry + тестовый юридически разрешённый корпус |
| O-005 D3 retention и legal hold | Нельзя корректно удалять derived evidence/index без политики | владелец продукта + security/legal |
| O-012 TEAM Workspace double confirmation | Delete workflow невозможно завершить безопасно без субъекта второго подтверждения | владелец продукта |
| Gate B / FILE-009 | Vector dimensions и parser/chunking на реальном юридическом корпусе не подтверждены | benchmark, затем decision-log |
| O-007 лимиты, p95, стоимость | 40 одновременно активных пользователей и бюджет требуют измерения worker/embedding/RAG capacity | нагрузочный тест + бюджетная матрица |
| Admin grant, delete journal, restore drill | D-006/007/019/020/022 уже согласованы, но важные функции не реализованы | отдельные implementation slices + failure tests |

Это независимые входные ворота: **Phase 6A на синтетических материалах может идти до O-002/O-006**, но нельзя объявлять production-ready внешний legal research или внешнюю AI-обработку реальных документов.

---

## 7. Что делать в следующем цикле: прагматичный план

### Срез S0 — исправить надёжность уже работающего MVP (первый приоритет)

1. **CODE-01**: единый BullMQ dispatch либо разнести по очередям — обязательный тест смешанной нагрузки.
2. **CODE-02**: extraction retry/timeout/error taxonomy + requeue recovery; убрать потерянное `queued`.
3. **CODE-03/04**: правильный cutoff истории, единственный claim chat job, атомарная cancel/finalization политика.
4. **CODE-05**: запрет runtime DB fallback на migrator credentials в shared/prod.
5. Добавить regression tests для всех четырёх сценариев, включая crash/restart. Существующий код и решения не маскировать красивым RAG-демо.

**Definition of done:** 100% jobs в тестовой смешанной нагрузке переходят в ожидаемый terminal state; повтор/отмена не публикуют лишний ответ; долгий чат использует последние релевантные сообщения; ошибка DB config не отключает RLS.

### Срез S1 — единый узкий контракт для user-document search

1. `DocumentVersion` и безопасный migration/backfill (без выдуманных доказательств происхождения старых записей).
2. `ExtractionArtifact/TextRepresentation` + hash + проверяемые source blocks/locators.
3. Outcome/quality/eligibility gates из контрактов от 17 ноября, применённые к реальным parser fixtures.
4. `Document.status` отдельно от `ftsSearchable` и `citationReady`; policy для delete/revoke/archive.
5. Одноуровневый `IndexBuild/manifest` в начале, без обязательной корпусной blue-green инфраструктуры.

**Definition of done:** тот же документ повторно разобран другим parser → старый source locator либо точно разрешается в прежнюю representation, либо честно `unavailable`, но никогда не «переезжает» на новую.

### Срез S2 — полезный FTS без дорогостоящих моделей

1. Parser fixtures + минимальный golden set (выше).
2. PostgreSQL Russian FTS + отдельный exact identifier path.
3. Простое structure-aware chunking; сравнить с fixed-size baseline — **решить FILE-009 по метрикам**.
4. SQL prefilter ACL/RLS, version/status/tenant scope, `LIMIT`, budget, negative tests.
5. Server-validated source locator в UI; `no result` ≠ «в договоре условия нет».

**Definition of done:** юрист может найти конкретное положение и открыть то место **разрешённого собственного документа**, из которого взят фрагмент; чужие и удалённые материалы не попадают ни в candidates, ни в context.

### Срез S3 — Hybrid RAG, если baseline измерен

1. Подтвердить Gate B: Qwen3-Embedding-0.6B или лучший по тестам кандидат, фактические dimensions/model revision/instruction profile.
2. Построить embeddings под фиксированную generation; сравнить pgvector exact и HNSW.
3. Добавить RRF поверх ACL-safe FTS/vector candidates.
4. Измерить качество и стоимость; только потом решить, нужен ли Cross-Encoder reranker.

**Definition of done:** измеренный прирост над FTS baseline и документированный предел p95/VRAM/стоимости; не считать локальный выбор Qwen окончательным production deployment решением.

### Срез S4 — Legal Research как отдельный track

После O-006: разрешённый Source Registry, scoped source identity (CCR-06/07), official vs secondary distinction, temporal fixtures, экспертная проверка. **Не смешивать** эти модели с `DocumentVersion` пользователя через nullable-таблицу из десяти optional IDs.

---

## 8. Что сознательно не делать сейчас

- Не выбирать ParadeDB/BM25 и PostgreSQL FTS как два обязательных production движка. Сравнивать только при плохом lexical baseline.
- Не строить графовую БД, универсальный legal rule engine, semantic chunking, многоуровневую агентную оркестрацию и сложный blue-green индекс до появления конкретных сценариев и метрик.
- Не реализовывать Cross-Encoder и query rewriting, пока простой FTS/exact/parent baseline не работает и не измерен.
- Не делать «суммарный AI-quality score», скрывающий ACL leakage, неверную редакцию или недостоверную цитату.
- Не выпускать 5–10 новых документационных пакетов без хотя бы одного исполняемого контрактного теста на пакет.
- Не переводить OPEN в CONFIRMED по формулировке старого чата или наличию кода: status authority — `docs/decisions-log.md`.

---

## 9. Таблица решений, которые стоит согласовать с владельцем продукта

| ID этого отчёта | Вопрос | Рекомендация | Блокирует |
|---|---|---|---|
| AUD-01 | Как устранить конкуренцию специализированных consumers? | Сначала **единый dispatcher** в одной очереди; отдельные очереди лишь если нужна независимая масштабируемость | S0 |
| AUD-02 | Можно ли считать сообщение пользователя `synthetic`, если режим провайдера synthetic? | **Нет.** Режим исполнения и классификация содержимого — разные вещи | внешний AI |
| AUD-03 | Какое окно истории генерирует ответ? | Сообщения **до target userMessage включительно**, последние в token budget; не брать будущие сообщения | S0 |
| AUD-04 | Что означает `Document.ready`? | Phase 4 base processing завершён; поиск/citation — отдельные capabilities | S1/S2 |
| AUD-05 | Требовать ли полное автоматическое claim+applicability доказательство от первого RAG? | **Нет.** Сначала deterministic reference integrity и прозрачный source/citation UI | S2 |
| AUD-06 | Каков инвариант generation? | Одна selected representation **на DocumentVersion внутри corpus build**, а не одна representation на весь corpus | S1/S2 |
| AUD-07 | Нужен ли Cross-Encoder в первом рабочем поиске? | **Нет до benchmark**, даже если локально помещается на RTX 3060 | S3 |
| AUD-08 | Нужен ли отдельный CCR-06 specification? | Короткий source-kind discriminated DTO + tests; лучше включить при S1/S4 без очередного большого документа | S4 |

Эта таблица — предложения, не новые `D-*` решения. Критические исправления CODE-01/02/03/04/05 не требуют ждать утверждения всей RAG-концепции: их дефекты проверяемы независимо.

---

## 10. Минимальный перечень acceptance/regression тестов

| Тест | Где | Желаемое свойство |
|---|---|---|
| T-QUEUE-01 | BullMQ integration | Одновременно chat+extract consumers не теряют «чужие» jobs |
| T-QUEUE-02 | Extract worker | Transient error → повтор с backoff; окончательная ошибка → terminal |
| T-QUEUE-03 | Extract worker | Parser exception не превращается в `timed_out` |
| T-CHAT-01 | Chat processor | 100 сообщений → последние до target, не первые 50 |
| T-CHAT-02 | Chat processor | Сообщение B после A не входит в A ContextSnapshot |
| T-CHAT-03 | Chat + DB | Cancel vs publish race → одно допустимое terminal outcome |
| T-CHAT-04 | Chat + DB | Два worker/два одинаковых POST → один generation и один assistant reply |
| T-RLS-01 | Startup + DB | Нет отдельного runtime role → startup fail, а не privileged fallback |
| T-DATA-01 | AI Gateway | D3 client text не получает внешнего transfer authorization по метке synthetic-mode |
| T-DOC-01 | Lifecycle | PENDING_DELETION/DELETED запрещают get/download/retrieval и чтение цитат |
| T-EXTRACT-01 | Parser fixtures | Заголовки/таблицы/сноски: loss виден в quality report, не молчаливый `pass` |
| T-EVIDENCE-01 | Representation | Parser v2 не переадресует цитаты parser v1 |
| T-EVIDENCE-02 | Evidence DTO | user_document без DocumentVersion или legal source без snapshot → reject |
| T-SEARCH-01 | SQL + RLS | No cross-org / cross-workspace / PRIVATE leak до reranker/context |
| T-SEARCH-02 | Retrieval benchmark | Exact/FTS против vector/RRF; метрики и run manifest воспроизводимы |

---

## 11. Финальный независимый вывод

1. **Архитектурная мысль продвинулась дальше реализации.** Это нормально на данном этапе, но дальнейшее «углубление» полезно только когда оно устраняет конкретную ошибку, создаёт тест или закрывает блокер кодового среза.
2. **Самая опасная подтверждённая проблема сейчас — маршрутизация двух worker на одной очереди**, за ней — ретраи extraction и состояние chat generation. Их следует исправить до работ над RAG.
3. **Следующий значимый продуктовый результат — не новая LLM, а trustworthy retrieval по собственному документу**: точный фрагмент, номер/пункт, дата/версия, проверяемая ссылка и отсутствие чужих данных.
4. **Legal Research по законам и судебной практике — отдельная сложность.** Без O-006, source provenance и temporal validation красивый ответ модели будет создавать больше юридического риска, чем пользы.
5. **Не рекомендую сейчас создавать новый большой пакет документации.** Этот интегральный аудит + короткий CCR-06 type contract, если нужен для S1/S4, достаточны. Следующий цикл должен быть code-first и test-first; существующие файлы можно позднее обновлять точечно по согласованию с владельцем.

**Граница подтверждения:** все рекомендации выше остаются предложениями; решения уровня D/W/O сохраняются такими, какими они записаны в текущем `docs/decisions-log.md`. Никакие существующие файлы проекта этим аудитом не изменялись.

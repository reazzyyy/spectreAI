# Document Readiness Lifecycle Contract

**Статус:** PROPOSED — алгоритмический контракт для согласования.  
**Дата:** 2026-11-17  
**Область:** пользовательские документы (Document) и их подготовка к AI-операциям / RAG.  
**Тип документа:** новый addendum. Не заменяет и не редактирует существующие документы.

## 1. Цель и проблема

Документ должен иметь однозначное состояние готовности. Успешная загрузка файла, успешное извлечение текста и доступность в поисковом индексе — разные события. Их нельзя представлять одним неразличимым `ready`.

В текущем коде `DocumentsService.uploadOne()` создаёт `Document` со статусом `uploading`, сохраняет бинарный объект, переводит запись в `uploaded` и ставит extraction job. `extract-worker.ts` после успешного извлечения создаёт/обновляет `DocumentExtraction`, затем переводит `Document.status` в `ready`. Индексация RAG в текущем коде ещё не реализована.

Это поведение не обязательно является ошибкой для текущего Phase 4 thin extraction: `docs/13` определяет `ready` как завершённую обработку и доступность поддерживаемых операций. Но оно станет неоднозначным, если тот же `ready` будет трактоваться как «документ полностью searchable» после появления Phase 6.

**Цель контракта:** сохранить понятный жизненный цикл для UI и API, но не позволить retrieval использовать неполный, устаревший или невалидированный результат обработки.

## 2. Нормативные принципы

1. **Не смешивать статусы разных сущностей.** `Document`, `DocumentExtraction`, `IndexBuild` и `AIJob` описывают разные жизненные циклы.
2. **`Document.status` — агрегированное продуктово-операционное состояние**, а не зеркало последней фоновой задачи.
3. **Search eligibility — отдельное проверяемое условие.** Наличие extraction не означает наличие поискового индекса.
4. **Retrieval работает только с явно активной и валидированной index generation.** Не с «последним созданным» набором chunks.
5. **Неудача новой обработки не должна молча портить предыдущий валидный результат.** Для версионированных документов сохраняется последняя пригодная версия согласно политике current-version.
6. **Каждый переход идемпотентен и защищён от гонок.** Повторная доставка job не должна откатывать состояние или активировать устаревший результат.
7. **Статусы не заменяют ACL.** `ready` не даёт пользователю права читать документ или использовать его в retrieval.
8. **Нельзя расширять смысл существующего `ready` без согласования API/UI и миграционного плана.**

## 3. Разделение состояний

### 3.1. Document — агрегированное состояние

Существующий enum в Prisma уже содержит:

- `uploading`
- `uploaded`
- `processing`
- `ready`
- `processing_failed`
- `archived`
- `deletion_pending`
- `deleted`

Предложение: не добавлять в `DocumentStatus` отдельные `extracting`, `chunking`, `embedding`, `indexing`, `searchable` и аналогичные значения. Это приведёт к разрастанию общего enum и смешению бизнес-состояния с внутренней реализацией pipeline.

Сохранить текущие значения, но уточнить агрегатную семантику перед включением Phase 6:

| Document.status | Предлагаемое значение |
|---|---|
| `uploading` | Запись создана, но сохранение исходного бинарного файла ещё не подтверждено |
| `uploaded` | Исходный файл надёжно сохранён и зарегистрирован; обработка ещё не началась или ожидает запуска |
| `processing` | Выполняется хотя бы один обязательный этап обработки, необходимый для текущего продуктового readiness profile |
| `ready` | Все обязательные для текущего readiness profile этапы завершены, проверены и доступны для поддерживаемых операций |
| `processing_failed` | Обязательный этап завершился терминальной ошибкой; документ не удовлетворяет readiness profile |
| `archived` | Документ исключён из обычного использования по продуктовой политике |
| `deletion_pending` | Идёт контролируемое удаление и зачистка производных данных |
| `deleted` | Удаление завершено в рамках retention/deletion policy; запись может оставаться как tombstone, если это требуется аудитом |

`ready` не должен навсегда означать «есть vector embedding». Пока Gate B / embedding provider не закрыт, допустим профиль `fts_searchable`: документ может быть доступен для лексического поиска без векторного канала. Но профиль и доступные capabilities должны быть явными.

### 3.2. Состояния этапов обработки

Каждый этап должен иметь собственный статус и provenance. Минимальный концептуальный набор:

| Stage | Возможные состояния | Успех означает |
|---|---|---|
| File validation / security scan | `pending`, `running`, `succeeded`, `failed`, `not_required` | Файл прошёл обязательные проверки по утверждённой политике |
| Extraction | `pending`, `running`, `succeeded`, `failed`, `timed_out`, `not_supported` | Получен результат extraction, удовлетворяющий quality gate |
| Structural parsing | `pending`, `running`, `succeeded`, `failed`, `not_required` | Структура/locators построены и прошли проверки |
| Search indexing | `pending`, `running`, `succeeded`, `failed`, `not_required` | Создана и валидирована generation с нужными каналами |

Это концептуальные статусы этапов, а не требование немедленно создать четыре новые Prisma-модели. Физическое хранение может быть в `DocumentExtraction`, `AIJob`, `IndexBuild` и отдельных result records. Не следует использовать один `AIJob.status` как единственный источник всех этих фактов.

### 3.3. Readiness profile

Readiness должен определяться не одним универсальным булевым флагом, а версионированным профилем возможностей. Примеры:

- `downloadable`: оригинал сохранён и доступен по ACL;
- `extractable`: extraction успешно завершён;
- `fts_searchable`: активная index generation прошла проверки FTS;
- `hybrid_searchable`: активная generation содержит FTS и совместимые embeddings, а оба канала прошли проверки;
- `citation_ready`: retrieval evidence имеет устойчивые source locators, позволяющие сформировать проверяемые ссылки на оригинал.

Профили — предлагаемая терминология. Не создавать их как пользовательский тарифный механизм. Конкретный MVP profile должен быть зафиксирован в implementation plan Phase 6.

## 4. Главный инвариант Searchable

Документ/версия может участвовать в retrieval только если одновременно истинны все условия:

1. `Document` не находится в `archived`, `deletion_pending` или `deleted`.
2. Пользовательский запрос прошёл актуальную ACL-проверку; организация/workspace/document scope вычислен сервером.
3. Выбрана допустимая версия документа (для обычного поиска — текущая версия согласно утверждённой политике).
4. Исходный объект и checksum соответствуют сохранённым metadata; версия не была заменена или признана повреждённой.
5. Extraction завершён успешно и относится к этой версии документа.
6. Extraction прошёл обязательные quality gates; отсутствие текста, подозрительно неполный текст или неподдерживаемый формат не маскируются как успех.
7. Chunk/structure outputs принадлежат той же версии и конкретной index generation.
8. Generation имеет статус `active` (либо иной явно разрешённый статус для shadow evaluation; shadow results не должны попадать в пользовательский ответ).
9. Generation прошла validation: counts, offsets/coverage, checksums, dimensions, FTS/vector consistency — применимые проверки для выбранного profile.
10. Все retrieval channels применяют ACL, version, generation и eligibility predicates до выдачи кандидатов.

Наличие `Document.status = ready` само по себе недостаточно для retrieval. И наоборот, retrieval не должен самостоятельно выводить готовность из наличия chunks или embeddings.

## 5. Рекомендуемая последовательность обработки

```text
Upload request
  -> Document(uploading)
  -> private object storage PUT
  -> verify stored object / checksum
  -> Document(uploaded)
  -> enqueue extraction (durable DB job + queue delivery)
  -> Document(processing)
  -> Extraction
  -> extraction quality gate
  -> structural parsing + locators
  -> chunk generation
  -> FTS build
  -> optional embeddings (only if provider + data policy allow)
  -> index generation validation
  -> atomic activation of generation
  -> Document(ready)
```

Уточнения:

- Security scan должен быть включён в цепочку в соответствии с утверждённой политикой. Нельзя считать его выполненным только потому, что соответствующий этап отсутствует в текущем коде.
- До внедрения Phase 6 текущий pipeline может завершать `Document` в `ready` после extraction, если это соответствует текущему API-контракту. После внедрения Phase 6 нужно явно решить, означает ли `ready` готовность только к поддерживаемым операциям extraction или к поиску по выбранному readiness profile.
- Предпочтительная семантика после запуска RAG: `ready` означает удовлетворение базового продуктового профиля, включающего выбранный способ поиска. Если нужен отдельный статус «извлечён, но ещё не индексирован», его следует показывать через processing details, а не вводить много глобальных enum values.

## 6. Когда запускать Document.status transitions

### 6.1. Upload

- `uploading` устанавливается до записи бинарного файла.
- `uploaded` устанавливается только после успешного завершения storage PUT и проверки, что объект существует и его размер/checksum согласуются с upload metadata.
- Если storage PUT или финализация DB не удались, запись/объект обрабатываются компенсирующей операцией и orphan reconciliation. Нельзя показывать `uploaded`, если бинарный файл не сохранён.
- Job создаётся как durable DB record. Redis/BullMQ — механизм доставки, а не единственный источник факта, что обработка должна состояться.

### 6.2. Processing

`processing` устанавливается при наличии обязательной обработки, которая действительно запланирована/выполняется. Не переводить статус в `processing` до durable job creation, иначе возможен документ, который бесконечно «обрабатывается», но не имеет задания.

Если DB job создана, но публикация в Redis не удалась, job должна оставаться обнаружимой и повторно публикуемой dispatcher/reconciler. Это отдельный operational requirement; не считать, что сама запись `queued` автоматически будет исполнена.

### 6.3. Ready

`ready` выставляется только после:

1. успешного завершения всех обязательных этапов текущего readiness profile;
2. успешной validation;
3. атомарной фиксации ссылки на активную generation (если профиль включает поиск);
4. проверки, что job всё ещё относится к актуальной версии/config generation и не отменена/не superseded;
5. commit состояния и результата в согласованной транзакции либо через безопасный activation protocol.

Нельзя выставлять `ready` сразу после записи `DocumentExtraction`, если для выбранного профиля обязательна индексация.

### 6.4. Processing failed

Терминальная ошибка обязательного этапа приводит к `processing_failed`, если нет другого пригодного результата, который по политике остаётся активным.

Ошибки необязательного канала не должны автоматически переводить документ в `processing_failed`. Например, если MVP разрешает FTS-only profile, недоступность embedding provider может оставить документ searchable по FTS, но hybrid profile не должен считаться готовым.

Состояние должно содержать безопасный `errorCode` и возможность повторной обработки. Не логировать текст документа, prompt, извлечённый контент или embedding payload.

## 7. Версии и повторная обработка

### 7.1. Immutable source version

Phase 6 требует `DocumentVersion` (или эквивалентную immutable source identity). Текущая flattened-модель `Document` + unique `DocumentExtraction.documentId` не поддерживает безопасную историю содержимого.

Новая загрузка/замена файла должна создавать новую версию, а не перезаписывать binary или extraction текущей версии. Extraction, chunks, embeddings и index generation должны быть привязаны к `documentVersionId`.

### 7.2. Reprocessing без новой source version

Повторный запуск extraction/parser/chunker на том же source version создаёт новую processing revision или generation. Он не должен перезаписывать предыдущий успешный результат до успешной валидации нового.

Каждый build фиксирует:

- source version ID + source checksum;
- extractor ID/version/config hash;
- parser/normalization version;
- chunker version/config hash;
- embedding profile/model revision (если используется);
- search config version;
- build ID и idempotency key.

### 7.3. Stale jobs и гонки

Worker перед записью результата и перед activation обязан проверить, что:

- source version всё ещё существует и не удалена;
- job не cancelled/terminal;
- job относится к ожидаемому source version и pipeline config;
- generation не superseded более новым актуальным build;
- документ не перешёл в `deletion_pending`/`deleted`/`archived` согласно политике.

Старый worker не должен перезаписывать актуальный статус после того, как более новая версия уже активирована. Для защиты использовать compare-and-set/optimistic concurrency или транзакционную проверку generation/version pointer; простой `UPDATE status = ready` без условий недостаточен.

## 8. Retry и очередь

Текущий extraction worker обновляет DB `AIJob` обратно в `queued` при части retryable errors и затем штатно возвращается из BullMQ processor. BullMQ при этом может считать queue job завершённой. В коде на момент аудита не обнаружен гарантированный повторный publisher для этой ветки. Это может оставить DB job в `queued` без фактического queue delivery.

Предлагаемый принцип: выбрать один согласованный retry owner.

**Вариант A — BullMQ owns retry:**
- retryable error выбрасывается из processor;
- BullMQ `attempts` + exponential backoff управляют повторной доставкой;
- DB `AIJob` state синхронизируется с `attemptCount` и терминальным результатом;
- worker не возвращается успешно при retryable failure.

**Вариант B — DB dispatcher owns retry:**
- worker фиксирует retryable failure и `nextAttemptAt`/retry state в БД;
- dispatcher выбирает due jobs и публикует их в BullMQ с идемпотентным delivery key;
- reconciler восстанавливает потерянную доставку;
- BullMQ attempts не конкурируют с DB retry policy.

Не смешивать оба механизма без чёткого разделения. Для проекта, где DB `AIJob` объявлена source of truth, вариант B архитектурно последователен, но требует dispatcher/reconciler. Вариант A проще и допустим, если состояние BullMQ и DB синхронизировано и recovery после Redis outage гарантирован. Это решение требует отдельной реализации/тестирования, не считается подтверждённым данным документом.

Обязательные сценарии: transient storage/DB/provider failure, timeout, max attempts, Redis outage, worker crash до/после commit, duplicate delivery, cancellation, stale job, concurrent retries.

## 9. Сохранение предыдущей готовой версии

Если у документа есть активная версия V1 и загружается V2:

- V2 проходит свой независимый lifecycle;
- пока V2 не прошла обязательные gates, V1 не должна случайно потерять chunks/index;
- момент переключения current version должен быть атомарным и явно отражённым;
- политика должна ответить, продолжает ли обычный retrieval использовать V1 до activation V2 или документ временно исключается из поиска сразу после загрузки V2.

Рекомендуемый default: **blue/green version activation** — V1 остаётся активной, пока V2 не готова, затем указатель current/active version переключается атомарно. Но это безопасно только если продуктовая политика допускает использование прежнего содержимого после загрузки новой версии. Для юридически чувствительных документов может потребоваться немедленная блокировка V1 при заявлении пользователя о замене/отзыве. Это продуктовое решение нельзя принимать только на уровне worker.

## 10. Delete, archive и access revocation

- `archived` исключает документ из обычного retrieval сразу, даже если физическая зачистка выполняется позже.
- `deletion_pending` должен немедленно блокировать новые retrieval candidates и новые processing jobs.
- Все незавершённые jobs должны быть отменены или помечены superseded; worker обязан проверить состояние перед публикацией результата.
- Удаление должно охватывать source binary, extracted text, structure, chunks, FTS rows, embeddings, cache entries и generation references согласно retention/legal hold policy.
- Tombstone/deletion journal сохраняется, если это требуется для аудита и идемпотентности удаления.
- Отзыв доступа не требует удаления документа, но ACL должен применяться на каждом retrieval channel и при чтении evidence. Уже созданный ContextSnapshot требует отдельной политики: он не должен становиться бессрочным обходом отозванного доступа.

## 11. Extraction quality gate

Extraction `succeeded` означает не только то, что библиотека вернула строку. Перед индексацией проверить как минимум:

1. MIME/type и parser outcome соответствуют ожидаемому формату.
2. Исходный файл не пуст и extraction result не пуст, если пустой документ не является допустимым кейсом.
3. Page count и extracted text size находятся в допустимых пределах.
4. Нет признаков неполного/оборванного результата (например, резкое обрезание на configured cap без явного `truncated` state).
5. Для PDF доступны page locators там, где parser заявляет их поддержку; нельзя выдумывать page number для плоского текста.
6. Для DOCX сохраняется необходимая структура таблиц/заголовков/списков либо качество помечается как ограниченное.
7. Source checksum зафиксирован и соответствует версии, из которой извлекали.
8. Extractor version/config сохранены для воспроизводимости.

Quality gate должен возвращать структурированный report: `passed`, `warnings`, `failedChecks`, `coverage/completeness` (если измеримо), `extractorVersion`, `sourceChecksum`. Пороговые значения нельзя назначать произвольно: определить на corpus golden set и поддерживаемых форматах.

Scan-only PDF при текущем D-031 должен оставаться unsupported/failed до закрытия соответствующего OCR decision. Не переводить его в searchable-ready на основании пустого или OCR-непроверенного текста.

## 12. API/UI contract

API должен позволять отличить:

- файл загружен;
- файл обрабатывается;
- extraction завершён;
- документ доступен для поиска;
- обработка завершилась ошибкой;
- документ архивирован/удаляется.

Не обязательно раскрывать все внутренние этапы всем клиентам. Рекомендуется отдельный processing details object, например:

```ts
type DocumentProcessingSummary = {
  documentStatus: DocumentStatus;
  extraction: "pending" | "running" | "succeeded" | "failed" | "timed_out" | "not_supported";
  search: "not_started" | "building" | "searchable" | "failed" | "not_enabled";
  readinessProfile: "extractable" | "fts_searchable" | "hybrid_searchable" | null;
  errorCode?: string;
  updatedAt: string;
};
```

Это пример DTO-контракта, не утверждённая точная схема и не требование выводить названия внутренних моделей в публичный API.

UI не должен обещать «можно искать по документу», пока search state не `searchable`. При этом пользователь может иметь право скачать оригинал до окончания extraction/indexing.

## 13. Набор обязательных acceptance tests

### Upload / storage

- [ ] `uploading` не становится `uploaded`, если storage PUT завершился ошибкой.
- [ ] Размер и checksum сохранённого объекта сверяются с metadata.
- [ ] DB job durable создана до подтверждения processing state.
- [ ] Redis outage не теряет job: dispatcher/reconciler обеспечивает eventual delivery.
- [ ] Повторный upload с одинаковым idempotency key не создаёт неконтролируемые дубли.

### Extraction / quality

- [ ] Успешный TXT/DOCX/PDF extraction сохраняет source version и extractor provenance.
- [ ] Пустой результат, timeout, unsupported format и parser error имеют разные диагностические outcomes.
- [ ] Scan-only PDF не становится searchable.
- [ ] Truncated extraction не проходит quality gate как полноценный результат.
- [ ] Retryable error не оставляет DB job в queued без повторной доставки.
- [ ] Duplicate delivery не создаёт дублирующие extraction revisions.

### Indexing / readiness

- [ ] Extraction success без index generation не удовлетворяет `fts_searchable`.
- [ ] Generation в `building` или `failed` не участвует в обычном retrieval.
- [ ] Только validated + active generation может быть источником retrieval candidates.
- [ ] FTS-only profile не выдаёт себя за hybrid profile.
- [ ] Embedding failure не ломает FTS-only profile, если он разрешён политикой.
- [ ] Несовместимые embedding dimensions/model profiles не смешиваются.
- [ ] Document status не становится ready до выполнения обязательных gates.

### Versioning / concurrency

- [ ] V2 processing failure не повреждает active V1.
- [ ] Устаревшая job V1 не может переписать активный pointer/status после activation V2.
- [ ] Новая generation не становится active до validation.
- [ ] Повторная обработка той же версии создаёт воспроизводимый build identity.
- [ ] Два параллельных build не активируют себя в случайном порядке.

### Delete / archive / ACL

- [ ] `deletion_pending` немедленно исключает документ из retrieval.
- [ ] Worker не публикует результат после удаления/архивации.
- [ ] Archive исключает document/version из обычного поиска.
- [ ] Отзыв ACL исключает результаты независимо от ранее созданного cache.
- [ ] Delete распространяется на derived artifacts и cache по принятой политике.

## 14. Рекомендуемый порядок реализации

1. **Сначала согласовать семантику `ready`.** Не менять enum/API пока не согласованы `docs/13`, текущий UI и API clients.
2. Ввести immutable `DocumentVersion` и version-scoped extraction; выполнить expand-and-contract migration с backfill существующих документов.
3. Ввести явный extraction quality result и source provenance.
4. Ввести `IndexBuild`/generation lifecycle, согласованный с `docs/28`; не создавать вторую manifest system.
5. Реализовать indexing pipeline и validation; только после этого разрешить searchable profile.
6. Добавить atomic activation/current pointer и защиту от stale jobs.
7. Исправить retry ownership и гарантированную повторную доставку.
8. Обновить API/UI processing details после утверждения DTO и обратной совместимости.
9. Прогнать acceptance tests на синтетических и обезличенных материалах; реальные клиентские документы не отправлять внешним провайдерам до выполнения O-002.

Не начинать с добавления новых статусов в enum. Сначала зафиксировать модель состояний и переходов, затем выбрать минимальные физические поля.

## 15. Открытые вопросы для согласования

| ID | Вопрос | Почему нельзя молча решить |
|---|---|---|
| DR-01 | Что означает `Document.status = ready` в API после Phase 6: extraction-ready или готовность к базовому поиску? | Влияет на API/UI и обратную совместимость |
| DR-02 | Какой базовый searchable profile нужен MVP: FTS-only или hybrid? | Gate B / embedding provider пока не закрыт |
| DR-03 | При загрузке V2 продолжает ли V1 обслуживать обычный поиск до активации V2? | Может быть критично для юридически значимого содержимого |
| DR-04 | Какие проверки file security обязательны до extraction/indexing и как они отражаются в состоянии? | Нельзя считать отсутствующий scanner успешным этапом |
| DR-05 | Retry owner: BullMQ или DB dispatcher/reconciler? | Нужна одна непротиворечивая модель доставки |
| DR-06 | Где хранить processing stage outcomes: расширить AIJob metadata, отдельные stage records или специализированные модели? | Важно не смешать job lifecycle с бизнес-состоянием |
| DR-07 | Какие extraction quality thresholds обязательны для MVP форматов? | Пороги должны быть измерены на тестовом корпусе |
| DR-08 | Какова политика ContextSnapshot после archive/delete/access revocation? | Ранее собранный контекст не должен обходить текущие права |

## 16. Что этот документ НЕ утверждает

- Не подтверждает существование `DocumentVersion`, `IndexBuild`, chunks или embeddings в текущем коде.
- Не закрывает D-031/OCR, O-002, Gate B, FILE-009 или иные записи decisions log.
- Не утверждает, что FTS-only является окончательным поисковым решением для MVP.
- Не предписывает конкретную физическую Prisma schema или migration.
- Не меняет существующий API и не меняет смысл `DocumentStatus` автоматически.
- Не является security scan specification или legal retention policy.

## 17. Связанные документы

- `docs/13` — текущий документный lifecycle и API requirements.
- `docs/17` — RAG and Knowledge Retrieval.
- `docs/26` — актуальное состояние codebase на дату предыдущего аудита.
- `docs/27–30` — portability, manifest, import/export и validation.
- `docs/33` — Phase 6 RAG implementation specification.
- `docs/ai/retrieval/audits/2026-11-16-stage1-consolidation.md` — findings A-02, A-09, A-10.
- `docs/decisions-log.md` — источник подтверждённых решений; этот addendum его не изменяет.

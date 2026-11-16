# Document Readiness — согласование семантики ready и поисковых capabilities

**Статус:** PROPOSED — требуется явное согласование пользователя.  
**Дата:** 2026-11-17  
**Тип:** новый самостоятельный addendum к алгоритмическим контрактам Stage 2.  
**Область:** пользовательские документы, extraction, quality assessment, indexing, retrieval и UI/API readiness.  
**Не является:** изменением Prisma schema, API DTO, `decisions-log.md`, roadmap или существующих документов.

---

## 1. Решение, которое требуется согласовать

Предлагается зафиксировать четыре независимых уровня:

1. **Document lifecycle** — продуктовый жизненный цикл документа (`uploaded`, `processing`, `ready`, `processing_failed`, `archived`, `deletion_pending`, `deleted` и другие уже существующие состояния).
2. **Processing outcome** — результат обработки конкретной версии и конкретного pipeline run: extraction, parsing, quality assessment, chunking, indexing.
3. **Index generation state** — состояние конкретной сборки индекса и указателя на активную generation.
4. **Capabilities** — проверяемые возможности конкретной версии документа в активной generation: FTS, vector, hybrid, citation locators.

**Главная рекомендация:** `Document.status = ready` не должен зависеть от выбранного клиентом search profile и не должен сам по себе означать, что документ доступен во всех поисковых каналах. Для MVP `ready` означает, что документ прошёл обязательный базовый ingestion pipeline и может использоваться в тех операциях, которые продукт явно объявил доступными. Точная готовность к конкретной операции определяется capabilities и eligibility checks.

При этом нельзя свести `ready` к «файл просто загружен» или «экстрактор вернул success»: это слишком слабый контракт для юридического продукта.

---

## 2. Что уже закреплено в проекте и что нельзя случайно переопределить

Перед подготовкой предложения проверены актуальные документы в предоставленном архиве проекта:

- `docs/13-file-storage-and-document-processing.md`;
- `docs/17-rag-and-knowledge-retrieval.md`;
- `docs/33-phase6-rag-implementation-specification.md`;
- `docs/decisions-log.md`;
- `tasks/phase5-6-gaps.md`.

Из них следуют важные ограничения:

### 2.1. Подтверждённые решения

- **D-018:** целевая поисковая связка MVP — PostgreSQL Full-Text Search + `pgvector`. Это подтверждённая архитектурная цель, а не разрешение включить vector retrieval до готовности embedding provider и Gate B.
- **D-025:** в Phase 4 thin extraction полный извлечённый текст и extraction metadata хранятся в PostgreSQL; оригинал остаётся в object storage. Chunks и embeddings — отдельные срезы.
- **FILE-009:** chunking strategy остаётся OPEN до эксперимента и выбора.
- **Gate B:** embedding model/dimensions и условия использования внешнего embedder остаются блокирующими для vector slice.
- **O-002:** до закрытия условий передачи данных внешнему AI-провайдеру реальные пользовательские документы не отправляются внешнему провайдеру; synthetic provider не подменяет production readiness.

### 2.2. Поэтапная реализация, уже отражённая в Phase 6

`tasks/phase5-6-gaps.md` задаёт последовательность:

- **6A:** DocumentVersion, structure/chunk experiment, FTS;
- **Gate B → 6B:** vector/HNSW/RRF;
- дополнительные rewrite/rerank/MMR — только при подтверждённом метриками эффекте.

Следовательно, нельзя сейчас объявить vector/hybrid capability обязательным условием завершения Phase 6A. Но также нельзя переопределить D-018 и заявить, что FTS-only окончательно заменяет подтверждённую целевую связку MVP.

### 2.3. Нерешённое противоречие

`docs/13` исторически определяет `ready` как завершение обработки и доступность поддерживаемых операций. В текущем thin extraction pipeline это могло означать готовность после extraction. После внедрения Phase 6 такое же значение станет опасно неоднозначным: extraction-ready не равен searchable-ready.

Это предложение устраняет неоднозначность через разделение lifecycle и capabilities, а не через переименование всех статусов.

---

## 3. Нормативная модель готовности

### 3.1. Четыре независимых измерения

| Измерение | На какой объект относится | На какой вопрос отвечает | Примеры |
|---|---|---|---|
| Document lifecycle | Document | В каком продуктовом состоянии находится документ? | `uploaded`, `processing`, `ready`, `archived` |
| Processing outcome | DocumentVersion + pipeline run/stage | Что удалось обработать и с каким качеством? | extraction succeeded, parse review_required, quality failed |
| Index generation | Version + конкретный build | Какая сборка индекса построена и активна? | `building`, `validated`, `active`, `failed`, `superseded` |
| Capabilities | Version + active generation | Какие операции технически и качественно доступны? | `ftsSearchable`, `vectorSearchable`, `hybridSearchable`, `citationReady` |

Ни одно измерение не должно выводиться из другого по косвенному признаку. В частности:

- `Document.status = ready` не доказывает, что существует активная index generation;
- extraction `succeeded` не доказывает, что extraction quality прошёл gate;
- generation `active` не доказывает, что пользователь имеет ACL-доступ;
- `citationReady = true` не доказывает Claim Support или Legal Applicability конкретного утверждения;
- `vectorSearchable = false` не означает, что FTS недоступен.

### 3.2. Предлагаемая семантика `Document.status`

Сохранить текущий enum и не вводить в него этапы реализации (`extracting`, `chunking`, `embedding`, `indexing`, `searchable`).

| Статус | Стабильный смысл |
|---|---|
| `uploading` | Сохранение исходного файла ещё не подтверждено |
| `uploaded` | Оригинал сохранён и зарегистрирован; обязательная обработка ещё не завершена |
| `processing` | Выполняется хотя бы один обязательный этап базового ingestion contract |
| `ready` | Базовый ingestion contract завершён; документ доступен для поддерживаемых базовых операций, а возможности поиска явно отражены отдельно |
| `processing_failed` | Базовый обязательный pipeline завершился терминальной ошибкой и документ не удовлетворяет минимальному ingestion contract |
| `archived` | Документ исключён из обычного использования и retrieval по продуктовой политике |
| `deletion_pending` | Удаление начато; новые операции и retrieval запрещены |
| `deleted` | Удаление завершено с сохранением допустимого audit/tombstone следа |

**Критически важная оговорка:** `ready` — не обещание, что доступны все возможные capabilities. Но `ready` также не может означать, что документ пригоден только для скачивания, если UI/API обещают пользователю поиск по нему. Для каждого релиза список операций, обещанных как базовые, должен быть зафиксирован в release contract.

### 3.3. Не делать `ready` зависимым от request profile

Нельзя вычислять `Document.status` по произвольному profile конкретного запроса, пользователя, тарифного плана или feature flag. Иначе один и тот же документ одновременно окажется `ready` для одного пользователя и `not ready` для другого, хотя `Document.status` — единое поле.

Вместо этого:

- lifecycle — общий для документа;
- capabilities — вычисляются для конкретной версии и активной generation;
- ACL — вычисляется отдельно для actor/resource/action;
- запрос проверяет, что требуемая capability доступна и что actor авторизован.

---

## 4. Capability contract

Предлагается следующий логический DTO (не готовая Prisma schema и не требование хранить все флаги денормализованно):

```ts
interface DocumentCapabilities {
  extractionAvailable: boolean;
  structuredContentAvailable: boolean;
  ftsSearchable: boolean;
  vectorSearchable: boolean;
  hybridSearchable: boolean;
  citationReady: boolean;
}
```

Это не пользовательские разрешения. Это capability/eligibility конкретной версии документа. Сервис может вычислять их из version, extraction artifact, quality report и active generation; persisted snapshot допустим только при наличии механизма консистентной инвалидизации.

### 4.1. Значения capability

| Capability | Минимальные условия |
|---|---|
| `extractionAvailable` | Extraction artifact существует, привязан к правильной DocumentVersion, успешно завершён и доступен для чтения |
| `structuredContentAvailable` | Структурный parse output существует, provenance сохранён, структура прошла базовые consistency checks |
| `ftsSearchable` | Активная generation содержит FTS-представление для допустимых chunks; generation прошла validation; применимы ACL/version/generation predicates |
| `vectorSearchable` | Активная generation содержит embeddings совместимой модели/dimensions; Gate B и data policy разрешают их использование; vector index validation пройдена |
| `hybridSearchable` | И FTS, и vector channels доступны в совместимой active generation/configuration и могут быть безопасно объединены |
| `citationReady` | Evidence может быть привязано к immutable source representation и устойчивым locators с достаточной точностью для UI/API обещаний |

### 4.2. Инварианты

1. `hybridSearchable = true` требует `ftsSearchable = true` и `vectorSearchable = true`.
2. `vectorSearchable = true` требует актуального embedding profile, модели, dimensions и валидной vector generation.
3. `ftsSearchable = true` не требует embeddings.
4. `citationReady = true` не выводится автоматически из `ftsSearchable` или `vectorSearchable`.
5. Ни одна capability не обходит ACL, licensing, data residency, deletion, archive или legal hold policy.
6. Отсутствующая capability должна явно отражаться как unavailable, а не симулироваться synthetic result или fallback без указания.
7. Capability относится к определённой версии и generation. Нельзя переносить `true` с V1 на V2 или с G1 на G2.

---

## 5. Базовый ingestion contract для MVP

### 5.1. Предлагаемый минимум

Для базового ingestion contract предлагается требовать:

1. исходный объект сохранён, checksum/size согласованы с metadata;
2. обязательная file validation/security policy завершена;
3. extraction завершён и артефакт привязан к конкретной версии документа;
4. extraction quality report сформирован;
5. quality outcome не является `fail`;
6. если результат `review_required`, документ может завершить техническую обработку, но его ограничения явно отражаются; автоматическое включение в поиск/цитирование запрещено без отдельной policy;
7. структурные locators создаются и проходят только те проверки, которые требуются для заявленных продуктом операций;
8. ошибки обязательных этапов обрабатываются явно и не маскируются как `ready`.

Это определение не утверждает, что документ уже доступен в FTS/vector. После внедрения Phase 6 `ready` и capability state должны быть показаны отдельно.

### 5.2. FTS и hybrid: не менять D-018

Рекомендация по срезам:

- **Phase 6A:** разрешить `ftsSearchable` после FTS build + validation; vector capability остаётся `false/unavailable`; UI не должен называть этот режим hybrid или semantic search.
- **Gate B / Phase 6B:** после утверждения embedding model/dimensions, data policy и HNSW validation разрешить `vectorSearchable`.
- **Hybrid:** разрешить только после успешной проверки совместной работы FTS и vector channel, fusion и ACL prefilter; не выставлять `hybridSearchable` лишь потому, что оба индекса существуют.

Такой порядок соответствует уже записанной последовательности 6A → Gate B → 6B и сохраняет D-018 как целевую связку PostgreSQL FTS + pgvector.

**Не рекомендую** делать `Document.status = ready` зависимым от hybrid availability. Это заблокирует FTS slice на время решения Gate B и смешает lifecycle с доступностью конкретного поискового канала. Но не рекомендую и рекламировать FTS-only как завершённый hybrid MVP.

### 5.3. Что пользователь видит в интерфейсе

UI должен разделять:

- общий статус документа (загружен / обрабатывается / готов / ошибка);
- понятный результат обработки (например, «текст извлечён», «требуется проверка качества»);
- доступность поиска (например, «поиск по тексту доступен», «семантический поиск пока недоступен»);
- ограничения цитирования (например, «точные ссылки на фрагменты недоступны»).

Не следует показывать пользователю внутренние технические названия `IndexGeneration`, `pipelineRun`, `embedding dimensions`.

---

## 6. Crosswalk: Extraction outcome × quality × eligibility

Технический outcome и качество — разные оси. Нужна явная таблица политики, а не один `success`.

| Extraction outcome | Quality outcome | Ingestion terminal state | FTS eligibility | Vector eligibility | Citation eligibility |
|---|---|---|---|---|---|
| `succeeded` | `pass` | Может стать `ready`, если прочие обязательные этапы завершены | Да, после успешного FTS build/validation | Да, только после Gate B и успешного vector build | Да, только если locators прошли citation gate |
| `succeeded` | `review_required` | Может стать `ready` с ограничением, если это допускает базовый contract; иначе остаётся review-pending | По умолчанию нет до явного policy decision | По умолчанию нет до явного policy decision | Нет, пока не пройдена проверка locators/качества |
| `succeeded` | `fail` | Не `ready` для ingestion profile, требующего usable extracted text; состояние требует исправления/повторной обработки | Нет | Нет | Нет |
| `failed` | отсутствует | `processing_failed` после исчерпания retry policy | Нет | Нет | Нет |
| `not_supported` | отсутствует | Не `ready` для операций, требующих extraction; может быть доступен download/original-only | Нет | Нет | Нет |
| `timed_out` | отсутствует | Retryable/terminal согласно retry policy; не `ready` до разрешения | Нет | Нет | Нет |
| `succeeded` | отсутствует | Не допускать к searchable eligibility: отсутствие quality report не означает pass | Нет | Нет | Нет |

### 6.1. Рекомендация по `review_required`

`review_required` не следует автоматически превращать в `processing_failed`: техническая обработка могла завершиться, но результат требует внимания. Однако нельзя молча включать его в retrieval как полноценный источник.

Рекомендуемая default policy:

- extraction artifact сохраняется;
- пользователь может просмотреть/скачать оригинал и увидеть предупреждение;
- автоматический FTS/vector indexing блокируется до policy decision или ручного подтверждения;
- `citationReady = false`;
- ручное подтверждение должно быть аудируемым и не должно менять исходный quality report;
- если пользователь подтверждает использование, это создаёт отдельное override/review decision с actor, timestamp, scope и reason, а не переписывает quality result на `pass`.

Остаётся OPEN: разрешать ли ручное подтверждение для MVP и кому именно. До согласования — не реализовывать override.

---

## 7. Index generation и атомарная активация

### 7.1. Build lifecycle

Для каждой сборки индекса нужна отдельная generation с независимым состоянием, например:

`queued → building → validating → active`

Терминальные/служебные состояния могут включать `failed`, `cancelled`, `superseded`, `retired`. Точный enum здесь не утверждается.

Generation должна ссылаться на:

- DocumentVersion;
- extraction artifact / parser representation;
- chunking algorithm/version/config;
- FTS configuration/version;
- embedding profile/model revision/dimensions, если vector channel включён;
- index schema/config version;
- source checksum и build manifest;
- validation report.

### 7.2. Активация

Нельзя считать generation активной только потому, что worker закончил запись chunks или embeddings.

Рекомендуемая последовательность:

1. Создать generation в `building`.
2. Записать derived data с привязкой к generation ID.
3. Выполнить validation: counts, duplicate checks, version lineage, locator consistency, FTS presence, vector dimensions/coverage (если применимо).
4. Проверить, что generation не superseded, исходная версия не удалена/архивирована и актуальна согласно version policy.
5. В транзакции атомарно переключить active-generation pointer и пометить generation активной.
6. Только после commit выдавать capability flags, вычисленные по активной generation.

Не должно быть промежутка, когда retrieval видит половину старой и половину новой generation.

### 7.3. Rebuild без потери доступности

При reindexing:

- текущая active generation остаётся доступной, пока новая generation строится и валидируется;
- новая generation не участвует в пользовательском retrieval до атомарной активации;
- при ошибке build старая active generation остаётся активной, если version/security policy не требует немедленной блокировки;
- после активации старая generation становится `retired/superseded` и очищается по retention policy;
- все cache keys включают generation ID и permission version; кэш старой generation инвалидируется или больше не выбирается.

### 7.4. Версии документов: важное исключение

Сохранение V1 во время обработки V2 — не универсально безопасное поведение для юридических документов. По умолчанию blue/green activation удобна и предотвращает downtime, но в случае отзыва, ошибочной загрузки, замены конфиденциального документа или явного запроса «немедленно исключить старую редакцию» прежняя версия должна быть заблокирована немедленно.

Поэтому нужны две отдельные политики:

- **technical activation policy:** новая версия становится active только после успешной сборки;
- **content supersession/revocation policy:** определяет, разрешено ли использовать прежнюю версию в период обработки новой.

Вторая политика остаётся продуктовым OPEN и не должна быть автоматически решена worker-ом.

---

## 8. Eligibility и Authorization — два обязательных gate

Retrieval допускается только при одновременном выполнении:

`Eligible(data, operation) AND Authorized(actor, resource, action)`

**Eligibility** включает:

- корректную DocumentVersion и extraction lineage;
- успешный quality gate для выбранной операции;
- активную валидированную generation;
- наличие нужной capability;
- отсутствие archive/delete/revocation restriction;
- соблюдение версии и temporal policy.

**Authorization** включает:

- tenant/workspace/document ACL;
- действующие grants и permission version;
- licensing/data-source policy, если применимо;
- повторную проверку перед Context Builder и публикацией результата.

Нельзя сохранять единый булевый `searchable/accessible` как замену этим двум проверкам. ACL prefilter применяется внутри каждого retrieval channel до выдачи кандидатов; постфильтрация после объединения результатов недостаточна.

---

## 9. API и UI: требования к контракту

Предлагаемый logical response shape (не финальный DTO):

```ts
interface DocumentReadinessView {
  status: DocumentStatus;
  processing: {
    extraction: 'pending' | 'running' | 'succeeded' | 'failed' | 'not_supported';
    quality: 'pass' | 'review_required' | 'fail' | 'not_assessed';
    indexing: 'not_started' | 'building' | 'validating' | 'available' | 'failed';
  };
  capabilities: {
    extractionAvailable: boolean;
    structuredContentAvailable: boolean;
    ftsSearchable: boolean;
    vectorSearchable: boolean;
    hybridSearchable: boolean;
    citationReady: boolean;
  };
  limitations: string[];
}
```

Точные enum names и shape нужно согласовать с существующими API contracts. Здесь важен принцип, а не буквальная форма.

Требования:

1. Не возвращать `ready` как единственное объяснение доступности операций.
2. Не отдавать клиенту capability flags как разрешение на доступ: сервер всё равно проверяет ACL.
3. UI не должен строить optimistic state «готов к поиску» сразу после upload или extraction success.
4. Временная недоступность vector search не должна превращать весь документ в ошибку, если FTS доступен и релиз явно поддерживает FTS fallback.
5. Fallback должен быть наблюдаемым: в trace/response metadata фиксируется, какие каналы реально использованы.
6. Не показывать `citationReady`, если locators не позволяют открыть соответствующий источник или однозначно локализовать фрагмент в immutable representation.

---

## 10. Ошибки, retries и пересчёт capabilities

- Ошибка необязательного канала не должна автоматически переводить весь Document в `processing_failed`, если базовый contract выполнен и другой явно поддерживаемый канал доступен.
- Ошибка обязательного этапа базового contract должна удерживать документ вне `ready` или переводить в `processing_failed` после исчерпания retry policy.
- Повторный запуск extraction/parser/indexing создаёт новый run/generation или корректно переиспользует idempotent result; нельзя перезаписывать артефакт, на который ссылается активная generation.
- Capability flags вычисляются из согласованного состояния артефактов/generation. При deletion, archive, supersession, revocation, failed rebuild и provider/config migration их доступность пересчитывается.
- Retry policy имеет одного владельца (BullMQ либо DB dispatcher/reconciler) согласно отдельному orchestration contract; `queued` в БД не означает, что задача реально доставлена worker-у.
- Worker обязан проверять source version, deletion/archive state, cancellation и generation supersession перед публикацией результата и activation.

---

## 11. Observability и аудит

Минимально необходимо измерять:

- долю загрузок, дошедших до extraction success;
- долю extraction success с quality pass / review_required / fail;
- долю документов с активной FTS generation;
- долю документов с vector/hybrid capability после Gate B;
- долю документов с citationReady;
- время от upload до extraction ready и отдельно до FTS/vector searchable;
- возраст документов в промежуточных состояниях;
- failed/stale/superseded generation count;
- количество fallback-запросов из hybrid/vector в FTS;
- retrieval запросы, в которых требуемая capability отсутствовала;
- случаи, когда capability snapshot расходится с фактическим состоянием generation.

В аудит не помещать текст документов, полные prompt/response и чувствительные содержательные данные. Логировать идентификаторы, статусы, версии конфигурации и actor/action в соответствии с текущими security rules.

---

## 12. Acceptance tests

### Lifecycle и processing

- [ ] Upload не переводит Document в `ready` до подтверждения хранения оригинала.
- [ ] Extraction success без quality report не даёт searchable eligibility.
- [ ] Extraction `failed` после исчерпания retry policy не даёт `ready`.
- [ ] `review_required` не маскируется под `pass` и не получает автоматический citation eligibility.
- [ ] `not_supported` не отображается как успешная extraction.
- [ ] Повторная доставка job не создаёт дублирующие активные артефакты.
- [ ] Старый worker не может перезаписать статус более новой версии.

### Capabilities

- [ ] FTS capability может быть true при vector capability false.
- [ ] Vector capability false до Gate B/совместимой модели/валидной generation.
- [ ] Hybrid capability невозможно при false хотя бы одной из FTS/vector capabilities.
- [ ] Citation capability невозможно без immutable representation и валидных locators.
- [ ] Capability V1 не переносится на V2.
- [ ] Capability старой generation не используется после activation новой generation.
- [ ] Capability не обходит ACL, archive, deletion, revocation или licensing policy.

### Generation lifecycle

- [ ] Generation `building`/`validating` не видна в обычном retrieval.
- [ ] Generation активируется только после успешной validation.
- [ ] Activation pointer переключается атомарно.
- [ ] Failed rebuild не ломает предыдущую активную generation, если она не была отдельно отозвана.
- [ ] Superseded generation не может быть активирована запоздавшим worker-ом.
- [ ] Retrieval channel фильтрует по active generation до выдачи кандидатов.

### Authorization и UI/API

- [ ] `Document.status = ready` не предоставляет доступ без ACL.
- [ ] API отдаёт capabilities отдельно от lifecycle status.
- [ ] UI различает «обработка завершена» и «поиск доступен».
- [ ] При FTS-only UI не сообщает о доступности semantic/hybrid search.
- [ ] При недоступности citation locators UI не обещает точные ссылки/выделение фрагментов.
- [ ] Revoke access блокирует новые retrieval и повторную выдачу cached result.
- [ ] Delete/archive немедленно исключают документ из новых retrieval, даже если физическая очистка ещё идёт.

---

## 13. Решения, которые предлагается принять

| ID | Предложение | Рекомендация | Статус |
|---|---|---|---|
| DR-01 | Не расширять `DocumentStatus` этапами pipeline | Принять | OPEN |
| DR-02 | Зафиксировать стабильный lifecycle смысл `ready`, независимый от request profile | Принять | OPEN |
| DR-03 | Выделить processing outcome, generation state и capabilities в отдельные измерения | Принять | OPEN |
| DR-04 | В Phase 6A разрешить FTS capability без vector; не называть её hybrid | Принять, соответствует срезам | OPEN |
| DR-05 | Сохранить D-018 как целевую FTS + pgvector связку; vector включать после Gate B | Принять | OPEN |
| DR-06 | `review_required` по умолчанию блокирует автоматическую индексацию и цитирование | Принять как безопасный default | OPEN |
| DR-07 | Использовать generation validation + atomic activation | Принять | OPEN |
| DR-08 | Сохранять предыдущую generation при rebuild, но отдельно решить supersession/revocation старой версии | Принять принцип; policy OPEN | OPEN |
| DR-09 | Отдавать capabilities отдельно в API/UI, не как authorization grant | Принять | OPEN |

---

## 14. Открытые вопросы, которые нельзя решить технической догадкой

1. **DR-O01 — `ready` до завершения Phase 6A.** Пока FTS ещё не реализован, означает ли `ready` только «обязательная extraction завершена» (текущий Phase 4 contract), при явном `searchCapabilities.ftsSearchable=false`? Рекомендация: да, для совместимости текущего среза; но UI не должен называть документ доступным для RAG-поиска.
2. **DR-O02 — `review_required` UX.** Разрешить ли пользователю вручную подтвердить использование результата с предупреждением? Кто имеет право, какие основания и аудит? До решения — запретить override.
3. **DR-O03 — Version supersession.** После загрузки новой версии старая остаётся доступна до успешной активации новой или немедленно блокируется? Нужна продуктовая политика для юридически значимых/отозванных документов.
4. **DR-O04 — Citation gate.** Какие locator guarantees нужны для MVP: page + paragraph/heading + text offsets, или обязательны PDF page coordinates? Нельзя заявлять точное выделение, если сохраняются только текстовые offsets.
5. **DR-O05 — Partial capability.** Допускаем ли FTS retrieval по документу, если часть страниц/блоков имеет parse warnings, но общий quality outcome не `fail`? Требуется threshold/benchmark, не субъективное решение.

---

## 15. Границы этого документа

Этот addendum не:

- меняет D-018, D-025, FILE-009, Gate B или O-002;
- закрывает вопросы выбора embedding model/dimensions;
- утверждает конкретную chunking strategy;
- определяет юридическую актуальность/применимость нормы;
- заменяет ACL Retrieval Scope Contract;
- утверждает Prisma enum/table/column names;
- требует немедленно реализовать все capabilities;
- редактирует существующие файлы проекта.

Перед реализацией необходимо согласовать DR-01…DR-09 и отдельно закрыть OPEN-вопросы, которые влияют на продуктовую семантику. После согласования следующий шаг — отдельный crosswalk к текущим Prisma models/API contracts и план миграции без изменения поведения уже работающего Phase 4/5.

---

## 16. Итоговая рекомендация

Принять модель **Lifecycle ≠ Processing Outcome ≠ Index Generation ≠ Capabilities ≠ Authorization**.

Это минимально сложная модель, которая не заставляет ждать embeddings, чтобы завершить FTS-срез, но при этом не выдаёт extraction success за полноценный юридический поиск. Для НейроЮриста Спектр особенно важно не обещать пользователю надёжные цитаты и поиск по документу, если качество extraction или устойчивость locators этого не подтверждают.

**Статус документа остаётся PROPOSED до явного согласования.**

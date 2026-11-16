# Cross-Contract Consistency Review — Stage 2

**Статус:** PROPOSED — результат статической сверки пяти новых контрактов; не является изменением канонической документации или подтверждённым решением.

**Дата:** 2026-11-17  
**Область:** согласованность пяти addendum Stage 2 для пользовательского RAG и доказательной базы.  
**Проверенные документы:**

1. `2026-11-17-acl-retrieval-scope-contract.md` (ACL / Retrieval Scope)
2. `2026-11-17-document-readiness-lifecycle-contract.md` (Document Readiness Lifecycle)
3. `2026-11-17-extraction-quality-parser-contract.md` (Extraction Quality / Parser)
4. `2026-11-17-evidence-validation-contract.md` (Evidence Validation)
5. `2026-11-17-evaluation-framework-contract.md` (Evaluation Framework)

**Ограничение проверки:** выполнена статическая сверка текста документов и их взаимных контрактов. Runtime, CI, Prisma migrations и реализация алгоритмов не запускались. Этот review не подтверждает корректность реализации и не заменяет сверку с актуальным кодом перед разработкой.

---

## 1. Executive summary

Пять документов в целом описывают совместимую последовательность: безопасный доступ → обработка и индексация → получение evidence → проверка ссылок и claims → измерение качества. Но сейчас это ещё не единый исполнимый контракт. Обнаружены расхождения в enum-значениях, незафиксированные границы идентичности источника и locator, неоднозначность `Document.status = ready`, а также несколько мест, где один документ предполагает более строгую гарантию, чем другой явно обеспечивает.

### Вывод

**Нельзя отдавать все пять документов в реализацию как независимые спецификации.** Перед этим нужно принять небольшой набор cross-contract решений и внести согласованные изменения отдельным интеграционным документом/последующими версиями addendum. До согласования реализацию можно начинать только по тем частям, чьи контракты не зависят от спорных enum и семантики.

### Критические findings

| ID | Приоритет | Проблема | Основной риск |
|---|---|---|---|
| CCR-01 | P0 | Разные enum для Claim Support | Runtime и Evaluation будут по-разному считать один и тот же claim |
| CCR-02 | P0 | Разные шкалы Legal Applicability | Невозможно однозначно сопоставить assessment и expected labels |
| CCR-03 | P0 | `ready` зависит от readiness profile, но принадлежит Document | API/UI и retrieval могут по-разному понимать готовность |
| CCR-04 | P0 | Нет общего crosswalk между Extraction outcome, stage status и Search eligibility | `review_required` может незаметно попасть в retrieval/evidence |
| CCR-05 | P0 | Evidence locator не закреплён за конкретной версией parser representation | Citation может разрешиться не в тот текст/диапазон после reprocessing |
| CCR-06 | P1 | Source identity допускает неоднозначные/неполные version bindings | Evidence может быть формально валидным, но не иметь однозначного source of truth |
| CCR-07 | P1 | ACL scope описывает user-document retrieval, Evidence contract шире | Нельзя автоматически считать ACL-контракт покрывающим legal corpus и external sources |
| CCR-08 | P1 | Evaluation schema не полностью отражает runtime outcome dimensions | Отчёты могут терять `conflicting`, `partial`, `disputed`, `unverifiable` и quality limitations |
| CCR-09 | P1 | Generation identity / activation semantics не полностью унифицированы | Возможна смесь результатов разных build/config/source versions |
| CCR-10 | P1 | Несогласованность `retrievedAt` и temporal provenance | Время поиска может ошибочно трактоваться как время действия/получения источника |
| CCR-11 | P1 | Cache / revocation / evaluation security gate нуждаются в общей модели результата | Успешный ответ теста не доказывает отсутствие утечки в промежуточных слоях |
| CCR-12 | P2 | Не определён общий формат error/outcome taxonomy | Диагностика и метрики будут дробиться на несовместимые коды |

---

## 2. Cross-contract dependency map

Предлагаемый порядок прохождения данных:

```text
Trusted Actor + Context
        |
        v
ACL Authorization / RetrievalScope
        |
        v
DocumentVersion + immutable source checksum
        |
        v
ExtractionArtifact + Parser/Normalizer provenance
        |
        v
Quality Gate (pass / review_required / fail)
        |
        v
Structure / SourceBlock / SourceLocator
        |
        v
Chunk + source-span lineage
        |
        v
IndexBuild / IndexGeneration validation
        |
        v
Atomic activation + Search eligibility
        |
        v
ACL-constrained retrieval channels
        |
        v
EvidenceReference (stable source identity + locator)
        |
        v
Reference Integrity
        |
        v
Claim Support
        |
        v
Legal Applicability (where applicable)
        |
        v
Answer policy / abstention / conflict disclosure
        |
        v
Evaluation suites + immutable run manifest
```

Ключевые зависимости:

- ACL ограничивает не только retrieval query, но и последующее чтение source blocks, parent expansion, evidence resolution и citation preview.
- Extraction создаёт основание для locator; Evidence Validation не должен самостоятельно реконструировать координаты из произвольного chunk text.
- Readiness определяет допустимость документа/версии в retrieval; ACL определяет право конкретного actor. Ни один из этих механизмов не заменяет другой.
- Evaluation измеряет поведение перечисленных контрактов, но не должен подменять их runtime-проверки.

---

## 3. P0 findings — требуется согласовать до связанной реализации

### CCR-01 — Claim Support enum не совпадает

**Где:**
- Evidence Validation: `direct | inference | not_supported | conflicting | not_assessed`.
- Evaluation Framework: `direct | inference_supported | partial | unsupported | contradicted | not_assessed`.

**Почему это проблема:**

Это не косметическая разница. Неясно, является ли `inference` тем же самым, что `inference_supported`; `not_supported` и `unsupported` выглядят синонимами, но это не закреплено; `conflicting` может означать конфликт между источниками, тогда как `contradicted` — прямое опровержение claim. `partial` в Evaluation не имеет прямого runtime-эквивалента.

В результате возможна ситуация, когда runtime отдаёт `conflicting`, а evaluator не знает, считать ли это `contradicted`, `unsupported` или отдельным outcome. Метрики и response policy расходятся.

**Рекомендация:** ввести единый канонический набор outcome для Claim Support, одинаковый в runtime DTO и evaluation labels. Кандидат:

```ts
type ClaimSupportStatus =
  | 'direct'
  | 'inference_supported'
  | 'partially_supported'
  | 'unsupported'
  | 'contradicted'
  | 'conflicting_evidence'
  | 'not_assessed';
```

Семантика должна быть взаимоисключающей на уровне одного claim assessment:

- `direct` — evidence прямо подтверждает claim;
- `inference_supported` — claim логически следует из evidence с описанным reasoning step;
- `partially_supported` — подтверждена только часть атомарно недостаточно разделённого claim; предпочтительно исправлять claim decomposition, а не злоупотреблять этим статусом;
- `unsupported` — достаточной поддержки не найдено;
- `contradicted` — доступное evidence опровергает claim;
- `conflicting_evidence` — допустимые evidence поддерживают несовместимые позиции и конфликт не разрешён;
- `not_assessed` — проверка не завершена/не проводилась.

`conflicting_evidence` не следует автоматически трактовать как `contradicted`: наличие двух конкурирующих источников — не то же самое, что установленное опровержение. Для одного claim может быть несколько evidence groups; статус должен сопровождаться ссылками на supporting/contradicting evidence.

**Важно:** это рекомендуемый crosswalk, а не закрытое решение. После согласования Evidence Validation и Evaluation должны ссылаться на один enum и один набор response consequences.

### CCR-02 — Legal Applicability использует разные шкалы

**Где:**
- Evidence Validation `ApplicabilityStatus`: `applicable | not_applicable | partially_applicable | disputed | unknown | not_assessed`.
- Evaluation Framework предлагает labels `true | false | unknown | not_assessed`.

**Почему это проблема:**

Runtime assessment богаче, чем evaluator labels. `partially_applicable` и `disputed` теряются при оценке. Кроме того, булевы `true/false` не объясняют, что именно оценивалось: применимость нормы, истинность отдельного факта или результат temporal resolution.

**Рекомендация:** разделить три независимых типа:

```ts
type FactTruth = 'true' | 'false' | 'unknown';

type ApplicabilityStatus =
  | 'applicable'
  | 'not_applicable'
  | 'partially_applicable'
  | 'disputed'
  | 'unknown'
  | 'not_assessed';

type TemporalResolutionStatus =
  | 'resolved'
  | 'partially_resolved'
  | 'unknown'
  | 'not_applicable';
```

Evaluation должен размечать `ApplicabilityStatus` тем же enum, что и runtime. `FactTruth` используется только для отдельных фактов/условий. `TemporalResolutionStatus` — для результата выбора временной редакции. Не сводить их к одной метке.

`disputed` и `unknown` должны различаться: `disputed` — обнаружены конкурирующие позиции/evidence; `unknown` — данных недостаточно или оценка не разрешена. `not_assessed` — оценка не запускалась/не завершилась.

### CCR-03 — `Document.status = ready` неоднозначен при нескольких readiness profiles

**Где:** Document Readiness Lifecycle, разделы 3, 4, 5, 12.

**Проблема:**

`Document.status` — единое поле документа, но `ready` определён как прохождение обязательных этапов «текущего readiness profile». Одновременно описаны `extractable`, `fts_searchable`, `hybrid_searchable`, `citation_ready`. Не определено, кто выбирает profile и может ли он различаться по пользователю, запросу, тарифу или feature flag.

Если один запрос требует FTS, а другой hybrid, глобальный `Document.status` не может менять смысл в зависимости от запроса. Иначе один и тот же документ может быть `ready` для одного пользователя и не `ready` для другого без изменения самого документа.

**Рекомендация:** разделить:

1. **Document lifecycle status** — состояние бизнес-сущности (`uploading`, `uploaded`, `processing`, `ready`, `processing_failed`, `archived`, `deletion_pending`, `deleted`).
2. **Version processing state** — результаты конкретных этапов обработки конкретной версии.
3. **Search capabilities** — проверяемые возможности активной generation: `fts`, `vector`, `hybrid`, `citation_locators`.
4. **Request capability requirement** — что конкретный сценарий требует от документа.

Для MVP выбрать один обязательный baseline profile, не обязательно hybrid. `Document.status = ready` должен иметь единственную стабильную семантику: все обязательные этапы baseline profile пройдены и документ доступен для тех поддерживаемых операций, которые продукт обещает в этом релизе. Дополнительные возможности отражаются отдельно, например `capabilities.ftsSearchable`, `capabilities.hybridSearchable`, `capabilities.citationReady`.

Не делать `ready` зависимым от произвольного клиентского profile. Если baseline пока остаётся extraction-ready до Phase 6, это должно быть явно обозначено в API и UI, а не маскироваться как searchable.

### CCR-04 — Нет единого crosswalk Extraction outcomes → indexing eligibility → evidence trust

**Где:**
- Parser contract: `ExtractionArtifact.status = succeeded | partial | failed`.
- Quality report: `pass | review_required | fail`.
- Lifecycle stage statuses: `pending | running | succeeded | failed | timed_out | not_supported`.
- Lifecycle readiness profiles и Searchable invariant.
- Evidence Validation: locator confidence `verified | parser_derived | approximate | unavailable`.

**Проблема:**

Сейчас документ может иметь `ExtractionArtifact.status = partial`, `quality.outcome = review_required`, stage status `succeeded` (если partial не отражён в stage enum) и потенциально участвовать в retrieval. Нет одной таблицы, которая говорит, какие сочетания разрешены.

**Рекомендация:** не пытаться объединить всё в один enum. Ввести явную policy matrix:

| Extraction artifact | Quality outcome | Index eligibility | Evidence / citation consequence |
|---|---|---|---|
| `succeeded` | `pass` | Допускается к baseline indexing после остальных gates | Locator quality определяется отдельно; citation допускается только после Reference Integrity |
| `partial` | `review_required` | По умолчанию исключён из обычного citation-grade retrieval; возможен отдельный явно обозначенный limited-search режим только после продуктового решения | Claims из неполного extraction не могут считаться полностью подтверждёнными без ограничений |
| `failed` | `fail` | Запрещён | Evidence не создаётся |
| `succeeded` | `fail` | Запрещён — quality gate имеет приоритет над техническим завершением | Evidence не создаётся |
| `partial` | `pass` | Недопустимое сочетание до объяснения правила | Ошибка контракта/валидации |
| любое | quality report отсутствует | Запрещён для searchable profile | Нельзя молча считать качество приемлемым |

Отдельно закрепить: `stage.status = succeeded` означает, что процессор штатно завершил свою задачу, но не гарантирует `quality.outcome = pass` и не даёт права на indexing.

`review_required` не следует автоматически переводить в `processing_failed`: это может быть завершённая обработка с ограниченной пригодностью. Но и `ready` не должен означать полную searchable/citation readiness, если baseline profile требует полного качества. Это требует явного выбора baseline и UX semantics.

### CCR-05 — Evidence locator не закреплён за конкретным immutable text representation

**Где:**
- Parser contract: `SourceLocator.sourceOffsets` относятся к `rawTextRef + representationVersion`.
- Evidence Reference: locator содержит `pageStart`, `paragraphId`, `startOffset`, `endOffset`, но не содержит явной ссылки на `representationId` / `extractionArtifactId` / `normalizationVersion`.

**Почему это критично:**

`documentVersionId` идентифицирует оригинальный файл, но не конкретный результат parser/normalizer. Один и тот же DOCX/PDF после обновления parser может дать иной порядок блоков, offsets, paragraph indexes или text normalization. Locator, привязанный только к document version, может начать указывать на другой фрагмент.

**Рекомендация:** Evidence locator должен иметь source mapping reference на immutable extraction representation, например:

```ts
interface EvidenceLocatorBinding {
  documentVersionId: string;
  sourceChecksum: string;
  extractionArtifactId: string;
  representationId: string;
  representationHash: string;
  parserVersion: string;
  normalizationVersion: string;
  locator: EvidenceLocator;
}
```

Не обязательно включать все поля в публичный API. Важно, чтобы backend мог однозначно разрешить locator в ту же неизменяемую последовательность текста/блоков, по которой был создан evidence. При reprocessing старый evidence либо разрешается через старый immutable artifact, либо явно становится `unverifiable`; он не должен незаметно переехать на новый parser output.

### CCR-06 — Evidence source identity допускает неоднозначную комбинацию IDs

**Где:** Evidence Reference допускает nullable `sourceVersionId`, `sourceSnapshotId`, `documentVersionId`, `chunkId`, `indexGenerationId`.

**Проблема:**

Набор nullable полей универсален, но не содержит discriminated rules. Например, `user_document` может оказаться без `documentVersionId`, а legal source — без `sourceSnapshotId`; или в одной записи могут оказаться противоречащие друг другу source version и document version. Формально интерфейс допускает невалидные комбинации.

**Рекомендация:** описать conditional invariants:

- `user_document`: обязателен `sourceId` + `documentVersionId` + `extractionArtifactId/representation binding`; `sourceSnapshotId` не заменяет document version.
- `legal_primary_source` / `court_source`: обязателен стабильный source identity и конкретный immutable source version/snapshot; `documentVersionId` используется только если source реально хранится как загруженный user document, а не как legal corpus entity.
- `licensed_secondary_source` / `secondary_publication`: обязательны provenance/edition/snapshot metadata в соответствии с доступной моделью источника; отсутствие version binding понижает Reference Integrity до `unverifiable`/`valid_with_limitations` в зависимости от фактов.
- `system_fact`: нужен типизированный system fact reference и время фиксации; не маскировать его под document chunk.
- `chunkId` и `indexGenerationId` — retrieval provenance, не каноническая идентичность источника.

Лучше использовать discriminated union на уровне логического DTO, а не один interface со множеством nullable IDs. Prisma schema можно проектировать позже.

---

## 4. P1 findings — согласовать до production hardening

### CCR-07 — ACL contract покрывает user-document retrieval, но не весь Evidence universe

ACL addendum прямо ограничен пользовательскими документами Phase 6. Evidence Validation охватывает также legal primary sources, court sources, licensed secondary sources и external sources.

**Риск:** команды могут ошибочно решить, что `RetrievalScope` из пользовательского RAG уже обеспечивает доступ к Consultant/Garant-like источникам, legal corpus, судебным актам, лицензиям и source registry.

**Рекомендация:** не расширять ACL-документ молча. В Evidence contract добавить явное правило: каждый `EvidenceReference` должен быть авторизован соответствующим source-specific policy до чтения текста, preview, citation resolution и provider context. Для user documents применяется Phase 6 RetrievalScope; для legal corpus/external sources — отдельный Source Registry / licensing / organization entitlement policy. Доступность источника в индексе не означает право его показывать или передавать модели.

Это отдельная область будущего Legal Research ACL contract, не повод смешивать user-document ACL и лицензирование.

### CCR-08 — Evaluation labels не покрывают все runtime outcomes

Помимо CCR-01/02, Evaluation Framework должен оценивать Reference Integrity statuses (`valid`, `valid_with_limitations`, `invalid`, `unverifiable`) и locator confidence (`verified`, `parser_derived`, `approximate`, `unavailable`). Сейчас часть метрик агрегирует валидность ссылок и quote match, но недостаточно явно закрепляет разрезы по ограниченным/непроверяемым ссылкам.

**Рекомендация:** в evaluation cases хранить expected outcome и actual outcome по тем же runtime enums. Не сводить `valid_with_limitations` к `valid`; `unverifiable` не считать pass. Отдельно считать:

- strict reference pass rate (`valid` only);
- limited reference rate (`valid_with_limitations`);
- invalid reference rate;
- unverifiable rate;
- locator confidence distribution;
- quote exact-match rate по locator types и extraction quality slices.

### CCR-09 — Index generation identity и activation contract требуют общего ключа

Lifecycle говорит об активной generation; ACL требует server-derived active generation; Extraction связывает artifacts с DocumentVersion/checksum/parser versions; Evaluation фиксирует retrieval config и index parameters. Но не определено, где заканчивается identity одного document index build и начинается corpus-wide generation, а также как точно связываются chunk IDs с build manifest.

**Рекомендация:** до реализации определить один canonical build identity из `docs/28` и использовать его во всех addendum. Как минимум:

- `indexGenerationId` — идентификатор immutable поколения индекса;
- `buildManifestId/hash` — описание входов/конфигурации build;
- `documentVersionId + sourceChecksum` — конкретная версия исходного документа;
- `extractionArtifactId + representationHash` — конкретный parser output;
- `chunkerVersion/configHash` и `embeddingProfileId` — происхождение derived index artifacts;
- active pointer — единственная транзакционно активируемая ссылка на validated generation.

Не вводить параллельный manifest в Evaluation или Extraction. Использовать и расширять существующий manifest contract из `docs/28` после проверки его текущей схемы.

### CCR-10 — `retrievedAt` не должен подменять temporal source facts

Evidence temporal context содержит `retrievedAt`, `recordedAt`, publication/effective dates; Evaluation отдельно требует дату события, контрольную дату, publication date и period. Нужно однозначно различать:

- время, когда система извлекла источник из corpus;
- время snapshot/recording source state;
- официальную дату опубликования;
- период действия нормы/редакции;
- дату факта/события;
- дату, на которую пользователь просит анализ.

**Рекомендация:** `retrievedAt` — только техническое время получения evidence в конкретном run. Оно никогда не используется как proxy для `validFrom`, `publicationDate`, `recordedAt` или date of event. Все даты должны иметь timezone/calendar semantics и точность (date vs timestamp), согласованные с temporal contract из `docs/ai/retrieval/06-temporal-legal-retrieval.md` и открытым O-006.

### CCR-11 — ACL leakage gate и evaluation report должны проверять один и тот же security invariant

ACL contract считает утечкой попадание неразрешённого фрагмента в SQL result, application memory, reranker, context, cache или provider payload. Evaluation Framework справедливо выносит ACL в отдельный hard gate. Но нужно закрепить, что тест harness наблюдает все эти границы, а не только HTTP response или итоговый ответ.

**Рекомендация:** для каждого ACL case записывать безопасные stage-level assertions: candidate IDs after SQL, IDs after fusion/expansion, reranker input IDs, ContextSnapshot evidence IDs, cache result IDs, provider payload evidence IDs, published result IDs. Проверять, что каждый набор является подмножеством разрешённых IDs. Сами тексты в отчёт не включать. Любое нарушение — hard fail, не усреднять.

### CCR-12 — Общая error taxonomy отсутствует

Документы используют разные уровни: stage status, quality outcome, reference status, claim status, applicability status, AIJob status и gate outcome. Это нормально, но нужны общие принципы, чтобы `failed`, `not_supported`, `unknown`, `not_assessed`, `unverifiable`, `review_required` не смешивались.

**Рекомендация:** не создавать один гигантский enum. Ввести taxonomy по доменам и общий envelope:

```ts
interface StageOutcome<TStatus extends string> {
  status: TStatus;
  reasonCode?: string;
  retryable?: boolean;
  completedAt?: string;
  artifactRef?: string;
}
```

Правила:
- `failed` — операция не выполнена/нарушен обязательный контракт;
- `not_supported` — тип/возможность не поддерживается продуктом;
- `unknown` — предметный результат неизвестен;
- `not_assessed` — оценка не выполнялась или не завершилась;
- `unverifiable` — попытка проверки была, но доказать корректность не удалось;
- `review_required` — операция завершена, но качество/ограничения требуют специальной политики;
- `retryable` — характеристика причины/ошибки, не самостоятельный бизнес-результат.

---

## 5. Согласованный минимальный логический контракт

Ниже — рекомендуемый набор границ. Это не Prisma schema и не требование реализовать все сущности одновременно.

### 5.1 Identity chain

```text
Document
  -> DocumentVersion (immutable original + sourceChecksum)
      -> ExtractionArtifact (extractor/parser/config provenance)
          -> Representation (raw/normalized text identity + hash)
              -> SourceBlock / SourceLocator
                  -> Chunk (retrieval provenance)
                      -> IndexGeneration (build manifest + active state)
                          -> EvidenceReference (stable source identity + locator binding)
```

`chunkId` не заменяет source identity. `indexGenerationId` не заменяет document version. `documentVersionId` не заменяет extraction representation. Все звенья нужны для точного разрешения цитаты и воспроизводимости.

### 5.2 Eligibility versus authorization

Для каждого retrieval candidate должны одновременно выполняться:

```text
Eligible(candidate) =
  source version is valid
  AND extraction quality policy allows indexing
  AND required representation/locator exists
  AND index generation is validated and active
  AND candidate belongs to that generation

Authorized(actor, candidate, operation) =
  current source-specific ACL/licensing policy allows operation

UsableEvidence = Eligible(candidate) AND Authorized(actor, candidate, operation)
```

`Eligible` — свойство данных и build state. `Authorized` — свойство субъекта, ресурса и действия. Не хранить единый булевый флаг `accessible/searchable` как замену обеим проверкам.

### 5.3 Evidence pipeline

```text
retrieved candidate
  -> scope/ACL recheck
  -> stable EvidenceReference construction
  -> Reference Integrity
  -> Claim Support
  -> Legal Applicability (only for legal applicability claims)
  -> response policy
```

Если Reference Integrity = `invalid` или `unverifiable`, claim не может получить `direct` только потому, что LLM считает текст похожим. Если source locator = `approximate`, нельзя выдавать точную page/clause citation. Если applicability = `unknown`/`disputed`, ответ не должен превращать это в категоричный вывод.

---

## 6. Рекомендуемые cross-contract invariants

Эти invariants должны быть общими для всех пяти документов:

1. **Tenant/ACL isolation:** неразрешённые данные не попадают в retrieval/application/provider/cache pipeline.
2. **Immutable source version:** любая extraction/evidence/citation привязана к неизменяемой версии исходника и checksum.
3. **Immutable extraction representation:** offsets/locators относятся к конкретной parser/normalizer representation.
4. **Quality before indexing:** technical job success не означает quality pass и не означает searchable.
5. **Validated generation only:** обычный retrieval использует только active validated generation.
6. **No status inference from artifacts:** наличие chunk/embedding не доказывает готовность; наличие `ready` не доказывает ACL.
7. **Evidence identity independent of chunking:** re-chunking не меняет identity исходного доказательства.
8. **Reference before support:** claim support не может повысить invalid/unverifiable reference до valid.
9. **Support before applicability:** legal applicability assessment не может считаться доказанным без проверяемого evidence и явно сохранённых фактов.
10. **Unknown preservation:** неизвестный факт/период не превращается автоматически в false/true или applicable/not_applicable.
11. **No hidden authority score:** retrieval relevance, legal authority и applicability остаются разными измерениями.
12. **Evaluation hard gates:** ACL leakage, invalid citation, wrong source version и critical false-ready не компенсируются улучшением других метрик.
13. **No content in ordinary telemetry:** logs/reports содержат безопасные IDs, reason codes и агрегаты, но не клиентские фрагменты по умолчанию.
14. **Manifest-backed reproducibility:** каждый run/build фиксирует версии кода, parser, normalizer, chunker, embedding/reranker и source corpus snapshot настолько, насколько позволяет provider.

---

## 7. Порядок устранения расхождений

### Before implementation (P0)

1. Согласовать единый Claim Support enum и его response consequences.
2. Согласовать раздельные enum для FactTruth, ApplicabilityStatus и TemporalResolutionStatus.
3. Утвердить одну семантику `Document.status = ready` для baseline MVP profile; дополнительные capabilities вынести отдельно.
4. Утвердить policy matrix для `ExtractionArtifact.status × quality.outcome × indexing eligibility × citation eligibility`.
5. Добавить immutable representation binding в Evidence locator contract.

### Before production hardening (P1)

6. Утвердить source-kind-specific Evidence identity rules.
7. Разграничить user-document ACL и legal source/license authorization.
8. Привязать evaluation labels к runtime enums и добавить slices для limited/unverifiable outcomes.
9. Согласовать `IndexGeneration` с manifest из `docs/28`, без второго manifest implementation.
10. Сверить temporal timestamps и date semantics с temporal legal retrieval contract.
11. Сделать ACL test harness stage-aware.
12. Зафиксировать error taxonomy и retry semantics без единого универсального статуса.

### Later / only if needed (P2)

13. Единый dashboard для всех suite — не нужен до появления стабильных metrics.
14. Автоматический LLM judge для всех claims — не нужен до экспертного holdout set.
15. Универсальный confidence score — не вводить без калибровки и доказанной полезности.
16. Полный Legal Research source ACL contract — отдельный пакет, когда legal corpus implementation scope будет конкретизирован.

---

## 8. Что можно делать параллельно уже сейчас

Без закрытия всех P0 можно безопасно продолжать подготовительную работу:

- собрать synthetic fixtures для ACL и extraction;
- определить golden corpus format и разметку, не фиксируя пока конфликтующие enum;
- подготовить parser benchmark fixtures для DOCX/PDF;
- реализовать детерминированные checksum/source version checks в изолированном прототипе;
- проверить SQL prefilter/RLS на тестовых данных без подключения к production content;
- сделать ручной baseline retrieval evaluation, фиксируя фактические labels отдельно от runtime schema.

Не следует пока:

- фиксировать Prisma enum/таблицы по спорным типам Claim Support/Applicability;
- связывать публичный API `ready` с hybrid search;
- разрешать indexing `review_required` документов;
- делать Evidence locator только из `documentVersionId + page/offset` без representation binding;
- утверждать, что user-document ACL автоматически покрывает legal sources;
- создавать вторую систему IndexBuild manifest вместо `docs/28`.

---

## 9. Cross-contract acceptance tests

| ID | Сценарий | Ожидаемое поведение |
|---|---|---|
| XCC-01 | Runtime claim = `inference_supported` | Evaluation принимает тот же enum, без mapping loss |
| XCC-02 | Claim имеет conflicting evidence | Не классифицируется автоматически как `unsupported` или `contradicted` |
| XCC-03 | Applicability = `partially_applicable` | Evaluation сохраняет этот класс, не сводит к true/false |
| XCC-04 | Fact = `unknown` | Не превращается в `not_applicable` |
| XCC-05 | Extraction job завершился, quality = fail | Нет indexing и searchable activation |
| XCC-06 | Extraction = partial, quality = review_required | Применяется явная policy; нет молчаливого citation-grade допуска |
| XCC-07 | Parser version обновлена, исходный DocumentVersion прежний | Старый Evidence locator разрешается в старый artifact или становится unverifiable; не смещается на новый текст |
| XCC-08 | Новый chunking изменил chunk IDs | Stable Evidence source identity сохраняется |
| XCC-09 | Document.status = ready, но у actor нет ACL | Retrieval не возвращает candidate |
| XCC-10 | Actor имеет ACL, но generation не active | Retrieval не возвращает candidate |
| XCC-11 | User-document Evidence | Применяется user-document ACL и tenant scope |
| XCC-12 | Legal source Evidence | Применяется source/license authorization, а не только workspace ACL |
| XCC-13 | Locator confidence = approximate | Нельзя отобразить как точную page/clause citation |
| XCC-14 | Reference Integrity = unverifiable | Claim не получает `direct` без отдельного valid evidence |
| XCC-15 | Applicability = disputed | Response policy раскрывает конфликт и не делает категоричный вывод |
| XCC-16 | Index build config changed | Создаётся новый manifest/build identity; active generation меняется атомарно после validation |
| XCC-17 | ACL revoked after retrieval | Candidate исключается из ContextSnapshot/publish согласно revocation contract |
| XCC-18 | Evaluation run содержит ACL leakage | Suite hard-fail независимо от Retrieval Recall/NDCG |
| XCC-19 | `retrievedAt` отличается от `validFrom` | Temporal resolver не подменяет дату действия временем retrieval |
| XCC-20 | Quality report отсутствует | Документ не допускается к searchable profile |
| XCC-21 | Source version mismatch | Reference Integrity = invalid; claim support не может быть pass на этом evidence |
| XCC-22 | Evaluation sample count мал | Report показывает low sample warning; не выдаёт статистически уверенный release pass |

---

## 10. Что не решено этим review

Этот документ не выбирает:

- конкретный baseline search profile (FTS-only или hybrid);
- embedding/reranker provider и модели;
- chunking strategy и параметры;
- parser libraries и OCR policy;
- Prisma schema, migrations и публичные API поля;
- legal corpus logical schema и crosswalk с `docs/18` / `docs/ai/retrieval/`;
- temporal model semantics, которые зависят от O-006 и соответствующих canonical docs;
- конкретные numeric quality thresholds;
- конкретные release gates и SLA;
- окончательную семантику admin grant для AI context.

Не изменяются D/O/H decisions, Gate B, FILE-009, O-002, O-006 и другие открытые вопросы.

---

## 11. Итоговая рекомендация

Пять addendum уже дают сильный каркас, но сейчас в них есть несколько несовпадающих словарей и не до конца определённая цепочка идентичности source → extraction representation → locator → evidence. Это нужно исправить до проектирования Prisma-моделей и публичных DTO.

**Самые важные решения для следующего обсуждения:**

1. Единые enums Claim Support и Legal Applicability.
2. Стабильная семантика `Document.status = ready` плюс отдельные search capabilities.
3. Явная policy matrix для `review_required` и допуска к indexing/citations.
4. Immutable extraction representation binding для каждого citation locator.
5. Source-specific authorization для user documents и legal sources.

Пока эти пункты не согласованы, не следует превращать предложенные типы в окончательную Prisma schema. Следующий шаг — согласовать P0 cross-contract decisions, затем создать отдельный implementation-ready addendum с едиными DTO/enum definitions и тестами. Исходные пять документов при этом не редактировать до явного согласования.

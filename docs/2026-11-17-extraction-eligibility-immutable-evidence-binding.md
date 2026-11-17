# Extraction Eligibility & Immutable Evidence Binding Contract

**Дата:** 2026-11-17  
**Статус:** PROPOSED · OPEN  
**Тип:** самостоятельный addendum к алгоритмическим контрактам  
**Область:** CCR-04 (P0), CCR-05 (P0); частично подготавливает CCR-06 (P1)

> Этот документ предлагает единый контракт между результатом extraction, quality assessment, indexing eligibility и доказательной привязкой цитат. Он не изменяет существующие документы, decisions log, Prisma schema или API. Любые enum/DTO ниже — логическая модель для согласования, а не утверждение об уже реализованной схеме.

---

## 1. Зачем нужен отдельный контракт

В проекте уже разведены несколько понятий, которые нельзя сводить к одному статусу:

1. **Технический исход обработки** — завершился ли parser без ошибки и насколько полно он извлёк содержимое.
2. **Качество результата** — пригоден ли извлечённый материал для дальнейшего использования.
3. **Допуск к индексации** — разрешено ли включать результат в конкретную поисковую generation.
4. **Готовность evidence locator** — можно ли однозначно вернуться от найденного фрагмента к неизменяемому представлению исходного содержимого.
5. **Доказательная пригодность** — может ли найденный фрагмент участвовать в claim support и цитировании с соответствующими ограничениями.

Если оставить эти измерения не связанными явной policy matrix, технически успешно завершившийся parser может незаметно превратиться в источник для юридического ответа, хотя часть текста потеряна или координаты цитаты больше не разрешаются.

Вторая проблема независима от первой: даже качественно извлечённый текст не обеспечивает устойчивую цитату, если offsets не привязаны к конкретному неизменяемому parser representation.

**Главный принцип:** никакой downstream-компонент не должен самостоятельно выводить пригодность документа из одного `status`.

---

## 2. Границы и связанные контракты

Документ согласуется с предложенными контрактами:

- `2026-11-17-extraction-quality-parser-contract.md`;
- `2026-11-17-document-readiness-lifecycle-contract.md`;
- `2026-11-17-document-readiness-consistency-decision.md`;
- `2026-11-17-evidence-validation-contract.md`;
- `2026-11-17-claim-support-applicability-taxonomy.md`;
- `2026-11-17-evaluation-framework-contract.md`;
- `2026-11-17-acl-retrieval-scope-contract.md`.

Связь с cross-contract review:

| Finding | Приоритет | Что закрывает этот документ |
|---|---:|---|
| CCR-04 | P0 | Единый crosswalk extraction outcome × quality × indexing eligibility × evidence/citation |
| CCR-05 | P0 | Immutable representation binding для locator и evidence |
| CCR-06 | P1 | Уточняет обязательную source identity для user document, но не закрывает весь multi-source union |

### 2.1 Что документ не решает

- Не выбирает окончательную chunking strategy: FILE-009 остаётся OPEN до benchmark.
- Не определяет legal-source ingestion и лицензирование.
- Не задаёт финальную Prisma-модель или миграции.
- Не утверждает, что PDF page coordinates обязательны для MVP: это отдельное решение DR-O04.
- Не разрешает ручной override `review_required`: DR-O02 остаётся OPEN.
- Не меняет ACL: eligibility не является authorization.
- Не определяет юридическую применимость нормы и не заменяет Claim Support / Legal Applicability.

---

## 3. Каноническая цепочка идентичности

Для пользовательского документа предлагается следующая цепочка:

```text
Document
  └── DocumentVersion (immutable original bytes)
        └── ExtractionArtifact (one processing attempt/result)
              └── TextRepresentation (immutable normalized/parser output)
                    ├── SourceBlock[]
                    │     └── SourceLocator
                    └── Chunk[]
                          └── IndexGeneration membership
                                └── EvidenceReference
                                      └── ClaimAssessment
```

### 3.1 Сущности и их смысл

| Сущность | Что идентифицирует | Изменяемость |
|---|---|---|
| `Document` | Логический пользовательский документ | Изменяемая lifecycle-сущность |
| `DocumentVersion` | Конкретные оригинальные байты загруженного файла | Immutable |
| `ExtractionArtifact` | Результат конкретной попытки обработки конкретной версии определённым pipeline | Immutable после terminal outcome |
| `TextRepresentation` | Конкретная последовательность нормализованного текста и структурных блоков | Immutable |
| `SourceBlock` | Структурный фрагмент representation | Immutable |
| `Chunk` | Retrieval-oriented фрагмент с mapping на source blocks | Immutable в рамках build |
| `IndexGeneration` | Конкретный набор индексных записей, созданный из фиксированных inputs/config | Immutable после build; меняется только active pointer |
| `EvidenceReference` | Зафиксированное происхождение найденного фрагмента | Immutable snapshot |
| `ClaimAssessment` | Оценка конкретного claim относительно зафиксированных evidence | Новая версия assessment при пересмотре |

`DocumentVersion` не заменяет `TextRepresentation`: одни и те же байты могут дать различный текст после смены parser, OCR engine, normalization rules или структуры извлечения.

### 3.2 Immutable означает неизменяемый, а не вечный

Immutable representation нельзя переписывать «на месте». Но её можно:
- пометить как superseded;
- исключить из новых поисковых generation;
- отозвать из-за security/legal policy;
- удалить по retention policy;
- сохранить только metadata/hash, если содержание удалено.

Статус доступности и право хранения — отдельные измерения. Immutable не означает бессрочное хранение и не отменяет deletion obligations.

---

## 4. Набор независимых outcome dimensions

Не объединять перечисленное в один enum.

### 4.1 Extraction outcome

```ts
type ExtractionOutcome =
  | 'succeeded'
  | 'partial'
  | 'failed';
```

Семантика:

- `succeeded` — parser завершил extraction и сформировал representation в соответствии с заявленным scope.
- `partial` — часть содержимого не извлечена, пропущена или представлена с ограничениями, которые могут влиять на полноту.
- `failed` — пригодная representation не создана.

`partial` — не синоним технической ошибки. Это terminal outcome, который может требовать review.

### 4.2 Stage execution status

```ts
type ProcessingStageStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'timed_out'
  | 'not_supported';
```

`stage.status = succeeded` означает только то, что конкретный stage штатно завершил свою работу. Это не означает `ExtractionOutcome.succeeded`, `QualityOutcome.pass` или indexing eligibility.

Для stage, который корректно завершился с partial output, нельзя механически подменять execution status на `failed`. Его execution может быть `succeeded`, а extraction outcome — `partial`. Эти значения отвечают на разные вопросы.

### 4.3 Quality outcome

```ts
type ExtractionQualityOutcome =
  | 'pass'
  | 'review_required'
  | 'fail';
```

- `pass` — результат прошёл обязательные quality checks выбранного profile.
- `review_required` — результат существует, но имеет ограничения/предупреждения, которые нельзя скрывать.
- `fail` — результат не пригоден для downstream использования.

Quality report должен содержать версию правил, проверенные измерения, warnings/errors и provenance. Один агрегированный «quality score» не заменяет причины outcome.

### 4.4 Index eligibility

```ts
type IndexEligibility =
  | 'eligible'
  | 'ineligible'
  | 'restricted';
```

- `eligible` — representation может попасть в обычную generation после всех остальных gates.
- `ineligible` — запрещено включать в generation.
- `restricted` — допустим только отдельный явно обозначенный режим, если такой режим будет принят отдельным продуктовым решением.

Для MVP `restricted` не означает разрешение индексировать автоматически. Пока limited-search режим не утверждён, фактическое поведение `restricted` — исключение из обычного retrieval.

### 4.5 Locator quality

```ts
type LocatorConfidence =
  | 'verified'
  | 'parser_derived'
  | 'approximate'
  | 'unavailable';
```

- `verified` — locator проверен относительно representation и source mapping с требуемой точностью.
- `parser_derived` — locator сформирован parser-ом и однозначно разрешается в representation, но не прошёл дополнительную внешнюю/визуальную проверку.
- `approximate` — координаты приблизительные; нельзя обещать точное выделение исходного фрагмента.
- `unavailable` — стабильный locator отсутствует.

Locator confidence не должен выводиться из extraction outcome или quality outcome. Документ может иметь общий `pass`, но отдельный блок с `unavailable` locator.

### 4.6 Evidence reference integrity

Evidence Validation остаётся отдельным gate:

```ts
type ReferenceIntegrityStatus =
  | 'valid'
  | 'valid_with_limitations'
  | 'invalid'
  | 'unverifiable';
```

Даже `verified` locator не доказывает, что цитата поддерживает claim. Он доказывает только корректность разрешения ссылки на source representation. Claim Support и Legal Applicability оцениваются отдельно.

---

## 5. Каноническая policy matrix

### 5.1 Базовая матрица для MVP

| Extraction outcome | Quality outcome | Index eligibility | Обычный FTS/RAG retrieval | Citation / Evidence |
|---|---|---|---|---|
| `succeeded` | `pass` | `eligible` после остальных gates | Разрешён после ACL и generation gates | Разрешено только при валидном source binding и locator |
| `partial` | `review_required` | `ineligible` по умолчанию; `restricted` только после отдельного решения | Не включать в обычный retrieval | Не выдавать как полноценное evidence; ограниченный режим не утверждён |
| `succeeded` | `review_required` | `ineligible` по умолчанию | Не включать в обычный retrieval | Не выдавать как полноценное evidence |
| `partial` | `fail` | `ineligible` | Запрещён | Evidence не создаётся |
| `failed` | `fail` | `ineligible` | Запрещён | Evidence не создаётся |
| `failed` | `pass` | Invalid combination | Запрещён | Контрактная ошибка |
| `partial` | `pass` | Invalid combination без явно описанного исключения | Запрещён до объяснения | Контрактная ошибка |
| любое | quality report отсутствует | `ineligible` для searchable profile | Запрещён | Нельзя молча считать качество приемлемым |

**Рекомендация:** сочетания `partial + pass` и `failed + pass` должны приводить к validation error или quarantine, а не к автоматической нормализации статуса.

### 5.2 Locator gate применяется независимо

| Locator confidence | Indexing | Retrieval | Citation |
|---|---|---|---|
| `verified` | Не влияет сам по себе | Может участвовать при успешных остальных gates | Может пройти Reference Integrity |
| `parser_derived` | Не блокирует indexing сам по себе | Может участвовать при успешных остальных gates | Допустимо при успешной проверке source mapping и прозрачной маркировке confidence |
| `approximate` | Не обязательно блокирует retrieval | Может участвовать только если quality/policy допускает | Нельзя обещать точное выделение; ограничения должны быть видны |
| `unavailable` | FTS indexing может быть разрешён, если policy это допускает | Может быть найден как текст, но не должен считаться citation-grade | Не создавать точную цитату; Reference Integrity — `unverifiable` или citation unavailable |

Ключевой вывод: **поисковая пригодность не равна цитатной пригодности**. Текст может быть полезен для поиска, но не иметь надёжной привязки к исходному документу.

### 5.3 Прочие обязательные gates

Даже `eligible` не означает автоматическое включение. Перед публикацией в generation должны пройти:

1. tenant/workspace/document scope validation;
2. document version is current/allowed by supersession policy;
3. source checksum verified;
4. extraction artifact terminal and immutable;
5. quality report present and acceptable;
6. representation binding valid;
7. chunk mapping valid;
8. parser/config compatibility checks;
9. generation build manifest complete;
10. no deletion, legal hold, revocation or quarantine constraint;
11. ACL is enforced at retrieval time independently of indexing.

Index eligibility — необходимое, но не достаточное условие.

---

## 6. Стабильный representation binding

### 6.1 Logical DTO

```ts
interface ImmutableRepresentationBinding {
  documentId: string;
  documentVersionId: string;

  originalContentHash: string;

  extractionArtifactId: string;
  extractionPipelineVersion: string;

  representationId: string;
  representationHash: string;
  representationFormatVersion: string;
  normalizationVersion: string;

  parserName: string;
  parserVersion: string;

  createdAt: string;
}
```

Поля — логическая модель. Не требуется раскрывать все значения клиенту. Backend должен иметь возможность разрешить binding без эвристического поиска «последней extraction».

### 6.2 Hash semantics

Hash должен быть детерминированным и иметь явно зафиксированную область:

- `originalContentHash` — hash точных оригинальных байтов `DocumentVersion`;
- `representationHash` — hash канонической сериализации representation, включая порядок блоков и значимые locator metadata;
- `chunkContentHash` — при необходимости hash содержимого конкретного chunk, не замена representation hash.

Нельзя считать hash нормализованного текста hash оригинального файла. Нельзя вычислять representation hash из произвольно сериализованного JSON, если порядок ключей/массивов не канонизирован.

Рекомендуется зафиксировать алгоритм (например SHA-256) и canonical serialization format в отдельном implementation ADR. Не оставлять алгоритм/encoding на усмотрение каждой реализации.

### 6.3 Representation identity

`representationId` должен быть уникальным и неизменяемым. Не использовать в качестве единственной идентичности:
- `documentVersionId`;
- имя файла;
- номер страницы;
- `parserVersion`;
- `createdAt`;
- `chunkId`.

Одной пары `(documentVersionId, parserVersion)` может быть недостаточно: параметры, normalization rules, OCR engine, language hints или extraction configuration тоже способны изменить результат. Поэтому точный binding должен включать representation identity/hash и pipeline provenance.

### 6.4 Source block mapping

```ts
interface SourceBlockBinding {
  sourceBlockId: string;
  representationId: string;
  blockOrdinal: number;

  blockType: string;
  textHash: string;

  locator: {
    pageNumber?: number;
    headingPath?: string[];
    paragraphOrdinal?: number;
    startOffset?: number;
    endOffset?: number;
    offsetUnit?: 'utf16' | 'unicode_codepoint' | 'byte';
  };
}
```

Условия:
- `blockOrdinal` относится только к конкретной representation;
- offsets имеют явную единицу измерения;
- offsets относятся к конкретному текстовому payload;
- `pageNumber` не должен выдумываться для форматов без достоверной пагинации;
- heading path — структурная подсказка, а не самостоятельный уникальный ключ;
- изменение representation требует новых SourceBlock IDs либо нового namespace, не переписывания старых блоков.

---

## 7. Evidence locator должен быть version-bound

### 7.1 Logical evidence binding

```ts
interface UserDocumentEvidenceBinding {
  sourceType: 'user_document';

  documentId: string;
  documentVersionId: string;
  originalContentHash: string;

  extractionArtifactId: string;
  representationId: string;
  representationHash: string;

  sourceBlockIds: string[];
  locator: EvidenceLocator;

  chunkId?: string;
  indexGenerationId?: string;

  locatorConfidence: LocatorConfidence;
}
```

`chunkId` и `indexGenerationId` — retrieval provenance. Они не заменяют canonical source binding. Если generation удалена, evidence должен оставаться разрешимым через immutable representation, пока retention policy сохраняет её.

### 7.2 Что хранить в Evidence Reference

Evidence snapshot должен содержать минимум:
- тип источника;
- stable source identity;
- source version identity;
- representation binding;
- locator;
- retrieved excerpt или защищённую ссылку на snapshot excerpt (в зависимости от retention/security design);
- retrieval provenance;
- `retrievedAt`;
- ACL/authorization context reference или audit correlation ID — без превращения этого в вечный grant;
- locator confidence;
- reference integrity status и причины ограничений.

Не нужно дублировать в Evidence полный документ. Но нельзя оставлять Evidence только с `documentId + offsets`, если offsets не имеют representation binding.

### 7.3 Resolution algorithm

При открытии цитаты backend должен:

1. Проверить право текущего пользователя на source content **сейчас**, а не полагаться на старое разрешение.
2. Загрузить точный `representationId`, указанный в Evidence.
3. Проверить, что representation hash совпадает с сохранённым `representationHash`.
4. Разрешить `sourceBlockIds` и locator внутри этой representation.
5. Проверить, что полученный excerpt соответствует сохранённому excerpt hash/expected text, если он хранится.
6. Вернуть excerpt и source locator с реальными ограничениями.
7. Если representation отсутствует, hash mismatch или mapping не разрешается — вернуть `unverifiable`/`unavailable`, не подменять representation текущей.

Запрещено fallback-поведение вида: «старого parser output нет — возьмём последний extraction этого документа и применим старые offsets».

### 7.4 Отдельные состояния resolution

```ts
type EvidenceResolutionStatus =
  | 'resolved'
  | 'source_access_denied'
  | 'source_deleted'
  | 'representation_missing'
  | 'representation_hash_mismatch'
  | 'locator_unresolvable'
  | 'excerpt_mismatch'
  | 'retention_expired';
```

Это operational result resolution, не Reference Integrity и не Claim Support. API может маппить его на безопасный публичный response, не раскрывая существование недоступного документа.

---

## 8. Reprocessing и новая версия parser

### 8.1 Правило неизменности

При повторной обработке той же `DocumentVersion`:

- создаётся новый `ExtractionArtifact`;
- создаётся новая `TextRepresentation`;
- новые source blocks/chunks получают новые identities;
- создаётся новая index generation;
- Evidence, созданное на старой representation, не переписывается.

### 8.2 Старые evidence references

Возможны три результата:

1. **Старое representation сохранено и доступно** — Evidence разрешается по старой привязке.
2. **Старое representation удалено по policy** — Evidence становится `unverifiable`/`retention_expired`; старый locator не переносится на новую representation.
3. **Старая representation признана ошибочной/скомпрометированной** — Evidence может быть помечено как invalidated/revoked отдельным событием, с сохранением audit trail в пределах retention policy.

Не следует автоматически пересчитывать Claim Support на новой representation без нового assessment run. Иначе изменится evidence basis уже сформированного ответа без прозрачной истории.

### 8.3 Новая версия оригинального файла

`DocumentVersion` меняется только при новой загрузке/замене оригинала. Новая версия не должна перезаписывать старую.

Поведение старой версии после загрузки новой определяется DR-O03. До согласования:
- не считать новую версию активной только по факту upload;
- не смешивать chunks двух версий в одной generation без явной policy;
- не менять evidence binding старых сообщений;
- применять отдельную политику revocation/supersession, а не технический default.

---

## 9. Index generation contract

Generation строится из фиксированного набора входов:

```ts
interface IndexBuildInput {
  documentVersionId: string;
  extractionArtifactId: string;
  representationId: string;
  representationHash: string;

  chunkingStrategyId: string;
  chunkingStrategyVersion: string;

  indexingProfile: 'fts' | 'hybrid';
  tokenizerConfigVersion: string;
  embeddingModelVersion?: string;
  embeddingDimensions?: number;

  eligibilityPolicyVersion: string;
}
```

Для FTS-only build поля embedding могут отсутствовать. Для hybrid build они обязательны и должны быть согласованы с vector index schema.

### 9.1 Build invariants

- Все chunks generation происходят из одной зафиксированной representation.
- Generation не должна смешивать результаты нескольких parser runs для одной source version.
- Все eligibility decisions фиксируются в build manifest.
- Generation immutable после завершения.
- Active pointer переключается атомарно после validation.
- До успешной активации предыдущая generation остаётся доступной, если не действует revocation/deletion/security policy.
- При retrieval возвращается provenance generation и representation.
- Generation activation не отменяет runtime ACL checks.

### 9.2 Не смешивать generation и document readiness

`IndexGeneration.status = active` — свойство поискового индекса, не lifecycle `Document`.

Capabilities вычисляются из актуального состояния и активной generation. Они не являются authorization grants.

---

## 10. Quality report: обязательная структура

```ts
interface ExtractionQualityReport {
  reportId: string;
  extractionArtifactId: string;
  representationId?: string;

  rulesetId: string;
  rulesetVersion: string;

  outcome: 'pass' | 'review_required' | 'fail';

  dimensions: {
    textCoverage?: number;
    structuralPreservation?: number;
    pageMappingCoverage?: number;
    tablePreservation?: number;
    encodingIntegrity?: number;
    suspiciousRepetition?: number;
  };

  warnings: Array<{
    code: string;
    severity: 'info' | 'warning' | 'critical';
    affectedBlockIds?: string[];
    affectedPageRange?: { from: number; to: number };
    description: string;
  }>;

  checks: Array<{
    checkId: string;
    status: 'passed' | 'warning' | 'failed' | 'not_applicable';
    evidence?: string;
  }>;

  assessedAt: string;
}
```

Числовые измерения необязательны, если их нельзя достоверно вычислить. Нельзя заполнять неизвестные coverage metrics фиктивными 100%.

### 10.1 Локальные ограничения

Если качество различается по страницам/блокам, report должен по возможности хранить affected ranges. Но MVP не обязан вводить сложную per-block eligibility, если нет надёжной диагностики.

Без достоверной локализации warning применяется консервативно ко всей representation. Нельзя индексировать «хорошие страницы», если система не может доказать, какие именно страницы хорошие.

---

## 11. API/UI semantics

Backend должен отдавать отдельные измерения, например:

```ts
interface DocumentProcessingSummary {
  documentStatus: 'active' | 'archived' | 'deleted' | 'quarantined';

  extraction: {
    outcome: 'succeeded' | 'partial' | 'failed' | 'pending';
    quality: 'pass' | 'review_required' | 'fail' | 'not_assessed';
  };

  searchCapabilities: {
    ftsSearchable: boolean;
    vectorSearchable: boolean;
    hybridSearchable: boolean;
  };

  citationCapabilities: {
    citationReady: boolean;
    limitations: string[];
  };
}
```

Это иллюстративный DTO, не финальный API contract. Его точные поля должны быть сопоставлены с DR-01…DR-09 и существующими endpoint contracts.

UI не должен показывать один зелёный «Готово», если:
- extraction завершился, но indexing ещё не выполнен;
- документ доступен для FTS, но не vector/hybrid;
- поиск доступен, но точные цитаты недоступны;
- quality outcome — `review_required`.

Рекомендуемые различимые состояния:
- «Обработка завершена»;
- «Доступен для текстового поиска»;
- «Доступен для гибридного поиска»;
- «Цитирование ограничено»;
- «Требуется проверка»;
- «Не удалось обработать».

Точный UX copy — отдельная задача. Не показывать пользователю внутренние enum напрямую.

---

## 12. Security и privacy invariants

1. Representation и extraction artifacts наследуют tenant/workspace/document ownership, но ACL проверяется в соответствии с текущим ACL contract.
2. Наличие chunk в индексе не даёт права читать исходный документ.
3. Evidence reference не является permission grant.
4. Старое успешное authorization decision не гарантирует доступ при последующем открытии цитаты.
5. Cache key должен включать source/representation/generation scope и authorization-sensitive partitioning согласно ACL contract.
6. При revoke/delete необходимо инвалидировать downstream cache и запрещать новые retrieval результаты.
7. Индексные payloads и representation text считаются защищёнными данными, даже если оригинальный файл уже недоступен через UI.
8. Логи не должны писать полный extracted text, raw evidence или клиентские фрагменты без утверждённой необходимости и redaction policy.
9. Hash не является anonymization: он не делает содержание публичным или безопасным для раскрытия.
10. Retention/deletion распространяется на extraction artifacts, representations, chunks, embeddings, evidence snapshots и backups по утверждённой policy.

---

## 13. Ошибки и fail-closed поведение

| Ситуация | Поведение |
|---|---|
| Нет quality report | `ineligible`, не индексировать |
| `partial + pass` без валидированного исключения | Quarantine/validation error |
| `failed + pass` | Contract violation |
| Representation hash mismatch | Evidence resolution fails; не fallback на latest |
| Chunk указывает на другой representation | Generation build fails |
| Generation manifest неполный | Не активировать generation |
| Locator `unavailable` | Search может быть возможен, citation unavailable |
| `review_required` | Не включать в обычный citation-grade retrieval |
| ACL revoked | Запретить retrieval/open независимо от active generation |
| Source deleted/retention expired | Не выдавать content; вернуть корректный resolution status |
| Parser version изменился | Новый artifact + representation; старые evidence не перепривязывать |

Не скрывать внутренние ошибки контрактов за общим `document ready`. Для диагностики использовать стабильные error codes, но публичные сообщения не должны раскрывать tenant existence или private content.

---

## 14. Acceptance tests

### 14.1 Extraction × quality × eligibility

| ID | Сценарий | Ожидаемый результат |
|---|---|---|
| EEB-001 | `succeeded + pass` | Eligible после остальных gates |
| EEB-002 | `partial + review_required` | Ineligible для обычного retrieval |
| EEB-003 | `succeeded + review_required` | Ineligible по MVP default |
| EEB-004 | `failed + fail` | Ineligible, evidence не создаётся |
| EEB-005 | `failed + pass` | Validation error |
| EEB-006 | `partial + pass` без exception rule | Validation error |
| EEB-007 | Quality report отсутствует | Searchable profile не строится |
| EEB-008 | Stage succeeded, extraction partial | Система сохраняет оба независимых outcome |
| EEB-009 | Quality pass, locator unavailable | Search может пройти; citationReady=false |
| EEB-010 | Quality pass, locator parser_derived | Citation возможна только после binding validation |

### 14.2 Immutable representation

| ID | Сценарий | Ожидаемый результат |
|---|---|---|
| EEB-011 | Один файл обработан parser v1 и v2 | Создаются разные representation IDs |
| EEB-012 | Representation hash изменился | Старый Evidence не разрешается на новую representation |
| EEB-013 | Старое representation сохранено | Старый Evidence разрешается точно по нему |
| EEB-014 | Старое representation удалено | Resolution сообщает unavailable/expired, без fallback |
| EEB-015 | Locator ссылается на неизвестный block | Evidence unverifiable/invalid |
| EEB-016 | Offset unit отсутствует | Locator validation fails |
| EEB-017 | Block order изменён в новой representation | Старые ordinals не переиспользуются |
| EEB-018 | Excerpt hash не совпадает | Resolution fails |
| EEB-019 | Source checksum не совпадает | Artifact quarantined; generation не активируется |
| EEB-020 | Chunk mapping указывает на чужую representation | Build fails |

### 14.3 Generation и security

| ID | Сценарий | Ожидаемый результат |
|---|---|---|
| EEB-021 | Generation содержит chunks двух representations | Build validation fails |
| EEB-022 | Manifest неполный | Activation запрещена |
| EEB-023 | Rebuild завершился ошибкой | Предыдущая generation остаётся active, если не revoked |
| EEB-024 | ACL отозван после indexing | Retrieval и citation open запрещены |
| EEB-025 | Evidence старого сообщения открывает пользователь без доступа | Content не раскрывается |
| EEB-026 | Source deleted, stale cache exists | Cache invalidated; content не возвращается |
| EEB-027 | Index active, representation inaccessible by ACL | Retrieval не возвращает chunk |
| EEB-028 | User has evidence ID but no source access | Evidence ID не даёт доступ к source |

### 14.4 Evaluation

| ID | Сценарий | Ожидаемый результат |
|---|---|---|
| EEB-029 | Citation resolves but does not support claim | Reference Integrity может быть valid; Claim Support не direct |
| EEB-030 | Claim support direct, locator unverifiable | Результат не проходит citation integrity gate |
| EEB-031 | Partial extraction пропустил абзац | Golden case фиксирует recall/coverage failure |
| EEB-032 | Parser upgrade меняет offsets | Regression test обнаруживает drift |
| EEB-033 | Старое evidence пересчитано на новом representation без нового run | Test fails |
| EEB-034 | Quality ruleset изменён | Новая assessment version, старый report не мутирует |

---

## 15. Observability и метрики

Минимальные operational metrics:

- extraction outcomes count: succeeded/partial/failed;
- quality outcomes count: pass/review_required/fail;
- indexing eligibility count: eligible/ineligible/restricted;
- indexing rejection reasons;
- representation hash mismatch count;
- locator resolution success/failure rate;
- citation resolution failure reasons;
- orphan chunks / invalid chunk-to-representation mappings;
- generation build and activation failures;
- evidence references whose representation is no longer retained;
- retrieval results filtered by ACL after SQL scope (ожидаемое значение — 0, если prefilter реализован правильно; любое ненулевое значение — security incident/bug signal).

Не оптимизировать метрики ценой качества. Например, снижение `review_required` не является улучшением, если оно достигается ослаблением quality checks.

---

## 16. План внедрения без преждевременной миграции

### Step A — contract enforcement

- Зафиксировать mapping outcomes в unit tests.
- Запретить indexing при отсутствующем quality report.
- Добавить validation для невозможных сочетаний.
- Убедиться, что stage execution status не используется как shortcut eligibility.

### Step B — representation identity

- Ввести immutable representation ID/hash в logical model.
- Добавить mapping SourceBlock/Chunk → representation.
- Обеспечить deterministic hash.
- Добавить parser reprocessing regression tests.

### Step C — Evidence binding

- Добавить representation binding в EvidenceReference.
- Обеспечить resolution algorithm с hash checks.
- Удалить fallback на latest extraction.
- Проверить ACL при каждом open citation.

### Step D — generation integration

- Включить representation binding в index build manifest.
- Валидировать однородность representation на generation.
- Атомарно активировать generation после validation.
- Сохранить старую generation только если это допускают deletion/revocation policies.

### Step E — migration strategy

До миграции существующих записей:
1. инвентаризировать Evidence/MessageSource/DocumentExtraction и фактические поля;
2. определить, можно ли восстановить representation binding из исторических данных;
3. не создавать фиктивный `representationId` задним числом без доказуемой связи;
4. legacy evidence без binding маркировать `legacy_unverifiable` или эквивалентным operational state;
5. определить migration/backfill отдельно, с rollback и audit plan.

Нельзя объявлять старые citations citation-grade только потому, что для них удалось заполнить nullable FK.

---

## 17. Рекомендации к согласованию

Рекомендую принять следующие положения:

| ID | Предложение | Рекомендация |
|---|---|---|
| EEB-01 | Extraction outcome, stage status, quality outcome, eligibility и locator confidence — отдельные dimensions | Принять |
| EEB-02 | `partial + review_required` по умолчанию исключён из обычного retrieval | Принять |
| EEB-03 | `review_required` не равен processing failure | Принять |
| EEB-04 | Нет quality report — нет searchable eligibility | Принять |
| EEB-05 | Searchability и citation readiness независимы | Принять |
| EEB-06 | Evidence locator всегда привязан к immutable representation | Принять |
| EEB-07 | При reprocessing старое evidence не перепривязывается автоматически | Принять |
| EEB-08 | Representation hash проверяется при citation resolution | Принять |
| EEB-09 | Generation не смешивает chunks разных representations | Принять |
| EEB-10 | Index eligibility не заменяет ACL | Принять |

---

## 18. Открытые вопросы

1. **EEB-O01 — Partial extraction scope.** Допустим ли отдельный limited-search режим для `partial + review_required`, или MVP полностью исключает такие документы до ручного review? Рекомендация: исключить из обычного retrieval; limited mode не вводить в MVP.
2. **EEB-O02 — Citation locator minimum.** Минимум для MVP: representation + block + offsets + page when available? Нужно ли требовать PDF coordinates? Связано с DR-O04. Рекомендация: не требовать PDF coordinates для всех форматов, но явно маркировать точность.
3. **EEB-O03 — Evidence retention.** Как долго хранить старые representations и evidence snapshots? Решается совместно с retention/legal hold policy, не этим контрактом.
4. **EEB-O04 — Legacy evidence.** Как отображать цитаты, созданные до representation binding? Рекомендация: не выдавать за verified; migration/backfill только при доказуемом mapping.
5. **EEB-O05 — Hash algorithm/canonical serialization.** Рекомендация SHA-256 + canonical serialization; точный формат закрепить implementation ADR.
6. **EEB-O06 — Source supersession.** Когда новая DocumentVersion заменяет старую в retrieval? Связано с DR-O03; требуется продуктовая политика.

---

## 19. Что нельзя делать

- Не создавать один общий `DocumentProcessingStatus`, который пытается кодировать extraction, quality, indexing и citation.
- Не трактовать `stage.succeeded` как разрешение индексировать.
- Не считать `quality.pass` доказательством корректности locator.
- Не считать FTS hit доказательством поддержки claim.
- Не использовать offsets без representation identity/version.
- Не перепривязывать старые evidence на последний extraction.
- Не смешивать chunks разных representations в одной generation.
- Не использовать `chunkId` как единственную source identity.
- Не считать `eligible` эквивалентом `authorized`.
- Не раскрывать source text по одному Evidence ID без повторной ACL проверки.
- Не backfill-ить исторические evidence фиктивными binding values.
- Не менять Prisma/API до отдельного crosswalk и явного согласования.

---

## 20. Критерии готовности контракта

Контракт может быть передан в implementation design, когда:
- EEB-01…EEB-10 согласованы;
- EEB-O01…EEB-O06 имеют явные решения или зафиксированные ограничения MVP;
- DTO сопоставлен с текущими Prisma models и API;
- migration strategy описывает legacy evidence;
- acceptance tests покрыты тест-планом;
- security review подтвердил ACL recheck и отсутствие fallback на latest representation;
- evaluation harness способен обнаруживать parser/locator drift.

**Текущий статус: OPEN — ожидает явного согласования пользователя.**

---

## 21. Связь с дальнейшей работой

После согласования:
1. выполнить crosswalk к текущим Prisma models, migration history и API contracts;
2. закрыть CCR-06 — discriminated source identity для разных source types;
3. перейти к P1: generation identity/manifest и temporal provenance;
4. затем подготовить implementation slices для Cursor, не меняя код до отдельного подтверждения.


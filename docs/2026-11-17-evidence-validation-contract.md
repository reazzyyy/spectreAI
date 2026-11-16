# Evidence Validation Contract — проверка источников, поддержки утверждений и правовой применимости

**Статус:** PROPOSED. Документ не меняет `decisions-log.md`, D/O/H decisions, Gate B, FILE-009, O-002, O-006 и другие существующие решения.

**Дата:** 2026-11-17  
**Область:** общий контракт доказательной базы для пользовательского RAG и Legal Research.  
**Назначение:** отделить техническую корректность ссылки от фактической поддержки утверждения и от юридической применимости нормы/позиции.

> Важно: этот документ задаёт проверяемые границы и интерфейсы. Он не утверждает, что текущая реализация уже умеет выполнять semantic entailment или полноценный юридический анализ. Это целевой контракт и план проверок.

---

## 1. Ключевое архитектурное решение-кандидат

Нельзя использовать один флаг `citationValid=true` как доказательство корректности юридического ответа. Проверка должна состоять из трёх независимых уровней:

1. **Reference Integrity** — существует ли источник, версия, фрагмент и locator; совпадают ли реквизиты и цитата с сохранённым источником.
2. **Claim Support** — подтверждает ли конкретный фрагмент конкретное утверждение, и каким способом: прямо, косвенно/через вывод или не подтверждает.
3. **Legal Applicability** — применимо ли правовое положение к указанной юрисдикции, периоду, субъектам и фактам; учтены ли редакции, переходные положения, исключения и конкурирующие позиции.

Эти уровни связаны, но не взаимозаменяемы. Успешная проверка предыдущего уровня является необходимым условием для следующего, но не гарантирует его успешность.

### 1.1. Что нельзя утверждать

- Существующая ссылка не означает, что цитата точна.
- Точная цитата не означает, что она подтверждает сформулированное утверждение.
- Подтверждение утверждения текстом не означает, что норма применима к конкретным фактам.
- Правильная редакция на дату сама по себе не доказывает применимость: могут действовать переходные правила, специальные нормы и исключения.
- Оценка LLM, включая отдельную judge-модель, не является юридической истиной и не заменяет экспертную разметку.

## 2. Границы и типы evidence

### 2.1. Классы источников

Каждое доказательство должно сохранять происхождение. Минимальные классы:

| Класс | Примеры | Что может подтверждать |
|---|---|---|
| `user_document` | договор, переписка, акт, заключение клиента | факты и формулировки, содержащиеся в переданном документе |
| `legal_primary_source` | официально опубликованный НПА, официальный текст нормы | содержание нормативного регулирования в пределах проверенной редакции |
| `court_source` | судебный акт из подтверждённого источника | содержание судебного акта и изложенную в нём позицию |
| `licensed_secondary_source` | лицензированная справочная/аналитическая база | вторичный комментарий или аналитическое изложение в рамках прав использования |
| `secondary_publication` | статья, комментарий, публикация | мнение/анализ автора, но не замену первоисточника |
| `system_fact` | серверные метаданные, дата загрузки, статус индекса | технические факты о состоянии системы |

Система не должна повышать авторитетность источника только из-за формата, наличия URL или уверенного текста модели. Тип и provenance назначаются сервером на основании реестра источников/документа, а не по просьбе LLM.

### 2.2. Evidence не равно Chunk

`Chunk` — поисковая единица индекса. `Evidence` — единица обоснования утверждения. Одно evidence может ссылаться на chunk, несколько соседних блоков, структурный узел или точный диапазон исходного документа.

Нельзя делать `chunkId` единственным долгосрочным идентификатором цитаты: chunking, parser и index generation могут меняться. Доказательство должно ссылаться на стабильный источник и версию, а chunk использовать как provenance retrieval.

## 3. Канонический Evidence Reference

Ниже — логический контракт. Он не предписывает немедленно создавать Prisma-модели с этими именами.

```typescript
type EvidenceSourceKind =
  | 'user_document'
  | 'legal_primary_source'
  | 'court_source'
  | 'licensed_secondary_source'
  | 'secondary_publication'
  | 'system_fact';

interface EvidenceReference {
  evidenceId: string;              // stable within answer/research run
  sourceKind: EvidenceSourceKind;   // server-derived
  sourceId: string;
  sourceVersionId: string | null;
  sourceSnapshotId: string | null;
  documentVersionId: string | null;
  chunkId: string | null;           // retrieval provenance, not sole identity
  indexGenerationId: string | null;
  locator: EvidenceLocator;
  exactText: string | null;         // exact source text, if retained and permitted
  exactTextHash: string | null;
  sourceMetadataSnapshot: Record<string, unknown>;
  retrievedAt: string;
  temporalContext: EvidenceTemporalContext | null;
}

interface EvidenceLocator {
  locatorType:
    | 'page_range'
    | 'paragraph'
    | 'heading_path'
    | 'article_clause'
    | 'table_cell'
    | 'source_offset'
    | 'external_anchor'
    | 'document_only';
  pageStart?: number;
  pageEnd?: number;
  headingPath?: string[];
  structuralLabel?: string;
  paragraphId?: string;
  startOffset?: number;
  endOffset?: number;
  externalAnchor?: string;
  displayLabel: string;
  confidence: 'verified' | 'parser_derived' | 'approximate' | 'unavailable';
}

interface EvidenceTemporalContext {
  requestedAsOfDate?: string | null;
  sourcePublicationDate?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  recordedAt?: string | null;
  retrievedAt: string;
  temporalResolution: 'resolved' | 'partially_resolved' | 'unknown' | 'not_applicable';
  resolutionNotes?: string[];
}
```

Правила:
- `sourceKind`, `sourceId`, version IDs, `retrievedAt`, `indexGenerationId` и фактический locator должны формироваться/подтверждаться сервером.
- Модель может возвращать только `evidenceId` из предоставленного ей ContextSnapshot, но не произвольные source IDs или URL.
- `exactText` может отсутствовать, если источник не разрешает хранение полного фрагмента или locator недоступен. В таком случае система обязана честно понизить уровень проверки.
- `sourceMetadataSnapshot` должен быть ограниченным и очищенным от секретов/лишних персональных данных.
- `approximate` locator не должен отображаться пользователю как точная страница/пункт.

## 4. Уровень 1 — Reference Integrity

### 4.1. Проверки

Reference Integrity Validator проверяет в детерминированном коде:

1. `evidenceId` присутствует в ContextSnapshot текущего ответа/research run.
2. Evidence относится к тому же tenant/organization и допустимому retrieval scope.
3. Source и версия существуют и не удалены/не отозваны.
4. Evidence ссылается на реально сохранённый source snapshot или document version.
5. Locator существует в соответствующей версии и соответствует типу источника.
6. `exactTextHash` совпадает с пересчитанным хешем точного сохранённого текста.
7. Цитируемый моделью текст совпадает с точным исходным диапазоном либо проходит заранее определённую Unicode-нормализацию с сохранением исходной формы.
8. Реквизиты (название, номер, дата, суд, номер дела, статья/пункт) соответствуют source metadata.
9. URL получен из проверенных метаданных источника, а не сгенерирован моделью.
10. Если ответ зависит от версии/даты — version binding и temporal metadata присутствуют.

### 4.2. Результаты проверки

```typescript
type ReferenceIntegrityStatus =
  | 'valid'
  | 'valid_with_limitations'
  | 'invalid'
  | 'unverifiable';

interface ReferenceIntegrityResult {
  evidenceId: string;
  status: ReferenceIntegrityStatus;
  checks: Array<{
    code: string;
    status: 'passed' | 'failed' | 'not_checked' | 'not_applicable';
    details?: string;
  }>;
  verifiedLocator: EvidenceLocator | null;
  verifiedQuote: string | null;
  validatedAt: string;
  validatorVersion: string;
}
```

`valid_with_limitations` допустим, например, если source/version подтверждены, но внешний URL временно недоступен. `unverifiable` не означает `valid`. `invalid` означает обнаруженное несоответствие и блокирует использование как подтверждённой ссылки.

### 4.3. Цитатное совпадение

Для дословной цитаты:
- хранить исходный текст без потери пунктуации и структуры;
- сравнивать по source offsets, если они надёжны;
- fallback на exact substring;
- нормализованное сравнение разрешать только для заранее перечисленных безопасных преобразований (например, CRLF/LF или нормализация Unicode), сохраняя оригинальную цитату;
- не удалять отрицания, цифры, знаки сравнения, номера пунктов, даты и единицы измерения;
- если точное совпадение невозможно, не выдавать модельный текст в кавычках как дословную цитату.

Не использовать fuzzy match для автоматического подтверждения дословной цитаты. Fuzzy matching может предложить оператору кандидата на ручную проверку, но не менять статус на `valid`.

## 5. Уровень 2 — Claim Support

### 5.1. Гранулярность утверждений

Ответ разбивается на атомарные claims. Одно утверждение должно выражать одну проверяемую мысль. Сложные предложения с несколькими правовыми условиями следует делить, иначе одна ссылка может подтверждать только часть предложения.

Пример:

Плохо:
> «Договор заключён надлежащим образом, условие действительно, а сторона обязана уплатить неустойку».

Лучше разделить на claims:
- `C1`: договор содержит условие о неустойке;
- `C2`: условие согласовано сторонами в установленной форме;
- `C3`: условие действительно при установленных фактах;
- `C4`: при наступлении предусмотренных условий возникает обязанность уплатить неустойку.

`C1` может подтверждаться договором. `C2–C4` могут требовать иных доказательств, правовых норм и анализа обстоятельств. Нельзя автоматически распространить подтверждение одного claim на остальные.

### 5.2. Claim contract

```typescript
type ClaimSupportType =
  | 'direct'
  | 'inference'
  | 'not_supported'
  | 'conflicting'
  | 'not_assessed';

interface AnswerClaim {
  claimId: string;
  text: string;
  materiality: 'material' | 'supporting' | 'contextual';
  claimKind:
    | 'document_fact'
    | 'legal_rule'
    | 'court_position'
    | 'interpretation'
    | 'procedural_fact'
    | 'recommendation'
    | 'system_fact';
  evidenceIds: string[];
  supportType: ClaimSupportType;
  supportRationale?: string;
  counterEvidenceIds?: string[];
  confidence?: number; // calibrated only if validated; never a truth probability by default
}
```

`confidence` не является обязательным полем. Не показывать пользователю проценты уверенности, пока нет калибровки на размеченном наборе. Внутренний confidence LLM нельзя трактовать как вероятность истинности.

### 5.3. Значение support types

| Значение | Семантика | Разрешённое представление |
|---|---|---|
| `direct` | Источник прямо содержит факт/правило, соответствующее claim | «Подтверждается источником» при успешном integrity check |
| `inference` | Claim следует из совокупности evidence через явно описанный логический шаг | «Вывод на основании источников», с объяснением связки |
| `not_supported` | Достаточного подтверждения не найдено | Не представлять как установленный факт |
| `conflicting` | Найдены существенные несовместимые evidence | Показать конфликт и не сводить к одному без основания |
| `not_assessed` | Проверка не запускалась или не завершилась | Не показывать как подтверждённое |

`direct` не означает, что источник истинный или юридически применимый. Например, пользовательский договор прямо подтверждает, что в нём написано условие, но не подтверждает его действительность.

### 5.4. Проверка поддержки

Проверка должна учитывать:
- точность и полноту claim;
- тип источника и то, какие факты он способен подтверждать;
- точный quoted span и surrounding context;
- наличие отрицаний, исключений, условий и оговорок;
- scope утверждения (все случаи или только частный случай);
- согласованность evidence между собой;
- наличие контрдоказательств;
- временную применимость, если claim temporal.

Рекомендуемый конвейер:

1. Server validates evidence references.
2. Claim splitter получает атомарные claims (структурированный ответ модели + server-side validation; сложные claims отправляются на повторную декомпозицию).
3. Deterministic checks применяются там, где возможны (цитата, числа, даты, реквизиты, точные факты документа).
4. Semantic support assessment классифицирует direct/inference/not_supported/conflicting.
5. Для material claims, влияющих на юридический вывод, применяется более строгий порог и, при необходимости, ручная экспертная проверка.
6. Итоговый response policy решает, можно ли показывать claim как подтверждённый, нужно ли оговорить ограничение или отказаться от вывода.

LLM/judge допустим как вспомогательный классификатор и triage, но не единственный validator. Необходимо измерять его false-positive rate на экспертно размеченных примерах. Для критичных claim нужен либо детерминированный тест, либо подтверждённая экспертная процедура.

## 6. Уровень 3 — Legal Applicability

### 6.1. Отдельная задача, не свойство citation

Legal Applicability отвечает не на вопрос «существует ли норма?», а на вопрос «можно ли применить это положение к конкретной ситуации и периоду на основании доступных фактов?».

Она зависит как минимум от:
- юрисдикции и компетенции органа;
- типа регулируемых отношений;
- даты события/отношения и даты, на которую запрошен анализ;
- редакции акта и конкретного положения;
- вступления в силу и прекращения действия;
- переходных положений и специальных правил;
- предметной, субъектной и территориальной сферы нормы;
- исключений и условий применения;
- установленных, опровергнутых и неизвестных фактов;
- релевантных судебных позиций и возможных расхождений.

### 6.2. Applicability result

```typescript
type ApplicabilityStatus =
  | 'applicable'
  | 'not_applicable'
  | 'partially_applicable'
  | 'disputed'
  | 'unknown'
  | 'not_assessed';

interface LegalApplicabilityAssessment {
  assessmentId: string;
  claimId: string;
  legalEvidenceIds: string[];
  factEvidenceIds: string[];
  jurisdiction: string | null;
  relevantPeriod: { from?: string | null; to?: string | null } | null;
  requestedAsOfDate: string | null;
  status: ApplicabilityStatus;
  satisfiedConditions: string[];
  unsatisfiedConditions: string[];
  unknownConditions: string[];
  exceptionsConsidered: string[];
  transitionRulesConsidered: string[];
  conflictingAuthorities: string[];
  rationale: string;
  unresolvedQuestions: string[];
  resolverVersion: string;
}
```

Это logical DTO, не готовая Prisma schema. Не внедрять универсальный rule engine ради заполнения всех полей. На MVP можно возвращать `unknown` и список недостающих фактов.

### 6.3. Трёхзначная логика фактов

Для условий применимости использовать `true`, `false`, `unknown`, а не бинарный boolean, если факт не установлен.

- `true` — подтверждён допустимым evidence;
- `false` — опровергнут допустимым evidence;
- `unknown` — источников недостаточно, они противоречат друг другу или вопрос не исследован.

Отсутствие упоминания факта в документе не означает `false`. Отсутствие найденной нормы не означает, что нормы не существует.

### 6.4. Temporal resolver

Temporal resolution должен использовать контракт `docs/ai/retrieval/06-temporal-legal-retrieval.md` и открытые вопросы/решения из `docs/decisions-log.md`. Этот документ не выбирает вместо них значения valid time, recorded time, event date или transition-control date.

Для каждой temporal applicability оценки требуется сохранить:
- пользовательскую дату анализа;
- фактический период отношений/событий, если известен;
- редакцию/версию положения;
- основание выбора версии;
- переходные положения, проверенные системой;
- неизвестные даты и факты;
- дату получения и snapshot источника.

Если требуемые даты/переходные правила не разрешены — `unknown` или `disputed`, а не автоматическое `applicable`.

## 7. Contradiction handling

### 7.1. Не скрывать конфликт усреднением

RRF, reranker и semantic similarity ранжируют соответствие запросу. Они не должны самостоятельно разрешать противоречия источников или выбирать юридически авторитетную позицию.

Система должна различать:
- текстовые противоречия внутри документов;
- конфликт версий одного источника;
- конфликт фактических доказательств;
- расхождение судебных позиций;
- различие между нормами общего и специального регулирования;
- кажущееся противоречие, объясняемое разными датами/сферами действия.

### 7.2. Conflict record

```typescript
interface EvidenceConflict {
  conflictId: string;
  claimId: string;
  evidenceIds: string[];
  conflictType:
    | 'source_version'
    | 'fact'
    | 'legal_rule'
    | 'court_position'
    | 'scope_or_temporal'
    | 'other';
  description: string;
  resolutionStatus: 'unresolved' | 'partially_resolved' | 'resolved_with_rationale';
  resolutionRationale?: string;
  reviewerId?: string;
  reviewedAt?: string;
}
```

Автоматическое разрешение допускается только для детерминированных случаев (например, подтверждённая более поздняя редакция для явно заданной даты при отсутствии переходных исключений). Для неоднозначных судебных позиций или спорной применимости система обязана показать конфликт/ограничение.

## 8. Answer assembly и response policy

### 8.1. Минимальный структурированный результат

```typescript
interface ValidatedAnswer {
  answerId: string;
  contextSnapshotId: string;
  claims: AnswerClaim[];
  evidence: EvidenceReference[];
  referenceChecks: ReferenceIntegrityResult[];
  applicability: LegalApplicabilityAssessment[];
  conflicts: EvidenceConflict[];
  overallStatus:
    | 'supported'
    | 'supported_with_limitations'
    | 'partially_supported'
    | 'insufficient_evidence'
    | 'conflicting_evidence'
    | 'validation_failed';
  limitations: string[];
  generatedAt: string;
  validatorPipelineVersion: string;
}
```

### 8.2. Правила показа

| Ситуация | Поведение |
|---|---|
| Reference integrity valid + claim direct + applicability applicable | Можно показать как подтверждённый вывод с источником и временным основанием |
| Reference valid + claim inference | Явно обозначить как вывод/интерпретацию, показать связку доказательств |
| Reference valid + claim not_supported | Убрать из категоричного ответа или обозначить как неподтверждённую гипотезу, если это полезно |
| Reference invalid | Не использовать как подтверждённую ссылку; исключить или сообщить о сбое проверки |
| Reference unverifiable | Не маркировать как проверенную цитату; показать ограничение или запросить проверку |
| Applicability unknown | Не формулировать безусловное заключение о применимости; перечислить недостающие факты/даты |
| Evidence conflicting | Показать существенные позиции и конфликт; не выбирать победителя по score |
| No hits | Сообщить, что поиск не нашёл подтверждений в доступном корпусе, но не утверждать, что нормы/условия не существует |

### 8.3. Material claims

К material claims относятся утверждения, меняющие правовую оценку, рекомендацию, вывод о сроке/обязанности/ответственности/риске или предложенное действие.

Для каждого material claim обязательно:
- не менее одного проверенного evidence либо явное указание, что подтверждение отсутствует;
- корректный support type;
- applicability assessment, если claim о правовой применимости;
- видимое обозначение unresolved conditions/conflicts;
- запрет на категоричную формулировку при `unknown`, `not_supported` или `disputed`.

Не устанавливать универсальное правило «каждому предложению нужна ссылка»: это создаст шум. Требование относится к проверяемым существенным claims. Общие пояснения и переходные фразы могут не иметь отдельной ссылки.

## 9. Безопасность, provenance и жизненный цикл

1. Все evidence IDs ограничены `ContextSnapshot` конкретного ответа/research run.
2. Нельзя повторно использовать evidence key из другого пользователя, организации или поколения контекста.
3. Перед финальной выдачей повторно проверяются ACL и состояние источника/версии по контракту ACL из отдельного документа.
4. Отзыв доступа или удаление источника должны блокировать дальнейшую выдачу ссылок/фрагментов согласно политике retention/deletion.
5. Сгенерированный моделью URL, номер дела, статья или реквизит не считается evidence.
6. Контент источника — недоверенные данные, не инструкции для orchestrator/validator.
7. Для каждого validation run фиксируются версии parser, source snapshot, prompt/model (если применимо), validator, evaluation config и ContextSnapshot.
8. Не хранить избыточные копии персональных данных в audit log; использовать IDs, hashes и минимальные excerpts в пределах разрешённого режима.
9. Если лицензия источника запрещает сохранение текста, сохранять только допустимые metadata/locators/hashes и выполнять доступные проверки без нарушения условий.
10. Не раскрывать в пользовательском ответе внутренние причины ACL отказа, если это может выдать существование чужого документа.

## 10. Ошибки и деградация

Ошибки проверки должны быть типизированы, а не сводиться к `false`:

- `EVIDENCE_NOT_IN_SNAPSHOT`;
- `SOURCE_NOT_FOUND`;
- `SOURCE_VERSION_MISMATCH`;
- `LOCATOR_NOT_FOUND`;
- `QUOTE_MISMATCH`;
- `METADATA_MISMATCH`;
- `SOURCE_ACCESS_REVOKED`;
- `TEMPORAL_CONTEXT_MISSING`;
- `CLAIM_NOT_ATOMIC`;
- `SUPPORT_NOT_ESTABLISHED`;
- `CONFLICT_DETECTED`;
- `APPLICABILITY_UNKNOWN`;
- `VALIDATOR_UNAVAILABLE`.

При недоступности validator нельзя молча считать проверку успешной. Политика деградации:
- Reference Integrity — fail closed для выдачи как проверенной цитаты;
- Claim Support — `not_assessed`, не повышать до `direct`;
- Legal Applicability — `not_assessed`/`unknown`, не делать категоричный правовой вывод.

## 11. Observability и аудит

Для каждого запуска хранить минимально необходимую трассу:
- answer/research run ID и ContextSnapshot ID;
- claim IDs и evidence IDs;
- retrieval source/version/generation;
- результаты каждого уровня проверки;
- коды ошибок и причины ограничения;
- validator/prompt/model/config versions;
- latency и retry count;
- был ли человек-рецензент и какое решение принял.

Не логировать полный клиентский документ или весь prompt по умолчанию. Подробные excerpts — только при явной необходимости, правовом основании и доступе.

## 12. Evaluation framework

Нужны отдельные тестовые suites; нельзя смешивать метрики в один общий «legal accuracy».

### 12.1. Reference Integrity suite

- source/version binding accuracy;
- locator accuracy;
- exact quote match rate;
- metadata accuracy;
- fabricated reference rate;
- invalid reference escape rate.

Критерий для production: ни одна заведомо невалидная ссылка не должна проходить как `valid` в acceptance suite. Это тестовый порог, не гарантия абсолютного отсутствия ошибок в эксплуатации.

### 12.2. Claim Support suite

- claim decomposition precision/recall;
- direct-support precision/recall;
- inference classification precision/recall;
- unsupported claim rate;
- material unsupported claim rate;
- contradiction detection recall;
- false-supported rate (особенно критична).

Для false-supported rate нужна экспертная разметка. Автоматический judge не должен одновременно создавать gold label и оценивать себя.

### 12.3. Applicability suite

- temporal version accuracy;
- transition-rule handling accuracy;
- fact-state accuracy (`true`/`false`/`unknown`);
- applicability precision/recall;
- correct abstention rate;
- false-applicability rate;
- conflict presentation completeness.

### 12.4. Срезы тестирования

Каждая suite должна иметь отдельные slice по:
- user documents / primary legal sources / court decisions / secondary sources;
- PDF/DOCX/TXT и extraction quality tier;
- точным реквизитным запросам и semantic queries;
- коротким и составным claims;
- наличию исключений, отрицаний, таблиц и cross-references;
- temporal/historical cases;
- conflicting evidence;
- incomplete/unknown facts;
- ACL scope и revoked access.

### 12.5. Начальный набор сценариев

1. Ссылка существует, но цитата относится к другой редакции.
2. Цитата дословно совпадает, но не подтверждает claim.
3. Договор содержит условие, но вывод о его действительности не следует из одного договора.
4. Источник подтверждает общее правило, но claim чрезмерно обобщает исключения.
5. В цитате потеряно отрицание «не».
6. Модель выдумала номер статьи или судебного дела.
7. Locator указывает на соседний пункт.
8. Источник доступен по URL, но версия/дата не подтверждена.
9. Два судебных акта содержат расходящиеся позиции.
10. Редакция нормы верна на дату ответа, но переходное положение меняет результат для события.
11. Факт не указан в материалах; система ошибочно трактует его как `false`.
12. Retrieval ничего не нашёл; система заявляет, что нормы/условия не существует.
13. Judge-модель ошибочно классифицирует косвенную связь как direct support.
14. Evidence key взят из другого ContextSnapshot.
15. Доступ к документу отозван после retrieval, но до финального ответа.
16. OCR/parser пропустил часть страницы, содержащую исключение.
17. Таблица извлечена без заголовка колонки и значение интерпретировано неверно.
18. Secondary source представлен как официальный первоисточник.
19. В источнике есть цитируемый фрагмент, но окружающий абзац содержит ограничение.
20. Validator недоступен; система ошибочно возвращает `supported`.

## 13. Acceptance criteria

Контракт можно считать реализованным для выбранного сценария, когда:

- [ ] Модель ссылается только на evidence IDs из текущего ContextSnapshot.
- [ ] Server-side validator проверяет source, version, locator и quote независимо от модели.
- [ ] Неизвестные/выдуманные IDs и URL не попадают в список подтверждённых источников.
- [ ] Невалидная цитата не отображается как дословная проверенная цитата.
- [ ] Claims имеют атомарную структуру и связь с evidence.
- [ ] `direct`, `inference`, `not_supported`, `conflicting`, `not_assessed` имеют разные последствия для response policy.
- [ ] Material claims без подтверждения не выдаются как установленные факты.
- [ ] Для legal claims applicability отделена от claim support.
- [ ] Неизвестные факты и temporal inputs не превращаются в `false` или в выдуманные значения.
- [ ] Конфликт evidence может быть показан без автоматического разрешения по relevance score.
- [ ] При отказе/недоступности validator система деградирует безопасно.
- [ ] Есть независимые evaluation suites и экспертно размеченная выборка для material legal claims.
- [ ] Audit trail воспроизводит использованные evidence, версии и результаты в пределах разрешённого retention.
- [ ] ACL повторно проверяется до финальной выдачи.

## 14. Рекомендуемая последовательность внедрения

### Stage 1 — Deterministic citation integrity (обязательный фундамент)

- Evidence IDs в ContextSnapshot;
- source/version/locator binding;
- exact quote/hash checks;
- server-generated URLs and metadata;
- отказ от неизвестных references.

Это должно быть реализовано до доверенного UI цитат. Не требует полноценной judge-модели.

### Stage 2 — Claim mapping и базовая поддержка

- атомарные claims;
- claim-to-evidence mapping;
- deterministic checks для дат, чисел, реквизитов и exact quote;
- `direct`/`inference`/`not_supported`/`conflicting`/`not_assessed`;
- evaluation на экспертно размеченных примерах.

Начать с ограниченного набора сценариев пользовательских документов. Не обещать автоматическую юридическую верификацию.

### Stage 3 — Legal applicability

- temporal resolver integration;
- fact matrix с `true`/`false`/`unknown`;
- transition rules, jurisdiction и scope;
- court-position conflicts;
- expert review workflow для неоднозначных случаев.

Эта стадия зависит от унификации legal data model и temporal contract; не закрывает O-006 и не должна запускать production legal corpus до разрешения соответствующих governance/licensing gates.

## 15. Нерешённые вопросы

Следующие вопросы намеренно не закрываются этим PROPOSED документом:

1. Какой формат хранения Evidence/Claim/ValidationRun использовать физически: отдельные таблицы или JSON snapshot + relational links?
2. Какие claim classes обязательны в первом MVP, а какие появятся только в Legal Research?
3. Какая часть Claim Support автоматизируется LLM, а какая требует deterministic rules или human review?
4. Какой уровень экспертной проверки и кто имеет право подтверждать material legal claims?
5. Какие source snapshots можно хранить с учётом лицензий/прав источников?
6. Как согласовать `LegalEvidence` из `docs/18` с общим EvidenceReference и моделями `docs/ai/retrieval/03`?
7. Как temporal resolver передаёт applicability assessment, не вводя преждевременно универсальный Rule Engine?
8. Как отображать пользователю статусы support/applicability так, чтобы они не воспринимались как сертификация юридической правильности?
9. Какова политика хранения и удаления validation trace после удаления исходного документа/источника?
10. Какой порог false-supported rate приемлем для каждого класса сценариев и кто утверждает порог?

## 16. Связанные документы и порядок приоритета

Этот addendum дополняет, но не заменяет:
- `docs/18-legal-research-and-external-sources.md` — Source Registry, LegalEvidence и Citation Validator;
- `docs/33-phase6-rag-implementation-specification.md` — ContextSnapshot, citation keys и claim/evidence mapping для пользовательских документов;
- `docs/ai/retrieval/05-retrieval-pipeline.md` — retrieval, context assembly и citation validation;
- `docs/ai/retrieval/06-temporal-legal-retrieval.md` — временная модель и legal applicability inputs;
- `docs/ai/retrieval/07-retrieval-evaluation.md` — retrieval и legal quality evaluation;
- `docs/decisions-log.md` — подтверждённые решения и открытые вопросы.

При конфликте не считать этот addendum автоматически приоритетнее канонических документов или decisions log. Сначала зафиксировать расхождение и согласовать изменение отдельным решением.

---

**Итог:** доказательная база должна проходить три независимых вопроса — «ссылка существует?», «источник поддерживает утверждение?» и «правило применимо к этим фактам и периоду?». Для MVP разумно сначала надёжно закрыть первый вопрос и обеспечить прозрачную claim-to-evidence связь. Попытка сразу автоматизировать полноценное юридическое рассуждение создаст ложное ощущение достоверности и существенно усложнит продукт до появления качественного корпуса и экспертной оценки.

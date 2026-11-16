# P0 Decision Addendum — Claim Support & Legal Applicability Taxonomy

**Статус:** PROPOSED — рекомендуемый единый cross-contract контракт для согласования.  
**Дата:** 2026-11-17  
**Область:** Evidence Validation и Evaluation Framework для пользовательского RAG; Legal Applicability применяется только там, где claim содержит правовой вывод о применимости нормы к фактам и периоду.

> Этот документ является новым addendum. Он не изменяет `docs/decisions-log.md`, канонические документы, существующие пять Stage 2 addendum или Prisma/API-контракты. Предлагаемые enums нельзя считать принятыми до отдельного подтверждения.

---

## 1. Решение, которое требуется принять

Сейчас Evidence Validation и Evaluation Framework используют разные значения для оценки одного и того же claim. Кроме того, Evaluation смешивает применимость нормы с трёхзначной оценкой отдельных фактов и temporal resolution.

Предлагается принять три независимых типа результата:

1. `ClaimSupportStatus` — насколько конкретное утверждение поддержано указанными evidence.
2. `FactTruthStatus` — установлен ли конкретный факт.
3. `LegalApplicabilityStatus` и `TemporalResolutionStatus` — применима ли норма к установленным фактам и разрешён ли выбор редакции/периода.

Их нельзя объединять в один `confidence`, `legalAccuracy` или булевый флаг.

## 2. Канонический Claim Support

```ts
export type ClaimSupportStatus =
  | 'direct'
  | 'inference_supported'
  | 'partially_supported'
  | 'unsupported'
  | 'contradicted'
  | 'conflicting_evidence'
  | 'not_assessed';
```

### 2.1 Семантика

| Status | Значение | Поведение |
|---|---|---|
| `direct` | Допустимое evidence прямо подтверждает атомарный claim | Можно представить как подтверждённое источником после успешной Reference Integrity |
| `inference_supported` | Claim логически следует из одного или нескольких evidence через явную цепочку рассуждения | Представлять как вывод, раскрывать основание; не называть прямой цитатой |
| `partially_supported` | Подтверждена только часть claim или важное условие остаётся без поддержки | Не представлять весь claim как установленный; по возможности повторно декомпозировать claim |
| `unsupported` | Достаточной поддержки не найдено | Не представлять как установленный факт/правило |
| `contradicted` | Проверенное evidence опровергает claim в заявленном scope | Не выдавать claim как верный; показать опровергающее evidence |
| `conflicting_evidence` | Допустимые evidence поддерживают несовместимые позиции, конфликт не разрешён | Раскрыть позиции и неопределённость; не выбирать одну без отдельного обоснования |
| `not_assessed` | Оценка не выполнялась или не завершилась | Не считать ни подтверждённым, ни опровергнутым |

### 2.2 Почему `contradicted` и `conflicting_evidence` — разные статусы

`contradicted` означает, что evidence, принятый для оценки, опровергает claim. `conflicting_evidence` означает, что есть конкурирующие evidence/позиции, и система не разрешила их противоречие.

Наличие двух несовместимых источников само по себе не доказывает, что конкретный claim ложен. И наоборот, прямое опровержение claim не обязательно означает равновесный конфликт источников.

Conflict должен быть представлен как набор evidence с ролями `supports` / `contradicts` / `contextual`, а не как один неразличимый список ссылок.

### 2.3 Атомарность и `partially_supported`

Основной путь — декомпозировать сложные предложения на атомарные claims. `partially_supported` не должен становиться заменой нормальной декомпозиции.

Он нужен как безопасный fallback, когда:
- claim уже создан и используется в downstream-логике;
- автоматическая декомпозиция не смогла безопасно разделить утверждение;
- часть утверждения подтверждена, но часть остаётся без evidence.

Для material claim со статусом `partially_supported` предпочтительно создать дочерние claims и оценить их отдельно. До декомпозиции весь исходный claim не считается полностью supported.

### 2.4 Preconditions

- `direct`, `inference_supported`, `partially_supported`, `unsupported`, `contradicted` и `conflicting_evidence` могут выставляться только после успешного завершения проверки ссылок для используемых evidence.
- `invalid` evidence исключается из supporting evidence.
- `unverifiable` evidence не может само по себе обосновать `direct`.
- Если валидных evidence недостаточно, итог не повышается до `direct` на основании одной лишь оценки LLM.
- `not_assessed` — не синоним `unsupported`; это отсутствие результата оценки.

## 3. Канонический Legal Applicability

```ts
export type LegalApplicabilityStatus =
  | 'applicable'
  | 'not_applicable'
  | 'partially_applicable'
  | 'disputed'
  | 'unknown'
  | 'not_assessed';
```

### 3.1 Семантика

| Status | Значение | Поведение |
|---|---|---|
| `applicable` | Установленные факты и разрешённый temporal context удовлетворяют существенным условиям применения нормы | Допускается обоснованный вывод с раскрытием применённых условий |
| `not_applicable` | Установлено, что существенное условие/сфера применения не выполнены либо норма не действует для данного случая | Объяснить конкретное основание неприменимости |
| `partially_applicable` | Норма применима к части периода, требований, субъектов или аспектов ситуации, но не ко всему анализируемому вопросу | Разделить scope; нельзя обобщать частичную применимость на весь случай |
| `disputed` | Есть существенные конкурирующие правовые позиции или unresolved authority conflict по вопросу применимости | Раскрыть позиции и источник расхождения; не выдавать категоричный вывод |
| `unknown` | Недостаточно фактов, источников или разрешения временного/правового вопроса для классификации | Указать недостающие данные; не подменять неизвестность отрицательным выводом |
| `not_assessed` | Оценка применимости не выполнялась или не завершилась | Не делать вывод о применимости |

`disputed` и `unknown` не взаимозаменяемы:
- `disputed` — обнаружен конкретный конфликт;
- `unknown` — достаточного основания для вывода нет, даже если явного конфликта не обнаружено;
- `not_assessed` — оценка вообще не дала предметного результата.

`partially_applicable` относится к scope нормы/ситуации, а не к доле уверенности модели.

## 4. Отдельный статус истинности фактов

```ts
export type FactTruthStatus =
  | 'true'
  | 'false'
  | 'unknown';
```

Это оценка одного конкретного факта, а не итог применимости нормы.

- `true` — факт подтверждён допустимыми evidence в заявленном scope.
- `false` — факт опровергнут допустимыми evidence в заявленном scope.
- `unknown` — данных недостаточно или evidence конфликтуют.

`not_assessed` не включается в `FactTruthStatus`: это состояние процесса оценки, а не истинность факта. Если нужно отразить, что факт ещё не проверяли, поле assessment status должно быть `not_assessed` либо оценка должна отсутствовать.

Отсутствие факта в документе не означает `false`. Отсутствие найденного evidence не означает, что факт не происходил.

## 5. Отдельный результат temporal resolution

```ts
export type TemporalResolutionStatus =
  | 'resolved'
  | 'partially_resolved'
  | 'unknown'
  | 'not_applicable'
  | 'not_assessed';
```

- `resolved` — релевантная редакция/период определены по принятому temporal contract.
- `partially_resolved` — часть временного scope разрешена, часть остаётся неопределённой.
- `unknown` — данных недостаточно для выбора.
- `not_applicable` — временное разрешение не требуется для данного claim.
- `not_assessed` — resolver не запускался или не завершился.

Этот enum не заменяет `LegalApplicabilityStatus`. Можно корректно определить редакцию нормы (`resolved`), но не знать, применима ли она к фактам (`unknown`). И наоборот, нельзя считать applicability окончательно подтверждённой, если выбор редакции является существенным, но temporal resolution не разрешён.

Семантика дат, valid time, recorded time, publication date, event date и transition-control date остаётся подчинённой существующему temporal contract и открытым решениям проекта. Этот addendum их не переопределяет.

## 6. DTO: логическая форма, не Prisma schema

```ts
export interface ClaimSupportAssessment {
  claimId: string;
  status: ClaimSupportStatus;
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
  contextualEvidenceIds: string[];
  rationale: string;
  assessedAt: string;
  assessorVersion: string;
}

export interface FactAssessment {
  factId: string;
  status: FactTruthStatus;
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
  rationale: string;
  assessmentStatus: 'assessed' | 'not_assessed';
}

export interface LegalApplicabilityAssessment {
  assessmentId: string;
  claimId: string;
  status: LegalApplicabilityStatus;
  factAssessmentIds: string[];
  legalEvidenceIds: string[];
  temporalResolutionStatus: TemporalResolutionStatus;
  satisfiedConditions: string[];
  unsatisfiedConditions: string[];
  unknownConditions: string[];
  conflictingAuthorities: string[];
  rationale: string;
  unresolvedQuestions: string[];
  resolverVersion: string;
}
```

Это ориентир для согласования семантики. Поля, nullable-правила, идентификаторы и persistence model должны быть отдельно сверены с текущим API, Prisma и canonical docs перед реализацией.

## 7. Cross-contract mapping для Evaluation

Evaluation Framework обязан использовать те же enum, что runtime. Отдельные evaluation-only labels для тех же понятий запрещены.

### 7.1 Claim Support mapping

| Старый label из Evaluation | Новый канонический label | Условие |
|---|---|---|
| `direct` | `direct` | Без изменения |
| `inference_supported` | `inference_supported` | Без изменения |
| `partial` | `partially_supported` | Только если реально поддержана часть claim |
| `unsupported` | `unsupported` | Без изменения |
| `contradicted` | `contradicted` | Не использовать для unresolved source conflict |
| `not_assessed` | `not_assessed` | Без изменения |
| — | `conflicting_evidence` | Добавить как отдельный expected/actual outcome |

### 7.2 Claim Support mapping из Evidence Validation

| Старый label из Evidence Validation | Новый label | Условие |
|---|---|---|
| `direct` | `direct` | Без изменения |
| `inference` | `inference_supported` | Переименование без изменения базовой семантики |
| `not_supported` | `unsupported` | Переименование |
| `conflicting` | `conflicting_evidence` | Уточнить, что это unresolved conflict, а не просто наличие контрдоказательства |
| `not_assessed` | `not_assessed` | Без изменения |

### 7.3 Applicability evaluation mapping

Evaluation labels должны стать теми же, что и runtime `LegalApplicabilityStatus`:
- `applicable`
- `not_applicable`
- `partially_applicable`
- `disputed`
- `unknown`
- `not_assessed`

Нельзя оценивать applicability только через `true | false | unknown`: эти значения принадлежат `FactTruthStatus`, а не applicability.

Temporal resolution оценивается отдельным полем с `TemporalResolutionStatus`.

## 8. Response policy matrix

| Claim Support | Минимальное поведение ответа |
|---|---|
| `direct` | Формулировка как подтверждённое источником утверждение; только при valid reference |
| `inference_supported` | Явно обозначить как вывод и показать ключевую логическую связку |
| `partially_supported` | Ограничить формулировку подтверждённой частью или декомпозировать; не утверждать всё целиком |
| `unsupported` | Не выдавать как установленное; убрать, задать вопрос или обозначить отсутствие подтверждения |
| `contradicted` | Не выдавать исходный claim как верный; объяснить опровержение |
| `conflicting_evidence` | Показать конфликтующие позиции и пределы вывода |
| `not_assessed` | Не маркировать как проверенное/подтверждённое |

| Legal Applicability | Минимальное поведение ответа |
|---|---|
| `applicable` | Обосновать условия и период применения |
| `not_applicable` | Назвать конкретное основание неприменимости |
| `partially_applicable` | Ограничить вывод соответствующей частью scope |
| `disputed` | Показать конкурирующие позиции; избегать категоричности |
| `unknown` | Указать, каких фактов/источников/временных данных не хватает |
| `not_assessed` | Не делать вывод о применимости |

Эти таблицы задают минимальные ограничения, а не полный шаблон юридического ответа. Материальность claim и тип задачи могут требовать более строгой политики.

## 9. Reference Integrity — обязательный предшествующий gate

Claim Support не исправляет плохую ссылку.

1. `ReferenceIntegrity = invalid`: evidence исключается из поддержки claim.
2. `ReferenceIntegrity = unverifiable`: evidence нельзя считать достаточным для `direct`; при отсутствии иных проверяемых evidence claim не может получить подтверждённый статус.
3. `ReferenceIntegrity = valid_with_limitations`: ограничения передаются в Claim Support и response policy; ограниченная ссылка не должна незаметно трактоваться как полноценная.
4. `ReferenceIntegrity = valid`: evidence может участвовать в семантической оценке, но сам факт валидности ссылки ещё не означает поддержку claim.

Итоговый Claim Support должен хранить evidence roles и rationale, чтобы можно было проверить, на чём основана классификация.

## 10. Evaluation metrics и hard gates

Минимальные метрики по Claim Support:
- `DirectSupportRate`
- `InferenceSupportedRate`
- `PartialSupportRate`
- `UnsupportedClaimRate`
- `ContradictedClaimRate`
- `ConflictingEvidenceRate`
- `NotAssessedRate`
- `EvidenceCoverage`

Минимальные метрики по Applicability:
- `ApplicabilityClassificationAccuracy`
- `PartialApplicabilityRate`
- `DisputedApplicabilityRate`
- `UnknownPreservationRate`
- `NotAssessedRate`
- `TemporalResolutionAccuracy`

Не агрегировать все эти показатели в один `LegalAccuracyScore`. Для release gates отдельно задаются критические false-positive thresholds на material claims, temporal selection и ACL/citation integrity. Числовые пороги в этом addendum намеренно не устанавливаются.

LLM Judge допустим для triage и вспомогательной разметки, но экспертная разметка и детерминированные проверки остаются источником ground truth для критичных случаев.

## 11. Acceptance tests

| ID | Сценарий | Ожидаемый результат |
|---|---|---|
| CS-01 | Claim прямо подтверждён valid evidence | `direct` |
| CS-02 | Claim следует из двух valid evidence через явный шаг | `inference_supported` |
| CS-03 | Сложный claim подтверждён только частично | `partially_supported` либо декомпозиция на claims |
| CS-04 | Evidence не найдено | `unsupported`, а не `not_assessed`, если оценка действительно выполнена |
| CS-05 | Evidence прямо опровергает claim | `contradicted` |
| CS-06 | Два допустимых источника дают несовместимые позиции | `conflicting_evidence`, пока конфликт не разрешён |
| CS-07 | Проверка не запускалась | `not_assessed` |
| CS-08 | Единственная ссылка имеет integrity `invalid` | Не допускается `direct` на основании этой ссылки |
| CS-09 | Единственная ссылка `unverifiable` | Не допускается `direct` только на основании этой ссылки |
| LA-01 | Все существенные условия применимости установлены | `applicable` |
| LA-02 | Существенное условие установлено как невыполненное | `not_applicable`, если оно действительно исключает применение |
| LA-03 | Норма охватывает только часть периода/требований | `partially_applicable` |
| LA-04 | Есть конкурирующие правовые позиции по применимости | `disputed` |
| LA-05 | Не хватает существенного факта | `unknown` |
| LA-06 | Applicability resolver не запускался | `not_assessed` |
| FT-01 | Факт подтверждён допустимым evidence | `true` |
| FT-02 | Факт опровергнут допустимым evidence | `false` |
| FT-03 | Недостаточно данных | `unknown`, не `false` |
| TR-01 | Редакция/период определены | `resolved` |
| TR-02 | Часть временного scope не разрешена | `partially_resolved` |
| TR-03 | Временные данные отсутствуют | `unknown` |
| X-01 | Runtime выдаёт любой ClaimSupportStatus | Evaluation принимает тот же enum без преобразования в другую шкалу |
| X-02 | Runtime выдаёт `partially_applicable` или `disputed` | Evaluation сохраняет точный класс |
| X-03 | Temporal resolution `resolved`, applicability `unknown` | Два результата сохраняются независимо |
| X-04 | FactTruth `unknown` | Нельзя автоматически преобразовать в `not_applicable` |

## 12. Вопросы, которые этот документ намеренно не решает

- Как именно определять вес/иерархию конкурирующих источников.
- Как разрешать конфликт судебных позиций и нормативных актов.
- Как моделировать сложные claims, которые невозможно атомизировать без потери смысла.
- Какие числовые пороги использовать для release gates.
- Какой LLM/judge использовать и где он будет развёрнут.
- Какова окончательная temporal model и значения всех контрольных дат.
- Какие поля попадут в Prisma и публичный API.

Эти вопросы требуют отдельных контрактов и/или решений проекта. Не следует закрывать их через расширение enum.

## 13. Рекомендуемое согласование

Предлагаю согласовать этот пакет как единый словарь для runtime и evaluation. Если он принят:

1. Evidence Validation и Evaluation Framework в будущих редакциях ссылаются на этот словарь, а не объявляют собственные enums.
2. Runtime DTO и evaluation dataset используют одинаковые строки и семантику.
3. Старые labels мигрируют только через таблицы mapping из раздела 7.
4. Prisma/API изменения проектируются отдельно после сверки с текущим кодом и canonical docs.
5. До принятия не фиксировать эти enums в production schema.

**Статус решения: OPEN — ожидает явного согласования пользователя.**

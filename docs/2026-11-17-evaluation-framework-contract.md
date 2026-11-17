# Evaluation Framework Contract

**Проект:** НейроЮрист Спектр  
**Дата:** 2026-11-17  
**Статус:** PROPOSED — проект контракта для обсуждения, не утверждённое архитектурное решение  
**Тип:** новый addendum; не заменяет и не переписывает существующие документы  
**Область:** качество extraction, retrieval, evidence/citations, legal reasoning, ACL, производительность и регрессии

---

## 0. Назначение и границы

Документ задаёт единый способ измерять качество алгоритмов Спектра, не смешивая разные виды качества в одну оценку. Он сводит общие принципы оценки, уже встречающиеся в `docs/17`, `docs/18`, `docs/30`, `docs/33` и `docs/ai/retrieval/07`, в отдельный предлагаемый контракт.

Это **не** предложение построить одну универсальную систему оценки, которая выдаёт «юридическую точность 94%». Такое число было бы методологически сомнительным: retrieval, точность извлечения текста, корректность цитаты, поддержка утверждения и применимость нормы — разные свойства, с разными единицами наблюдения и разными способами экспертной проверки.

Цели:

1. Понимать, на каком именно этапе возникает ошибка.
2. Сравнивать алгоритмы на неизменном и версионируемом наборе кейсов.
3. Не допускать улучшения среднего результата ценой критических регрессий в безопасности или юридической корректности.
4. Разделять экспериментальные метрики и release gates.
5. Обеспечить воспроизводимость: повторный запуск должен позволять объяснить, какие данные, модели, параметры и версии кода дали результат.
6. Не раскрывать реальные клиентские документы в Git, CI-логах и общедоступных отчётах.

### 0.1. Что документ не решает

Документ не утверждает:

- конкретный embedding provider/model;
- конкретный reranker;
- выбор PostgreSQL FTS, ParadeDB или иной lexical engine;
- окончательную схему Legal Corpus и temporal model;
- целевые production SLO и численные quality thresholds;
- правомерность передачи клиентских данных внешним AI-провайдерам;
- автоматическую сертификацию юридической корректности ответа.

Эти вопросы остаются в соответствующих решениях и gate-процессах. Evaluation Framework должен измерять выбранную конфигурацию, а не подменять архитектурное или правовое решение.

---

## 1. Базовый принцип: не сводить качество к одному score

Система оценивается по независимым quality dimensions:

| Dimension | Что проверяется | Основная единица оценки |
|---|---|---|
| Extraction quality | Насколько полно и точно извлечён исходный материал | Документ / страница / структурный блок |
| Locator quality | Можно ли точно вернуться от фрагмента к исходнику | Фрагмент / citation locator |
| Retrieval quality | Найдены ли ожидаемые evidence и насколько высоко они ранжированы | Query × corpus snapshot × scope |
| ACL/security correctness | Не попали ли в выдачу данные вне разрешённого scope | Security test case / query execution |
| Reference integrity | Существуют ли источник, версия, locator и цитируемый текст | Citation reference |
| Claim support | Подтверждает ли evidence конкретное утверждение | Claim × evidence set |
| Temporal correctness | Выбрана ли надлежащая редакция и учтены ли временные условия | Temporal case |
| Legal applicability/reasoning | Корректно ли оценены факты, исключения, переходные правила и конфликт норм | Legal case |
| Abstention behavior | Воздерживается ли система, когда доказательств недостаточно | Query / answer case |
| Operational performance | Скорость, стоимость, стабильность и пропускная способность | Stage / request / job |

**Запрещённый shortcut:** не вычислять единый «Legal Accuracy Score» как среднее перечисленных метрик. Среднее может скрыть нулевую ACL-безопасность, неверную редакцию или неподтверждённое существенное утверждение.

Верхнеуровневый статус запуска формируется как набор независимых gate results: `PASS`, `FAIL`, `BLOCKED`, `NOT_EVALUATED`. Неуспешный критический gate нельзя компенсировать успехом другого.

---

## 2. Архитектура Evaluation Framework

Предлагаемая логическая схема:

```text
Evaluation Dataset (versioned)
        |
        v
Evaluation Run Manifest ---- Code / Config / Model / Corpus versions
        |
        v
Scenario-specific Runner
  |       |        |        |        |
  v       v        v        v        v
Extract Retrieval ACL   Evidence Temporal / Legal
  |       |        |        |        |
  +-------+--------+--------+--------+
                  |
                  v
             Raw Results
                  |
                  v
          Metric Aggregation
                  |
                  v
       Slice / Failure Analysis
                  |
                  v
        Evaluation Report
                  |
                  v
       Release / Experiment Gates
```

Это логические компоненты, а не обязательное требование создавать отдельные микросервисы. На MVP достаточно тестового runner/CLI и хранилища результатов. Не нужно заранее вводить отдельную распределённую Evaluation Platform.

### 2.1. Основные сущности

| Entity | Назначение |
|---|---|
| `EvaluationSuite` | Семейство тестов: user-doc retrieval, legal retrieval, ACL, temporal, evidence, extraction и т.д. |
| `DatasetVersion` | Неизменяемая версия набора кейсов и его разметки |
| `EvaluationCase` | Один сценарий/запрос с контекстом, входными данными и ожидаемым поведением |
| `ExpectedEvidence` | Ожидаемый источник или фрагмент, его релевантность и обязательность |
| `ExpectedBehavior` | Ожидаемый ответный класс: answer, partial, abstain, conflict disclosure и т.п. |
| `EvaluationRun` | Один запуск suite на определённом коде, конфигурации и corpus snapshot |
| `RunCaseResult` | Сырые результаты одного case в конкретном run |
| `MetricResult` | Метрика с единицей измерения, агрегацией и breakdown |
| `EvaluationReport` | Итоговый отчёт, включая ошибки, warnings и gate outcomes |
| `AnnotationRecord` | Экспертная разметка, автор, дата, версия guideline и adjudication |

Необязательно материализовывать все сущности как таблицы PostgreSQL в MVP. Это прежде всего формат данных и контракт. Начать можно с JSONL/JSON fixtures и машинно-читаемых отчётов.

### 2.2. Идентификаторы и неизменяемость

Каждая версия dataset и каждый run должны иметь стабильный ID. Изменение query, expected evidence, relevance grade, ожидаемого поведения или экспертного обоснования создаёт новую версию dataset либо annotation revision.

Нельзя незаметно менять ожидаемый результат уже опубликованного benchmark: иначе сравнение старого и нового run станет недостоверным.

---

## 3. Разделение evaluation suites

Нельзя объединять все сценарии в один golden set с одной общей метрикой. Нужны отдельные suites, которые могут ссылаться на общие тестовые артефакты, но сохраняют собственную разметку и критерии.

| Suite | Что оценивает | Когда становится применимым |
|---|---|---|
| `extraction-quality` | Точность и полноту извлечения текста и структуры | С появлением parser contract и test fixtures |
| `user-document-retrieval` | Поиск по пользовательским документам | Phase 6 retrieval |
| `legal-provision-retrieval` | Поиск норм/положений в правовом корпусе | После ingestion legal corpus |
| `court-decision-retrieval` | Поиск судебных актов и их фрагментов | После подключения судебного корпуса |
| `acl-security` | Изоляцию tenant/workspace/document и cache/citation paths | Уже для ACL реализации; затем на каждом релизе |
| `reference-integrity` | Существование источника, версии, locator и точной цитаты | При наличии citation pipeline |
| `claim-support` | Поддержку существенных утверждений доказательствами | После структурирования claims/evidence |
| `temporal-regression` | Версии на дату, переходные правила и temporal facts | Для Legal Research |
| `abstention` | Корректное воздержание при недостатке evidence | После answer generation |
| `answer-quality` | Полезность, полноту и юридическую корректность ответа | По мере появления экспертной методики |
| `performance-cost` | Latency, throughput, error rate и стоимость | На benchmark/staging/prod telemetry |
| `portability-regression` | Сохранение retrieval quality после export/import | В рамках `docs/30` |

### 3.1. User-document и legal-corpus suites не взаимозаменяемы

Пользовательские документы и правовой корпус имеют разные ожидаемые результаты:

- для договора важны clauses, стороны, определения, исключения, таблицы и внутренние ссылки;
- для нормативного акта важны юрисдикция, редакция, дата действия, иерархия положений и переходные нормы;
- для судебного акта важны суд, инстанция, дата, процессуальная связь, фактический контекст и правовая позиция.

Общий формат метрик допустим, общий набор ожидаемых evidence и одна шкала качества — нет.

---

## 4. Контракт EvaluationCase

Минимальный пример case для retrieval:

```json
{
  "schemaVersion": "1",
  "caseId": "udr-0001",
  "suiteId": "user-document-retrieval",
  "caseType": "semantic_clause_lookup",
  "query": "Какие условия расторжения предусмотрены договором?",
  "context": {
    "corpusSnapshotId": "synthetic-contracts-v1",
    "scopeFixtureId": "scope-user-a-workspace-1",
    "asOfDate": null,
    "locale": "ru-RU"
  },
  "expectedEvidence": [
    {
      "evidenceId": "doc-1:version-1:clause-8.2",
      "relevanceGrade": 3,
      "required": true,
      "expectedLocator": "section 8.2"
    }
  ],
  "expectedBehavior": {
    "answerClass": "answer_with_evidence",
    "mustAbstain": false
  },
  "tags": ["termination", "contract", "semantic"],
  "annotation": {
    "guidelineVersion": "1",
    "rationaleRef": "annotation-udr-0001"
  }
}
```

Поля примера иллюстративны. Production schema должна учитывать suite-specific payloads, не пытаться сделать один плоский объект со множеством nullable полей.

### 4.1. Обязательные свойства case

- Стабильный `caseId`.
- Suite и тип сценария.
- Query/input без двусмысленности в пределах тестируемой задачи.
- Зафиксированный corpus snapshot или synthetic fixture.
- Retrieval scope fixture для приватных данных.
- Expected evidence с градациями релевантности.
- Ожидаемое поведение системы, включая допустимое воздержание.
- Теги для slice analysis.
- Версия guideline и происхождение экспертной разметки.

### 4.2. Expected evidence — не всегда один точный chunk

Нельзя жёстко привязывать expected evidence только к `chunkId`: chunking strategy может измениться, и новый алгоритм корректно найдёт тот же смысловой фрагмент под другим ID.

Предпочтительная иерархия идентичности:

1. Source document/version + canonical locator или stable source span.
2. Canonical provision/clause identity, если она существует.
3. Набор допустимых source spans/chunks, если одна мысль распределена по нескольким блокам.
4. Chunk ID — только для проверки конкретной реализации/индекса, не как единственная ground truth.

Для chunking experiments ожидаемый source span должен оставаться неизменным при сравнении разных стратегий разбиения.

### 4.3. Relevance grades

Предлагаемая шкала для retrieval:

| Grade | Meaning |
|---:|---|
| 0 | Нерелевантно или опасно вводит в заблуждение |
| 1 | Слабая связь; не отвечает на запрос самостоятельно |
| 2 | Полезный контекст, но неполный ответ |
| 3 | Прямо релевантное evidence, достаточное для требуемого аспекта |

`required=true` — отдельный флаг, не синоним grade 3. Он означает, что отсутствие конкретного evidence считается существенной ошибкой данного кейса.

Для разных suites могут быть разные схемы разметки. Например, для legal applicability нужны `true/false/unknown/not_assessed`, а не relevance grade.

---

## 5. Разметка и качество ground truth

Метрики не будут лучше качества expected results. Ошибочная разметка создаёт ложные регрессии и может закрепить неправильное правовое толкование.

### 5.1. Процесс разметки

1. Сформировать кейс и определить тестируемый вопрос.
2. Разметчик находит ожидаемые evidence в оригинальном источнике.
3. Фиксирует locator, версию, релевантность, обязательность и rationale.
4. Для критичных legal/temporal кейсов второй эксперт независимо проверяет разметку.
5. Разногласия проходят adjudication; исходные аннотации сохраняются.
6. Dataset version публикуется после review.

### 5.2. Двойная разметка

Двойная экспертная разметка особенно необходима для:

- temporal applicability;
- переходных положений;
- противоречащих источников;
- claim support;
- существенных правовых выводов;
- тестов, используемых как release blockers.

Для простых exact lookup и технических integrity cases достаточно одной разметки плюс автоматической валидации, если это обосновано.

### 5.3. Согласованность разметчиков

При достаточном количестве размеченных кейсов можно измерять inter-annotator agreement. Метрика выбирается по типу шкалы (например, Cohen's kappa для двух разметчиков и категориальной разметки; weighted kappa для ordinal grades). Не следует публиковать коэффициент согласия на маленькой выборке как доказательство качества методики.

Низкое согласие означает, что guideline или сам кейс требует уточнения. Нельзя автоматически «усреднять» спорные правовые трактовки.

### 5.4. Независимость тестового набора

Не использовать одни и те же кейсы одновременно для подбора параметров и финальной оценки без явного обозначения. Разделять:

- `development` — отладка и итерации;
- `validation` — сравнение кандидатов и подбор параметров;
- `holdout` — ограниченный независимый набор для итоговой проверки.

При небольшом корпусе допускается cross-validation или repeated holdout, но метод должен быть зафиксирован. Не утверждать статистическую надёжность, которой объём данных не обеспечивает.

---

## 6. Метрики retrieval

Метрики считаются на уровне case, затем агрегируются по suite и slice. Всегда указывать `K`, способ определения релевантности и denominator.

### 6.1. Recall@K

Доля ожидаемых релевантных evidence, найденных в top-K:

`Recall@K = найденные релевантные expected evidence в top-K / все expected relevant evidence`.

Если у case несколько допустимых evidence alternatives, denominator должен учитывать правила альтернативности, а не считать каждую альтернативу обязательной.

**Ограничение:** высокий Recall не означает хороший порядок результатов и не гарантирует, что система не нашла опасные/неправильные версии.

### 6.2. Precision@K

Доля результатов в top-K, которые размечены как релевантные. Для graded relevance заранее определить, считать ли grades 2–3 релевантными, и зафиксировать правило.

**Ограничение:** Precision может искусственно расти, если система возвращает мало результатов. Сопоставлять вместе с Recall и coverage.

### 6.3. MRR

Среднее обратное значение позиции первого релевантного результата. Полезно для exact lookup и сценариев, где один первый результат особенно важен.

**Ограничение:** MRR почти не учитывает качество остальных результатов.

### 6.4. nDCG@K

Оценивает порядок результатов с использованием graded relevance. Подходит, когда есть градации 0–3. Формулу gain/discount и правила для дубликатов нужно зафиксировать в runner.

### 6.5. Required Evidence Recall

Доля кейсов, в которых найдено каждое обязательное evidence. Это отдельная метрика от обычного Recall: система может иметь хороший общий Recall, но регулярно пропускать ключевое условие/исключение.

### 6.6. Exact-match / identifier accuracy

Для номеров статей, пунктов, договоров, дел, дат и точных названий измерять отдельную exact lookup accuracy. Semantic similarity не должна подменять точное совпадение идентификатора.

### 6.7. Duplicate rate и source coverage

- `Duplicate@K` — доля дублирующих или почти дублирующих результатов в top-K.
- `SourceCoverage@K` — сколько различных релевантных источников/документов представлено в top-K.

Они помогают выявить выдачу, заполненную множеством почти одинаковых chunks одного документа.

### 6.8. Empty-result / retrieval coverage

Отдельно измерять долю пустых выдач и долю кейсов, где система вернула хотя бы одно релевантное evidence. Пустая выдача не обязательно ошибка: для unanswerable cases она может быть правильным поведением.

---

## 7. Метрики extraction и locators

Для extraction нельзя ограничиваться сравнением полного extracted text с одним эталонным текстом: порядок пробелов, нормализация и форматирование могут различаться без потери смысла, а совпадающий текст может скрывать потерю таблиц или сносок.

Предлагаемые показатели:

- `TextCoverage` — доля ожидаемого содержательного текста, извлечённая корректно.
- `CriticalTextRecall` — доля заранее отмеченных критичных фрагментов, извлечённых без потери смысла.
- `StructureAccuracy` — точность распознавания заголовков, пунктов, таблиц, списков и других структурных блоков.
- `ReadingOrderAccuracy` — корректность порядка блоков, особенно для многоколоночных PDF.
- `LocatorAccuracy` — доля фрагментов, для которых locator возвращает правильную страницу/раздел/диапазон.
- `TableCellAccuracy` — сохранение связи заголовков, строк и ячеек таблицы.
- `FootnoteLinkAccuracy` — сохранение связи сносок с основным текстом.
- `ExtractionFailureRate` — доля документов, завершившихся ошибкой или непригодным результатом.
- `QualityGateFalseAcceptRate` — доля документов, которые quality gate пропустил, хотя экспертная оценка признала extraction непригодным.
- `QualityGateFalseRejectRate` — доля пригодных документов, ошибочно заблокированных.

Для юридического продукта `QualityGateFalseAcceptRate` на критичных классах важнее общего character-level similarity.

---

## 8. Метрики reference integrity и claim support

### 8.1. Reference integrity

Проверяется детерминированно там, где возможно:

- source существует и доступен;
- source/version соответствует тому, что указано в ответе;
- locator разрешается в исходном документе;
- quoted text действительно присутствует в источнике после документированной нормализации;
- quote не пересекает недопустимые границы версий;
- ссылка не ведёт на удалённый/недоступный объект;
- access scope соблюдён.

Метрики:

- `ReferenceValidity` — доля валидных ссылок;
- `LocatorResolutionRate` — доля locator, которые разрешаются;
- `QuoteMatchRate` — доля цитат, совпадающих с источником по утверждённому правилу;
- `VersionMatchRate` — доля ссылок на ожидаемую версию.

Для critical reference integrity errors дополнительно считать абсолютное число ошибок, не только процент.

### 8.2. Claim support

Единица оценки — существенное утверждение (`claim`), а не весь ответ. Для каждого claim эксперт оценивает, подтверждает ли указанный набор evidence именно это утверждение.

Предлагаемые labels:

- `direct` — подтверждается непосредственно;
- `inference_supported` — вывод логически следует из evidence, но не цитируется дословно;
- `partial` — подтверждена только часть утверждения;
- `unsupported` — подтверждения нет;
- `contradicted` — evidence противоречит утверждению;
- `not_assessed` — недостаточно данных для оценки.

Метрики:

- `ClaimSupportRate` — доля существенных claims с `direct` или допустимым `inference_supported`;
- `UnsupportedClaimRate` — доля существенных claims с `unsupported`;
- `ContradictedClaimRate` — доля claims, которым противоречат evidence;
- `PartialSupportRate` — доля частично подтверждённых claims;
- `EvidenceCoverage` — доля существенных claims, у которых вообще есть evidence mapping.

Классы `not_assessed` нельзя автоматически считать supported. В отчёте они остаются отдельной категорией.

### 8.3. Почему LLM judge не является ground truth

LLM judge можно применять для triage, поиска подозрительных случаев и предварительного ранжирования на экспертную проверку. Он не должен единолично подтверждать claim support или legal correctness.

Для judge нужно отдельно измерять agreement с экспертами, false-positive/false-negative rates и устойчивость к формулировкам. Release gate по юридической корректности должен опираться на экспертную выборку и/или детерминированные проверки, а не только на оценку другой модели.

---

## 9. Temporal и legal applicability evaluation

Temporal correctness и legal applicability — отдельная suite, не разновидность relevance ranking.

Каждый temporal case должен фиксировать:

- юрисдикцию и тип правоотношения;
- контрольную дату/период;
- дату события или фактов, если она отличается;
- дату редакции и период действия нормы;
- publication/official publication date, если она значима;
- переходные положения и их scope;
- известные факты и неизвестные факты;
- ожидаемую редакцию и объяснение выбора;
- допустимые alternative outcomes, если правовая оценка зависит от фактов.

Метрики:

- `VersionSelectionAccuracy` — выбрана ли правильная редакция;
- `TemporalRuleCoverage` — учтены ли применимые переходные/временные правила;
- `TemporalExplanationSupport` — подтверждено ли объяснение временного выбора источником;
- `UnknownPreservationRate` — не превратил ли алгоритм неизвестные факты в `true` или `false`;
- `ApplicabilityClassificationAccuracy` — точность `true/false/unknown/not_assessed` по экспертной разметке;
- `ConflictDisclosureRate` — раскрыты ли существенные конфликты источников.

Кейс не считается пройденным только потому, что система случайно выбрала нужную редакцию. Она должна показать корректное временное основание и не скрыть неизвестные факты.

Нельзя смешивать:

1. retrieval relevance — найден ли подходящий документ;
2. legal authority — каков статус источника/суда/инстанции;
3. applicability — применима ли норма к фактам и периоду.

Reranker оценивает релевантность, но не должен выдавать юридическую силу или применимость как скрытый similarity score.

---

## 10. ACL/security evaluation

ACL suite — отдельный обязательный security gate. Его результаты не усредняются с quality metrics.

Проверять весь путь данных:

- SQL FTS candidate retrieval;
- vector candidate retrieval;
- fusion/RRF;
- reranker input;
- parent/neighbor expansion;
- Context Builder;
- citations and source preview;
- cache hit/miss;
- background AIJob execution;
- response replay/history;
- export/import and restore;
- revoked access and deleted content.

Метрики/счётчики:

- `ACLLeakageCount` — число несанкционированных объектов, попавших в любой наблюдаемый этап;
- `UnauthorizedCandidateCount` — число запрещённых candidates до fusion;
- `UnauthorizedRerankerInputCount` — запрещённые данные, переданные reranker;
- `UnauthorizedCitationCount` — ссылки на недоступные объекты;
- `RevocationPropagationLatency` — время от отзыва доступа до прекращения выдачи;
- `CrossTenantCacheLeakCount` — межтенантные cache leaks.

**Критерий:** любое подтверждённое ACL leakage — `FAIL`, даже если итоговый ответ не показал текст документа. Сам факт попадания запрещённого content в reranker/LLM context уже является утечкой.

Для тестирования использовать синтетические tenant/workspace fixtures с уникальными canary strings. Проверять не только HTTP response, но и внутренние candidate/context traces в защищённом тестовом окружении.

---

## 11. Abstention и поведение при недостатке данных

Отказ/воздержание — не ошибка по умолчанию. Для юридического помощника это необходимое поведение, если источник отсутствует, extraction неполон, редакция неизвестна, факты не заданы или evidence противоречат друг другу.

Классы expected behavior:

- `answer_with_evidence` — достаточно evidence для ответа;
- `partial_answer` — можно ответить на часть запроса, ограничения должны быть раскрыты;
- `abstain_insufficient_evidence` — недостаточно источников;
- `abstain_extraction_incomplete` — исходный документ извлечён ненадёжно;
- `abstain_temporal_uncertain` — нельзя установить применимую редакцию;
- `disclose_conflict` — источники противоречат друг другу;
- `ask_for_facts` — требуется дополнительная фактическая информация.

Метрики:

- `AbstentionPrecision` — среди случаев отказа доля случаев, где отказ был оправдан;
- `AbstentionRecall` — среди случаев, где требовалось воздержание, доля корректных отказов;
- `UnsafeAnswerRate` — доля случаев, где система ответила при недостатке критичного evidence;
- `OverAbstentionRate` — доля случаев, где система отказалась при достаточных данных;
- `ClarificationQuality` — корректно ли запрошены недостающие факты.

Высокий abstention rate сам по себе не является хорошим результатом. Система может быть безопасной, но бесполезной из-за чрезмерных отказов.

---

## 12. Answer quality: экспертная оценка

Автоматические метрики не покрывают полностью полезность и юридическое качество ответа. Для этого нужна экспертная rubric.

Предлагаемые измерения:

1. **Factual correctness** — соответствует ли ответ evidence и фактам кейса.
2. **Legal correctness** — корректно ли изложены применимые нормы и ограничения.
3. **Completeness** — охвачены ли существенные условия, исключения и контраргументы.
4. **Traceability** — можно ли проследить существенные выводы до источников.
5. **Calibration** — соответствует ли уверенность/категоричность фактической доказательной базе.
6. **Practical usefulness** — помогает ли ответ выполнить задачу пользователя.
7. **Clarity** — понятны ли структура и ограничения ответа.

Использовать ordinal rubric, например 1–5, с описанными якорями для каждого балла. Не складывать баллы в единый legal score без доказанной валидности шкалы.

Критичные ошибки (неверная норма, неверная редакция, выдуманная цитата, пропуск существенного исключения, небезопасный категоричный совет) должны иметь отдельные severity labels и блокирующие правила.

---

## 13. Performance и cost evaluation

Измерять отдельно по стадиям:

- upload/queue wait;
- extraction/parsing;
- chunking;
- embedding generation;
- lexical retrieval;
- vector retrieval;
- fusion;
- reranking;
- context assembly;
- LLM generation;
- citation/reference validation;
- total end-to-end latency.

Минимальные operational metrics:

- p50/p95/p99 latency по stage и end-to-end;
- throughput и concurrency;
- timeout/error/retry rate;
- queue wait time и backlog age;
- indexing throughput и failure rate;
- cost per indexed page/document и per query/answer;
- tokens in/out, если применимо;
- cache hit rate;
- resource usage (CPU/RAM/VRAM/IO) для self-hosted components.

Сравнение должно проводиться на одинаковом hardware/profile, либо различия явно фиксируются. Не сравнивать latency локальной RTX 3060 и production server как чистое сравнение моделей.

Качество и стоимость анализируются совместно, но cost savings не могут компенсировать критическую потерю retrieval/citation/security quality.

---

## 14. Benchmark protocol: сравнение алгоритмов

Для каждой серии экспериментов заранее определить:

- гипотезу;
- изменяемый фактор;
- фиксированные факторы;
- dataset version;
- corpus snapshot;
- hardware/runtime profile;
- model/provider/revision;
- параметры индекса и retrieval;
- primary metrics;
- safety guardrails;
- минимально значимый uplift;
- допустимые latency/cost bounds.

### 14.1. Рекомендуемая последовательность RAG benchmark

Сравнивать ступенчато, меняя по возможности один фактор за раз:

1. Exact lookup + PostgreSQL FTS baseline.
2. FTS с tuned configuration.
3. Exact vector search как диагностический baseline.
4. Vector ANN отдельно — с измерением recall delta относительно exact.
5. Hybrid FTS + vector с RRF.
6. Parent-child/context expansion.
7. Optional reranker.
8. Optional MMR/diversity.

Это не обязательная финальная архитектура и не утверждение, что каждый этап нужно внедрить. Если более сложный этап не показывает измеримого uplift на целевых slices, его не следует добавлять.

### 14.2. Chunking benchmark

Сравнивать минимум:

- fixed-size baseline;
- structure-aware chunks;
- parent-child chunks;
- подход с границами по clauses/paragraphs, если parser сохраняет структуру.

Зафиксировать одинаковые source documents, query set и expected source spans. Измерять retrieval quality, locator accuracy, context token volume, duplicate rate, indexing cost и latency.

Не выбирать стратегию только по Recall@K: стратегия, которая находит правильный child chunk, но не может корректно восстановить контекст исключения/определения, может быть хуже для answer quality.

### 14.3. Reranker benchmark

Reranker принимается только если:

- получает исключительно ACL-authorized candidates;
- показывает uplift на заранее выбранных primary metrics;
- не ухудшает критичные slices;
- выдерживает latency/cost budget;
- его модель, revision и hosting/data policy зафиксированы;
- его output не интерпретируется как legal authority/applicability score.

---

## 15. Slices: средние метрики недостаточны

Каждый отчёт должен показывать общую метрику и breakdown по заранее определённым slices.

Рекомендуемые slices:

- exact identifier vs semantic paraphrase;
- короткий vs длинный документ;
- PDF text layer vs DOCX vs TXT;
- таблицы, списки, сноски, многоколоночные страницы;
- negation/exception/condition cases;
- один источник vs multi-document;
- current vs historical edition;
- known vs unknown facts;
- duplicate/near-duplicate evidence;
- low-quality extraction;
- empty/unanswerable cases;
- ACL positive vs ACL negative;
- разные tenant/workspace scope configurations;
- legal act vs court decision;
- разные виды судов/инстанций, если такой корпус доступен.

Slice с малым числом кейсов помечать `LOW_SAMPLE`; не делать сильных выводов на единичных примерах. Однако один подтверждённый security leak или fabrication может быть критичным независимо от статистической мощности.

---

## 16. Thresholds и release gates

Не назначать численные пороги «с потолка». Сначала собрать baseline на репрезентативном наборе, проверить качество разметки, затем утвердить thresholds для конкретного suite и сценария.

### 16.1. Три уровня критериев

**Hard blockers** — бинарные требования, которые нельзя компенсировать:

- ACL leakage = 0;
- невалидные/выдуманные source references в критичных сценариях = 0;
- смешение редакций, приводящее к неправильному правовому выводу, — блокирующая ошибка;
- критичный source locator не разрешается — блокирующая ошибка;
- нарушена целостность/происхождение данных — блокирующая ошибка.

**Quality thresholds** — численные минимумы по Recall, nDCG, claim support, extraction coverage и т.п. Устанавливаются после baseline и экспертной калибровки.

**Operational budgets** — p95 latency, cost per query/indexed page, queue delay, resource ceiling. Утверждаются отдельно с учётом инфраструктуры и целевой нагрузки.

### 16.2. Gate outcome

- `PASS` — все обязательные hard blockers и thresholds выполнены.
- `FAIL` — есть подтверждённое нарушение blocker или порога.
- `BLOCKED` — оценка не может быть завершена (например, нет корректного dataset или corpus snapshot).
- `NOT_EVALUATED` — suite не запускался или не относится к данному изменению.

`WARN` допустим как отдельное состояние внутри report, но не должен маскировать `FAIL`.

### 16.3. Изменение thresholds

Порог нельзя менять в том же PR только потому, что текущая реализация его не проходит. Изменение порога требует:

- причины;
- анализа baseline и распределения результатов;
- оценки влияния на безопасность/качество;
- согласования владельца suite;
- новой версии policy/config.

---

## 17. Regression policy

Каждое изменение, способное повлиять на extraction/retrieval/evidence/ACL, должно запускать соответствующие suites.

Примеры:

| Изменение | Обязательные suites |
|---|---|
| Parser/extraction library | extraction-quality, locator, reference-integrity |
| Chunking strategy | extraction/locator, user-document retrieval или legal retrieval, claim-support smoke |
| Embedding model/profile | vector retrieval, hybrid retrieval, latency-cost, ACL regression |
| FTS config/index | lexical retrieval, exact lookup, hybrid retrieval |
| RRF/ranking weights | retrieval suites, source coverage, critical slices |
| Reranker | retrieval, claim-support sample, latency-cost, ACL reranker-input tests |
| Context Builder | claim-support, citation/reference integrity, token budget, ACL |
| ACL/RLS/cache | полный ACL-security suite; не только unit tests |
| Temporal model/rules | temporal-regression, legal applicability, citation version integrity |
| Answer prompt/model | claim-support, abstention, answer-quality, temporal cases |
| Export/import/index rebuild | portability-regression + retrieval regression |

Для быстрых PR допустимы smoke suites. Полный набор запускается по расписанию, перед релизом и при изменениях соответствующей области. Smoke suite не заменяет release suite.

---

## 18. Reproducibility и Run Manifest

Каждый run должен фиксировать как минимум:

```json
{
  "schemaVersion": "1",
  "runId": "eval-2026-11-17-001",
  "suiteId": "user-document-retrieval",
  "datasetVersion": "udr-v1.2.0",
  "corpusSnapshotId": "synthetic-contracts-v1",
  "gitCommit": "<commit-sha>",
  "applicationVersion": "<build-id>",
  "retrievalConfigHash": "<sha256>",
  "parserVersion": "<version>",
  "chunkingVersion": "<version>",
  "embeddingProfile": {
    "provider": "<provider>",
    "model": "<model-id>",
    "revision": "<revision>",
    "dimensions": 0
  },
  "rerankerProfile": null,
  "hardwareProfile": "<profile-id>",
  "randomSeed": 42,
  "startedAt": "2026-11-17T10:00:00Z",
  "completedAt": "2026-11-17T10:02:00Z"
}
```

Значения в примере — placeholders, не выбранные технологии/модели.

Фиксировать также:

- database/schema migration version;
- FTS configuration and index version;
- vector index parameters (например, HNSW `m`, `ef_construction`, `ef_search`);
- top-K по каналам и после fusion;
- RRF constants/weights;
- reranker configuration;
- prompt/model parameters для answer evaluation;
- locale/timezone и даты temporal case;
- source registry/corpus release version;
- состояние deletion journal, если применимо.

Если provider не гарантирует неизменность model alias, фиксировать доступную revision/version и сохранять фактические request metadata. Нельзя заявлять полную воспроизводимость, если провайдер обновляет модель незаметно.

---

## 19. Report contract

Минимальный отчёт должен включать:

1. Run manifest и dataset/corpus identity.
2. Статус каждого suite/gate.
3. Primary metrics и denominator.
4. Slice breakdown и sample count.
5. Список новых regressions и улучшений.
6. Hard blocker violations.
7. Примеры failure cases с безопасными ссылками на fixtures.
8. Latency/cost/resource profile.
9. Ограничения и недостающие данные.
10. Сравнение с baseline и предыдущим accepted run.

Пример упрощённого report:

```json
{
  "schemaVersion": "1",
  "runId": "eval-2026-11-17-001",
  "suiteId": "user-document-retrieval",
  "datasetVersion": "udr-v1.2.0",
  "status": "FAIL",
  "caseCount": 120,
  "metrics": {
    "recallAt5": {"value": 0.0, "denominator": 120},
    "mrr": {"value": 0.0, "denominator": 120},
    "aclLeakageCount": {"value": 0, "denominator": 120},
    "latencyP95Ms": {"value": 0, "denominator": 120}
  },
  "gates": {
    "aclSecurity": "PASS",
    "retrievalQuality": "FAIL",
    "referenceIntegrity": "NOT_EVALUATED"
  },
  "blockingFailures": ["<case-id>: required evidence missing"],
  "warnings": ["<slice>: low sample count"]
}
```

Нулевые значения — placeholders для схемы, не фактические результаты.

### 19.1. Безопасность отчётов

- Не записывать реальные документы, полные клиентские запросы, секреты или персональные данные в обычные CI logs.
- Synthetic fixtures можно хранить в Git.
- Approved real-data evaluation — только в разрешённой среде, с ограничением доступа и retention.
- Для report использовать case IDs и безопасные excerpts/hashed references, если полный текст не нужен.
- Не включать content в exception traces и telemetry по умолчанию.
- Отчёты с клиентскими данными классифицировать и защищать как соответствующие исходные данные.

---

## 20. Минимальный стартовый golden set

Стартовый набор должен быть диагностическим и расширяться по мере появления корпуса. Размеры ниже — ориентир для первого цикла, не статистическая гарантия качества.

### 20.1. User-document retrieval

- exact clause/heading lookup;
- semantic paraphrase;
- запрос по определению термина;
- negation и исключения;
- условие, распределённое по нескольким абзацам;
- таблица/приложение;
- multi-document query;
- дубли и near-duplicates;
- missing-answer case;
- document version case.

### 20.2. Legal provision retrieval

- точный номер статьи/пункта;
- название акта;
- semantic description of legal situation;
- историческая редакция;
- несколько редакций в корпусе;
- положение с исключением/оговоркой;
- переходное положение;
- конкурирующие нормы;
- неизвестная юрисдикция/неполный контекст;
- unanswerable case.

### 20.3. ACL/security

- пользователь внутри разрешённого workspace;
- пользователь другой организации;
- пользователь без workspace membership;
- viewer/editor/owner boundaries;
- Org Admin без content access;
- AdminGrant только в разрешённом scope и сроке;
- revoked access;
- cache key collision attempt;
- direct citation/source preview attempt;
- parent expansion crossing ACL boundary;
- reranker candidate isolation;
- stale background job after revocation.

### 20.4. Extraction

- DOCX с заголовками и нумерацией;
- DOCX с таблицами и объединёнными ячейками;
- DOCX со сносками/колонтитулами;
- PDF с текстовым слоем;
- PDF с двумя колонками;
- PDF с таблицей;
- повреждённый/неполный файл;
- файл с очень большим объёмом текста;
- скан без OCR (ожидаемое ограниченное/отклонённое поведение согласно текущему gate).

### 20.5. Claim support и abstention

- прямое подтверждение;
- допустимый логический вывод;
- частичная поддержка;
- утверждение без evidence;
- противоречие между двумя источниками;
- отсутствует существенный документ;
- extraction неполон;
- факты `unknown`;
- правовая редакция не определена;
- корректный запрос уточняющих фактов.

---

## 21. Acceptance criteria для самого Evaluation Framework

Контракт можно считать реализованным на MVP-уровне, когда:

1. Есть версионируемый формат suites/datasets/cases.
2. Runner может выполнить suite на фиксированном corpus snapshot.
3. Run manifest фиксирует код, данные, модели и retrieval config.
4. Метрики имеют документированные определения, K и denominators.
5. Есть case-level results и агрегированный report.
6. Отчёт показывает slices и sample counts.
7. ACL/security failures не скрываются средними метриками.
8. Есть baseline run, с которым сравниваются изменения.
9. Dataset/annotation changes версионируются.
10. Synthetic fixtures отделены от approved real-data suites.
11. CI может запускать targeted smoke suite и блокировать критические регрессии.
12. Можно воспроизвести причину изменения метрики между двумя runs.

### 21.1. Не является acceptance criteria

- наличие красивого dashboard;
- отдельный микросервис Evaluation;
- использование LLM judge для всех ответов;
- тысячи тест-кейсов до запуска первого retrieval;
- единый score качества продукта;
- автоматическое присвоение продукту статуса «юридически надёжен».

---

## 22. Рекомендуемый план внедрения

### Stage E0 — Manual baseline

- Зафиксировать первые synthetic/approved cases.
- Разметить expected evidence и expected behavior.
- Запустить простые скрипты/тесты вручную.
- Сохранить manifest и report.
- Не вводить сложную инфраструктуру.

### Stage E1 — Retrieval runner

- JSONL/JSON dataset format.
- Runner для FTS/vector/hybrid variants.
- Recall@K, Precision@K, MRR, nDCG@K, required evidence recall.
- Slice breakdown.
- Сравнение с baseline.

### Stage E2 — Extraction and citation evaluation

- parser fixtures;
- source locator checks;
- quote/reference integrity;
- quality gate false accept/reject analysis.

### Stage E3 — ACL and temporal suites

- security test harness с tenant/workspace fixtures;
- проверка каждого retrieval/context path;
- temporal regression suite с expert-reviewed cases.

### Stage E4 — Claim support and answer evaluation

- structured claims/evidence mapping;
- expert rubric;
- abstention evaluation;
- ограниченное применение LLM judge для triage.

### Stage E5 — Release and operational integration

- targeted CI suites;
- scheduled full benchmark;
- release gates;
- latency/cost dashboards только при реальной потребности.

---

## 23. Открытые вопросы

Эти пункты не закрываются данным PROPOSED-документом:

1. Кто владелец каждого suite и кто утверждает expected results?
2. Кто имеет право утверждать правовую разметку и adjudication?
3. Где хранить approved real-data datasets и reports?
4. Какие suites допустимы в CI, а какие только в защищённом staging?
5. Какие минимальные объёмы holdout-наборов нужны для каждого домена?
6. Как часто пересматривать golden set при изменении законодательства и корпуса?
7. Как связывать legal corpus release с dataset version?
8. Какие exact quality thresholds установить после baseline?
9. Какой допустимый latency/cost budget для каждого пользовательского сценария?
10. Какие failure severity levels должны блокировать релиз?
11. Какой формат экспертной rubric и процесс разрешения разногласий утвердить?
12. Как обеспечить воспроизводимость при обновляемых внешних model aliases?

---

## 24. Связь с существующими документами и правила приоритета

Этот документ — **новое PROPOSED дополнение**, а не изменение канонических документов.

При интеграции необходимо сохранить существующую иерархию проекта и сверить формулировки с:

- `docs/17-rag-and-knowledge-retrieval.md` — общая RAG архитектура и базовые retrieval metrics;
- `docs/18-legal-research-and-external-sources.md` — legal retrieval, source registry, temporal/legal correctness;
- `docs/30-portability-integrity-and-search-validation.md` — validation при export/import и integrity;
- `docs/33-phase6-rag-implementation-specification.md` — Phase 6 implementation gates;
- `docs/ai/retrieval/07-retrieval-evaluation.md` — PROPOSED legal retrieval evaluation;
- `docs/ai/retrieval/09-temporal-evaluation-cases.md` — temporal regression cases;
- `docs/decisions-log.md` — решения и открытые вопросы.

### 24.1. Важное разграничение с docs/30

`docs/30` остаётся областью portability/integrity/search validation для export/import и переноса индекса. Этот документ не забирает у него runbook и не дублирует процедуру восстановления. Он предлагает общий формат оценки алгоритмов, на который `docs/30` может ссылаться при проверке retrieval regression после переноса.

### 24.2. Никакие решения не закрываются автоматически

Создание этого документа не закрывает O-006, FILE-009, Gate B или другие D/O/H decisions. Пороговые значения, модель, chunking strategy, corpus schema и production architecture не считаются утверждёнными.

---

## 25. Итоговая рекомендация

Начать с минимального evaluation runner и небольшого, но качественно размеченного synthetic golden set. Первыми измерять то, что можно проверить воспроизводимо: extraction/locator, exact lookup, retrieval ranking и ACL isolation. Затем добавлять claim support, temporal applicability и экспертную оценку ответов по мере появления соответствующих данных и процессов.

Не строить сейчас отдельную платформу оценки и не вводить единый юридический рейтинг. Главная ценность первого этапа — не количество метрик, а способность обнаружить регрессию, локализовать её и воспроизвести.

**Критерий зрелости:** команда может показать не только, что новая версия «кажется лучше», но и на каких сценариях она лучше, где стала хуже, насколько надёжна разметка, какие критические ошибки исключены и какие ограничения остаются неизвестными.

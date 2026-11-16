# Extraction Quality & Parser Contract

**Статус:** PROPOSED — проект алгоритмического контракта, не утверждённое архитектурное решение.

**Дата:** 2026-11-17  
**Область:** пользовательские документы (Phase 6 / RAG). Не определяет ingestion нормативной базы и судебных актов.  
**Режим изменений:** addendum-only. Этот документ не требует и не подразумевает изменения существующих файлов, `decisions-log.md`, roadmap, Prisma schema или кода.

## 1. Цель и границы

Цель — определить проверяемый контракт преобразования загруженного бинарного файла в структурированное, прослеживаемое и пригодное для поиска представление, не теряющее связь с оригиналом.

Extraction не равен parsing, normalization, chunking или indexing:

1. **Extraction** извлекает содержимое из конкретного бинарного артефакта.
2. **Parsing** восстанавливает доступную структуру: страницы, абзацы, заголовки, списки, таблицы и их порядок.
3. **Normalization** создаёт производное поисковое представление, не подменяя исходный текст.
4. **Chunking** формирует retrieval units из структурных элементов.
5. **Indexing** строит FTS/vector-представления и проверяет их полноту.

Успех одного этапа не означает успех следующих. В частности, наличие непустого `textContent` не доказывает, что документ извлечён полно, структурно корректно или пригоден для точных цитат.

### 1.1 Что этот контракт не решает

- OCR и обработку сканированных документов — D-031 остаётся ограничением до отдельного решения.
- Выбор parser library/vendor и Python-vs-TypeScript runtime.
- Выбор embedding model, tokenizer и chunking parameters (Gate B / FILE-009).
- Юридическую интерпретацию документа или проверку истинности содержащихся в нём утверждений.
- Формирование правовой базы LegalAct/LegalProvision.

## 2. Аудированный AS-IS и конкретный риск

На дату аудита в `apps/api/src/documents/extract-text.ts` реализованы:

- TXT: `Buffer.toString("utf8")`, проверка пустоты и лимита символов.
- DOCX: чтение только `word/document.xml`, замена tab/end-paragraph и удаление XML-тегов регулярным выражением.
- PDF: `pdf-parse`, общий `parsed.text` и `numpages`.
- OCR отсутствует; PDF без text layer возвращает `NO_TEXT_LAYER` согласно D-031.

Текущая модель результата содержит `text`, `pageCount`, `extractor`, но не предоставляет структурных блоков, стабильных page/paragraph/table locators, source offsets, extraction quality report или confidence markers.

Основные риски:

1. DOCX flattening может потерять или исказить таблицы, заголовки, нумерацию, сноски, колонтитулы, hyperlinks и другие части OOXML.
2. PDF plain text может потерять layout, порядок колонок, границы страниц, таблицы, колонтитулы и связь фрагмента с точной страницей.
3. Простая проверка `text.length > 0` допускает частичное или повреждённое извлечение как успешное.
4. Нельзя надёжно восстановить цитату с точным locator только из плоской строки и общего количества страниц.
5. Ошибка извлечения может выглядеть как отсутствие содержания, хотя фактически это parser limitation.

Это не означает, что текущий extractor бесполезен: он подходит для раннего текстового MVP и smoke tests. Но его результат нельзя автоматически считать production-grade evidence для юридических документов.

## 3. Основные инварианты

### 3.1 Source of truth

- Оригинальный бинарный файл — неизменяемый первичный источник.
- Каждая обработка привязана к конкретной `DocumentVersion` и checksum оригинала.
- Extracted content — производный артефакт; он никогда не заменяет оригинал.
- Любая цитата должна разрешаться обратно к версии оригинала и locator, а не только к текущему `Document`.

### 3.2 Разделение представлений

Нужно хранить или воспроизводимо получать разные представления:

| Представление | Назначение | Может использоваться как дословная цитата |
|---|---|---|
| `sourceArtifact` | Исходный бинарный файл | Да, через просмотр оригинала |
| `rawExtractedText` | Текст extractor в исходном порядке насколько это возможно | Только при наличии проверенного locator и точной source mapping |
| `canonicalText` | Стабильная последовательность текстовых блоков с нормализованными разделителями | Не автоматически |
| `normalizedText` | Поисковая нормализация Unicode/пробелов и т.п. | Нет |
| `retrievalText` | Текст для FTS/embedding, может содержать title/heading context | Нет |

Необязательно физически дублировать все строки в БД. Допускается хранить source blocks и детерминированно строить производные представления. Но логическое различие обязательно.

### 3.3 Не выдумывать структуру

- Не распознанный номер пункта нельзя выдавать за точный номер пункта.
- Предполагаемая таблица, заголовок или граница страницы должны иметь `inferred`/`uncertain` provenance.
- Отсутствие locator — это отсутствие locator, а не повод вычислить его по приблизительному смещению.
- Если parser не может подтвердить точность цитирования, система должна понизить качество evidence или запретить точную цитату.

### 3.4 Fail closed для непригодного evidence

Документ с критически неполным или невалидным извлечением не должен становиться `searchable` как будто его содержимое полное. Допустим отдельный статус «текст извлечён частично / требуется проверка», но он не должен молча трактоваться как полноценный источник.

## 4. Предлагаемый pipeline

```text
Immutable DocumentVersion + checksum
  -> file validation / MIME sniffing
  -> format-specific extractor
  -> source blocks + raw text + source locators
  -> structural parser
  -> extraction quality report
  -> canonical representation
  -> normalization (versioned)
  -> structural chunking
  -> FTS / embeddings
  -> index validation
  -> Searchable activation
```

Каждый этап должен:

- принимать идентификатор конкретной версии документа;
- фиксировать версии инструмента/конфигурации;
- иметь ограничение по времени, размеру, памяти и числу элементов;
- быть идемпотентным для одного и того же input + config hash;
- выдавать machine-readable результат и ошибки;
- не логировать текст документа, фрагменты или чувствительные metadata в обычные application logs.

## 5. Parser output contract

Рекомендуемый логический интерфейс (не готовая Prisma schema):

```ts
type ExtractionArtifact = {
  documentVersionId: string;
  sourceChecksum: string;
  extractor: { id: string; version: string; configHash: string };
  parser: { id: string; version: string; configHash: string };
  status: "succeeded" | "partial" | "failed";
  rawTextRef: string;
  blocks: SourceBlock[];
  quality: ExtractionQualityReport;
};

type SourceBlock = {
  blockId: string;
  ordinal: number;
  kind: "heading" | "paragraph" | "list_item" | "table" |
        "table_row" | "table_cell" | "footnote" | "header" |
        "footer" | "caption" | "page_text" | "unknown";
  text: string;
  parentBlockId?: string;
  locator: SourceLocator;
  structure: StructureEvidence;
};

type SourceLocator = {
  page?: { start: number; end: number; basis: "native" | "inferred" };
  paragraphIndex?: number;
  tableIndex?: number;
  rowIndex?: number;
  cellIndex?: number;
  headingPath?: string[];
  sourceOffsets?: { start: number; end: number; unit: "utf16" | "unicode_codepoint" | "byte" };
  nativeAnchor?: string;
};

type StructureEvidence = {
  basis: "native" | "heuristic" | "unknown";
  confidence?: number;
  warnings: string[];
};
```

Это контракт на уровне доменной модели, а не требование использовать именно эти TypeScript-типы или хранить все поля в одной таблице.

### 5.1 Locator semantics

- Page numbering: 1-based для отображения пользователю; внутренние библиотеки могут иметь 0-based, но преобразование должно быть единым и протестированным.
- Offsets должны явно указывать единицу измерения. Нельзя смешивать UTF-8 bytes, UTF-16 code units и Unicode code points.
- Offsets относятся к конкретной immutable версии конкретного представления (например, `rawTextRef` + `representationVersion`), а не к «тексту документа вообще».
- `headingPath` — контекст структуры, не самостоятельный точный locator.
- Если страница или paragraph index не доступны из формата/parser, поле отсутствует; approximate page нельзя представлять как native.
- `nativeAnchor` может содержать стабильный идентификатор OOXML/PDF object, если parser способен его предоставить. Не строить фальшивые anchors.

### 5.2 Table contract

Таблица — структурный объект, а не строка с произвольными пробелами.

Минимум:
- table ordinal / locator;
- row и cell ordinal;
- текст каждой ячейки;
- связь ячейки с заголовком колонки, если она распознана;
- merged cells / repeated headers — как минимум warning, если точно не поддерживаются;
- сохранение порядка чтения.

Для retrieval можно формировать текст строки с контекстом колонок, например `Срок оплаты: 10 рабочих дней`, но citation quote должна ссылаться на исходный текст ячейки/строки и не должна выдавать добавленные подписи за оригинал.

## 6. Format-specific requirements

### 6.1 TXT

Проверять:
- корректность декодирования UTF-8 (не полагаться только на `Buffer.toString`, который может заменить невалидные последовательности);
- BOM и нормализацию line endings;
- NUL/control characters и чрезмерную долю replacement characters;
- пустой/whitespace-only файл;
- ограничения размера до и после декодирования.

Не пытаться угадывать неизвестную кодировку без явной политики. Если нужна поддержка Windows-1251 и иных кодировок, это отдельная capability с определением/подтверждением encoding и warning при эвристике.

TXT не имеет надёжных page locators. Допустимы line/paragraph offsets в canonical representation, но UI должен показывать «абзац/фрагмент», а не выдуманную страницу.

### 6.2 DOCX / OOXML

Чтение только `word/document.xml` недостаточно для полного документа. Парсер должен явно определить поддерживаемые части пакета:

- `word/document.xml` — основной текст, абзацы, runs, таблицы;
- styles/numbering — для восстановления heading styles и нумерации, если поддерживается;
- footnotes/endnotes — отдельные блоки с отношением к документу;
- headers/footers — по отдельной политике, не смешивать с основным текстом;
- hyperlinks — сохранить target как metadata, не терять видимый текст;
- tracked changes/comments — определить политику: принимать финальную редакцию, исходную или помечать неоднозначность; не смешивать молча;
- text boxes / drawings / embedded objects — unsupported или warning, если текст не извлекается;
- таблицы — сохранить row/cell hierarchy и merged-cell metadata, насколько возможно.

Требования:
- XML должен разбираться XML parser-ом, а не удалением тегов регулярным выражением.
- Обрабатывать XML entities корректно; запрещать небезопасные external entity resolution (XXE).
- Не исполнять макросы и не открывать embedded content как активное содержимое.
- Сохранять document order и paragraph/table boundaries.
- Heading style и нумерация могут быть native или heuristic — источник распознавания должен быть указан.
- Если tracked changes влияют на смысл текста, quality report должен отразить выбранную политику.

DOCX обычно не содержит фиксированной пагинации, идентичной отображению в Word на всех платформах. Не обещать точную страницу без renderer-based pagination и закреплённой версии rendering engine. В MVP надёжнее цитировать heading path + paragraph/table locator.

### 6.3 PDF

PDF — формат визуального представления; текстовый слой может не соответствовать естественному порядку чтения.

Требования:
- сохранять page boundaries и page-local text blocks;
- по возможности сохранять координаты bounding boxes и порядок блоков;
- обнаруживать признаки multi-column layout и не склеивать колонки в неверном порядке без warning;
- обнаруживать повторяющиеся headers/footers и не удалять их без фиксированной, версионированной политики;
- извлекать таблицы как таблицы только при достаточном качестве; иначе помечать как unstructured/uncertain;
- фиксировать encrypted/password-protected, malformed, truncated и unsupported PDFs отдельными error codes;
- проверять фактическое число страниц против configured limits;
- обнаруживать text-layer absence и крайне низкую плотность текста — без запуска OCR до отдельного разрешения.

Page locator должен быть native, если библиотека предоставляет page-level mapping. Если текущая библиотека возвращает только aggregate text, нельзя равномерно распределять текст по страницам и считать результат точным.

### 6.4 Сканированные и смешанные PDF

Согласно D-031, OCR не включать автоматически. Результат:
- `NO_TEXT_LAYER`, если текстового слоя нет;
- `PARTIAL_TEXT_LAYER` / `LOW_TEXT_COVERAGE`, если часть страниц имеет текст, а часть выглядит сканированной (названия error codes уточнить в реализации);
- `PARTIAL` с явным списком страниц, если parser достоверно выявляет пропуски.

Смешанный PDF нельзя считать полностью извлечённым только потому, что несколько страниц содержат текст. До отдельного решения OCR-страницы должны быть недоступны как будто они прочитаны.

## 7. Extraction Quality Report

Каждая extraction attempt должна выдавать отчёт качества. Он нужен не для декоративного score, а для решения: `succeeded`, `partial` или `failed`, и допускается ли indexing.

Предлагаемые поля:

```ts
type ExtractionQualityReport = {
  outcome: "pass" | "review_required" | "fail";
  checks: Array<{
    code: string;
    result: "pass" | "warning" | "fail" | "not_applicable";
    observed?: number | string | boolean;
    threshold?: number | string | boolean;
    detailsCode?: string;
  }>;
  sourcePageCount?: number;
  parsedPageCount?: number;
  pagesWithText?: number;
  pagesWithoutText?: number;
  extractedCharCount: number;
  replacementCharCount?: number;
  controlCharCount?: number;
  blockCount: number;
  tableCount?: number;
  unsupportedFeatureCount: number;
  warnings: string[];
};
```

Не сохранять чувствительные текстовые excerpts в обычном отчёте или логах. Для debugging использовать защищённый доступ к исходному артефакту и ограниченный диагностический режим.

### 7.1 Базовые quality checks

| Check | Условие | Предлагаемый результат |
|---|---|---|
| `SOURCE_CHECKSUM_MATCH` | Input checksum совпадает с DocumentVersion | Fail при несовпадении |
| `FORMAT_VALID` | Файл действительно соответствует заявленному формату | Fail при mismatch/corruption |
| `TEXT_NON_EMPTY` | Есть содержательный текст | Fail при пустом тексте |
| `DECODE_VALID` | Нет существенной порчи декодирования | Review/fail по порогам |
| `PAGE_COVERAGE` | Проверены все страницы PDF | Review/fail при пропусках |
| `BLOCK_ORDER_VALID` | Порядок блоков детерминирован и непротиворечив | Review при сомнении |
| `LOCATOR_COVERAGE` | У индексируемых блоков есть locator требуемого уровня | Fail для citation-grade indexing, если locator обязателен |
| `TABLE_STRUCTURE` | Таблицы не потеряны/не сплющены незаметно | Review при unsupported tables |
| `UNSUPPORTED_FEATURES` | Необработанные значимые элементы отражены | Review/fail по типу |
| `TEXT_COVERAGE` | Значимый извлекаемый текст покрыт блоками | Fail при необъяснимых пропусках |
| `DUPLICATE_CONTENT` | Нет аномального дублирования страниц/блоков | Review |
| `RESOURCE_LIMITS` | Время, память, размер и страницы в лимитах | Fail при превышении |

### 7.2 Не использовать один magic quality score

Один `qualityScore = 0.93` скрывает разные типы дефектов. Например, 99% текста без locator может быть непригодно для цитирования, а 90% текста с отсутствующей страницей договора может пропустить критическое условие.

Использовать набор проверок + итоговую категорию. Пороговые значения должны быть калиброваны на тестовом корпусе по форматам; не утверждать произвольные проценты до измерений.

### 7.3 Правила исхода

- `pass`: нет fail checks; нет warnings, влияющих на полноту/locator/evidence.
- `review_required`: текст частично пригоден, но присутствуют явно обозначенные ограничения; по умолчанию не включать в обычный citation-grade retrieval.
- `fail`: повреждённый файл, отсутствие содержимого, критическая неполнота, неверный checksum, небезопасный формат или превышение hard limits.

Вариант индексации `review_required` возможен только при явном продуктово-правовом решении: retrieval должен видеть quality warning, а генерация — не выдавать такие фрагменты как надёжное доказательство.

## 8. Quality gates между этапами

| Переход | Условия допуска |
|---|---|
| Binary → Extraction | MIME/signature validation, checksum, security limits |
| Extraction → Parsing | Extraction succeeded/partial с сохранёнными raw artifacts |
| Parsing → Normalization | Блоки имеют стабильный порядок и корректную source mapping |
| Normalization → Chunking | Версии представлений зафиксированы; normalization не уничтожила citation source |
| Chunking → Indexing | Chunk coverage проверена; каждый chunk связан с source block/locator |
| Indexing → Searchable | FTS/vector build validation и lifecycle activation contract выполнены |

Нельзя активировать поисковое поколение только потому, что worker завершился без исключения. Нужна проверка результатов и manifest/config consistency.

## 9. Citation-grade source mapping

Для каждого chunk должны быть доступны:

- `documentVersionId` и checksum source artifact;
- extraction artifact ID/revision;
- parser/normalization/chunker versions;
- список source block IDs;
- exact raw text span или список spans;
- locators для каждого source block;
- признак native/inferred/unknown для каждого важного locator;
- возможность открыть оригинал на нужной странице/позиции, если формат это поддерживает.

### 9.1 Нельзя делать

- Формировать цитату из `retrievalText`, где добавлены title/heading path, и выдавать весь текст как дословную цитату.
- Применять Unicode normalization/whitespace cleanup к quote и терять возможность восстановить исходную последовательность.
- Выдавать page number, полученный приблизительным распределением aggregate PDF text, за точную страницу.
- Сливать несколько разрозненных source spans в одну цитату без явного обозначения пропусков.
- Показывать citation как verified, если source mapping не прошёл проверку.

### 9.2 Цитата при нескольких блоках

Если утверждение поддерживается несколькими абзацами/ячейками, хранить несколько evidence spans. UI может сгруппировать их под одним источником, но не должен визуально создавать впечатление, что фрагменты были непрерывным абзацем.

## 10. Безопасность и эксплуатация

Parser работает с недоверенными файлами. Минимальные требования:

- лимиты compressed и decompressed size (защита от ZIP bombs для DOCX);
- лимиты числа ZIP entries, XML depth/size, PDF pages и object count;
- timeout, memory/CPU budget и ограничение параллелизма;
- запрет XXE и внешних сетевых запросов из parser;
- не исполнять макросы, scripts, embedded attachments;
- временные файлы — в изолированной директории с гарантированной очисткой;
- не доверять расширению и client-provided MIME; проверять magic/signature;
- не писать extracted text, quotes, filenames с PII и document content в application logs;
- ошибки наружу — безопасные error codes, детали — ограниченные audit diagnostics;
- parser dependency versions pinning и регулярное обновление по security advisories.

Parser не должен иметь сетевого доступа по умолчанию. Если конкретный parser требует внешние ресурсы, это отдельный security review.

## 11. Повторная обработка и воспроизводимость

Extraction artifact идентифицируется как минимум комбинацией:

`documentVersionId + sourceChecksum + extractorId/version/configHash + parserId/version/configHash`.

Изменение parser или его конфигурации создаёт новую extraction revision, не перезаписывая исторический artifact без следа.

Требования:
- повторный запуск с теми же input/config должен быть идемпотентным;
- одинаковый input/config должен выдавать детерминированный результат, насколько это гарантирует выбранная библиотека;
- если результат может различаться из-за nondeterminism, это документируется и включается в manifest;
- предыдущая успешная extraction сохраняется до проверки новой;
- новая extraction не активируется, если checksum source version изменился;
- downstream chunks/embeddings инвалидируются по dependency/version hash, а не по предположению, что «текст вроде тот же».

Согласовать manifest с `docs/28`; не создавать вторую независимую систему provenance. Для parser contract manifest должен включать версии extractor, parser, normalization, source format handling и quality rules.

## 12. Acceptance tests

### 12.1 TXT

1. UTF-8 без BOM.
2. UTF-8 с BOM.
3. CRLF/LF смешанные переводы строк.
4. Невалидные UTF-8 byte sequences.
5. NUL/control characters.
6. Пустой файл и whitespace-only.
7. Очень длинная строка без переводов строк.
8. Русский текст с `ё`, кавычками, тире, §, №, Unicode combining marks.
9. Превышение размера до и после декодирования.
10. Файл с повторяющимися блоками и дублированным содержимым.

### 12.2 DOCX

11. Обычные paragraphs/runs с разным форматированием.
12. Heading styles и вложенные уровни.
13. Numbering: нумерованные и маркированные списки.
14. Вложенные таблицы, merged cells, пустые ячейки.
15. Footnotes/endnotes.
16. Headers/footers.
17. Hyperlinks с сохранением видимого текста и target metadata.
18. Tracked changes: insert/delete и выбранная политика отображения.
19. Comments/text boxes/embedded objects — корректный warning или явный unsupported.
20. Повреждённый ZIP/XML и ZIP bomb test.
21. XML external entity payload — не должен читать локальные файлы/ходить в сеть.
22. Повторный парсинг того же файла — стабильный block order и hashes.

### 12.3 PDF

23. Native text PDF, одна колонка.
24. Двухколоночный документ с правильным reading order.
25. Header/footer на каждой странице.
26. Таблица с несколькими строками и переносами.
27. PDF с одной пустой страницей между текстовыми.
28. Смешанный PDF: text pages + image-only pages.
29. Полностью сканированный PDF — `NO_TEXT_LAYER`, без ложного успеха.
30. Повреждённый/truncated PDF.
31. Encrypted PDF.
32. PDF с rotated pages.
33. PDF с ligatures, переносами слов и soft hyphens.
34. Лимит страниц и лимит извлечённого текста.
35. Проверка page locator на заранее размеченном корпусе.

### 12.4 Общие pipeline и citations

36. Изменение исходного файла при неизменном documentId меняет version/checksum и не смешивает extraction.
37. Новая parser version создаёт новую extraction revision.
38. Fail новой extraction не уничтожает последнюю валидную extraction.
39. Chunk source mapping точно восстанавливает исходный span.
40. RetrievalText с добавленным heading не попадает в quote.
41. Несмежные spans отображаются как отдельные цитируемые фрагменты.
42. Partial extraction не становится searchable без разрешённой policy.
43. Неполная страница/таблица вызывает warning/fail по golden expectations.
44. Ошибки parser не содержат document text в логах.
45. Дубликат job не создаёт дублирующие blocks/chunks.

### 12.5 Golden corpus

Создать небольшой версионируемый корпус с ручной разметкой:
- ожидаемый текст каждого блока;
- ожидаемый порядок блоков;
- heading/table/list hierarchy;
- точные page/paragraph/table locators там, где они существуют;
- намеренно unsupported/ambiguous элементы;
- ожидаемые quality warnings.

Golden corpus должен включать реальные по структуре юридические документы, но использовать синтетические или специально обезличенные данные. Не загружать реальные клиентские документы в публичные тестовые сервисы.

## 13. Метрики качества

Отдельно измерять:

- **Text extraction coverage** — доля размеченного извлекаемого текста, восстановленная parser;
- **Block order accuracy** — корректность порядка блоков;
- **Structure F1** — качество восстановления заголовков/пунктов/таблиц;
- **Locator accuracy** — точность page/paragraph/table locators;
- **Table cell accuracy** — точность значений и соответствия колонкам;
- **Unsupported feature recall** — доля неподдерживаемых элементов, о которых система предупредила;
- **Citation span exact match** — совпадение quote с исходным текстом;
- **False-ready rate** — доля документов, ошибочно допущенных к searchable при дефекте extraction.

Для production юридического RAG важнее минимизировать false-ready и ложные citation locators, чем максимизировать извлечённое количество символов любой ценой.

Не назначать target thresholds без baseline на golden corpus. Пороговые значения должны утверждаться отдельно по форматам и типам locator.

## 14. Этапность реализации без преждевременной сложности

### Stage A — безопасный text MVP

- оставить поддержку TXT/DOCX/PDF;
- улучшить file signature/decoding/security validation;
- заменить regex XML stripping на корректный OOXML parser;
- добавить page-level PDF extraction или явно запретить page-specific citations до его появления;
- сформировать extraction quality report;
- хранить parser/extractor version + checksum;
- не включать OCR;
- не заявлять поддержку сложных таблиц/footnotes, пока тесты не подтверждают качество.

### Stage B — структурный parser

- единый SourceBlock/SourceLocator contract;
- DOCX headings, paragraphs, lists, tables, footnotes;
- PDF page blocks, reading order, coordinates при поддержке библиотеки;
- table representation;
- structural warnings и locator tests;
- source mapping от chunks к исходным blocks.

### Stage C — citation-grade hardening

- экспертно размеченный legal-document golden corpus;
- точные цитаты и locators на всех поддерживаемых форматах;
- partial extraction policy;
- parser regression suite в CI;
- controlled reprocessing и manifest integration;
- review workflow для сомнительных документов, если продукт решит его поддерживать.

Не обязательно реализовывать Stage C целиком до первого внутреннего FTS прототипа. Но нельзя выдавать прототипный extraction за production-grade legal evidence.

## 15. Открытые вопросы — не решения

1. Какие DOCX features входят в поддерживаемый MVP: tables, footnotes, tracked changes, headers/footers, text boxes?
2. Какой PDF parser обеспечивает page-level blocks/coordinates с приемлемой лицензией, точностью русского текста и latency?
3. Нужна ли renderer-based pagination для DOCX или на MVP достаточно heading/paragraph locators?
4. Какие типы `review_required` документов допустимо индексировать, и как UI/LLM обязаны показывать ограничение?
5. Каковы конкретные лимиты parser resource budget и пороги качества на основании golden corpus?
6. Храним ли raw extraction text как отдельный immutable artifact в object storage, в PostgreSQL или комбинированно? Это должно учитывать D-025 и portability docs.
7. Как связываются extraction revisions, DocumentVersion и SearchIndexGeneration без дублирования manifest из docs/28?
8. Нужен ли ручной review для документов с низким locator confidence в первом релизе, или такие документы просто не допускаются к citation-grade search?

## 16. Рекомендации и решения, которые нельзя принимать молча

- Не считать `pdf-parse` + aggregate `parsed.text` достаточным основанием для точных page citations.
- Не считать regex removal XML tags полноценным DOCX parser.
- Не включать OCR в реализацию без изменения D-031 и отдельного security/data-processing review.
- Не вводить обязательный Python parser service только из-за сложности parsing: сначала сравнить зрелые TS/Node библиотеки и реальные golden fixtures.
- Не вводить универсальный confidence score, пока нет калибровки и понятной семантики.
- Не индексировать partial output без явной policy и propagation warnings до ответа.
- Не путать extraction quality с legal correctness: parser может точно извлечь ошибочный/неприменимый документ.

## 17. Критерии готовности контракта к реализации

Контракт можно считать готовым к реализации после того, как:

- согласован список поддерживаемых форматов/features MVP;
- выбраны parser candidates и проверены на golden fixtures;
- утверждена семантика `pass` / `review_required` / `fail`;
- определён минимальный citation locator для каждого формата;
- выбран способ хранения raw extraction artifacts;
- определена связь с DocumentVersion и manifest из docs/28;
- утверждены security/resource limits;
- тесты подтверждают, что partial extraction не становится silently searchable.

До этого документ остаётся PROPOSED. Он не закрывает D-031, FILE-009, Gate B или любые O-/D-решения.

---

**Итог аудита:** текущий extractor — допустимая временная реализация для извлечения текста, но не полноценный parser и не надёжный источник точных юридических цитат. Главный продуктовый риск — не отсутствие OCR или сложной модели, а незаметная потеря структуры/содержимого при формально успешной обработке. Сначала обеспечить прозрачность качества, source mapping и fail-closed поведение; только затем наращивать retrieval sophistication.

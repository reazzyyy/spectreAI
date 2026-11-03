# 30. Portability Integrity and Search Validation

**Статус: PROPOSED.** Проверки полноты переноса, целостности корпуса и сохранения качества retrieval.

**Связанные документы:** `17-rag-and-knowledge-retrieval.md`, `18-legal-research-and-external-sources.md`, `27-data-portability-and-index-transfer.md`, `28-index-build-manifest-and-reproducibility.md`, `29-corpus-export-import-runbook.md`, `22-testing-and-quality-strategy.md`.

## 1. Что требуется доказать

1. **Completeness:** все ожидаемые сущности и объекты перенесены.
2. **Integrity:** данные и связи не повреждены.
3. **Semantic consistency:** текст, структура, версии и embeddings соответствуют snapshot.
4. **Retrieval quality:** поиск на target сохраняет приемлемое качество.

Одинаковое количество chunks не доказывает правильность текста или связей.

## 2. Уровни проверки

### Level 1 — package validation
- manifest schema/version;
- export ID;
- object inventory;
- sizes/checksums;
- counts;
- отсутствие секретов и запрещённых категорий;
- совместимость версий.

### Level 2 — database integrity
- counts по сущностям;
- PK/unique constraints;
- foreign keys;
- orphan records;
- sequences/identity;
- schema revision;
- extensions.

### Level 3 — content integrity
Проверить checksums исходников, extracted/normalized text и chunks; порядок chunks; structural parent/child links; связи document/version/provision; validFrom/validTo, если присутствуют.

Для юридического текста отдельно проверить символы параграфа, нумерацию, кавычки, тире, Unicode и ссылки. Точная checksum хранимого текста должна отличаться от любых поисковых normalization transformations.

### Level 4 — embedding integrity
Проверить:
- embedding count;
- dimensions;
- provider/model metadata;
- отсутствие NULL/NaN/Infinity;
- связь vector с правильным chunk;
- отсутствие смешивания несовместимых embedding spaces;
- checksum vector payload, если выбран стабильный формат сериализации.

Не вызывать embedding provider повторно для проверки обычного переноса. Сравнивать перенесённые сохранённые значения.

### Level 5 — search index health
Проверить наличие и валидность FTS/GIN и vector indexes, ожидаемую FTS configuration, vector operator/distance settings, filters по источнику/версии/дате и корректность ACL для приватных данных.

## 3. Сравнение source и target

Сравнить в одном scope и snapshot boundary:
- document/version/structural node counts;
- extraction/chunk/embedding counts;
- object count и total bytes;
- число ошибок/пропусков;
- checksums по каждому слою.

Если после snapshot применены удаления, исключения должны быть отражены в отчёте и объяснены deletion journal, а не считаться необъяснённой потерей.

## 4. Retrieval regression suite

### 4.1 Baseline
До экспорта сохранить контрольный набор запросов и результаты на source. После импорта повторить тот же набор с той же search configuration.

Baseline содержит:
- query ID;
- query text, если хранение разрешено;
- expected relevant document/version/provision IDs;
- ожидаемые source/citation references;
- дата, на которую проверяется право;
- scope/filters;
- top-K и search config;
- результаты и метрики.

Не коммитить закрытые корпуса или чувствительные запросы в Git. Для synthetic corpus допустимы fixtures в репозитории.

### 4.2 Типы запросов
- точные номера статей/пунктов;
- названия актов;
- юридические формулировки;
- semantic queries без точного совпадения;
- аббревиатуры/варианты написания;
- поиск на заданную дату;
- исторические редакции;
- похожие формулировки в разных актах;
- запросы без достаточного источника;
- конфликтующие/изменённые нормы;
- судебная практика, если корпус включён.

### 4.3 Метрики
Использовать предусмотренные RAG-документом метрики, включая Recall@K и MRR, если подходят. Дополнительно могут измеряться Precision@K, nDCG@K, citation correctness, version correctness, source coverage, abstention correctness, latency p50/p95 и error rate.

Не назначать универсальные пороги без baseline и тестового корпуса. Ошибка в версии/источнике может быть блокирующей даже при хорошем среднем Recall.

### 4.4 Exact и ANN
Тестировать отдельно:
- exact vector search;
- ANN search;
- hybrid search;
- retrieval с metadata/date filters.

ANN top-K может немного измениться после перестроения физического индекса. Это не автоматическое доказательство повреждения данных, но изменение релевантности должно быть оценено.

## 5. Legal correctness

Для правового корпуса обязательно:
- соответствие source → document → version → provision;
- правильная иерархия статьи/части/пункта;
- сохранение дат действия;
- отсутствие смешивания разных редакций;
- правильная ссылка на источник;
- отсутствие ссылок на несуществующие provisions;
- корректное поведение на дату запроса;
- отсутствие выдачи удалённой или неразрешённой версии.

Проверять не только текст фрагмента, но и идентичность редакции.

## 6. ACL и deletion tests

Для приватных данных дополнительно проверить:
- пользователь другой организации не получает результаты;
- отсутствие доступа блокирует vector, FTS, citations и API;
- отзыв доступа влияет на последующие retrieval;
- удалённые документы/chunks/embeddings не возвращаются;
- deletion journal применяется после restore;
- кэш не выдаёт старые результаты;
- export/import не восстанавливает удалённые данные.

Для публичного корпуса ACL может быть проще, но provenance и source licensing checks обязательны.

## 7. Строгая идентичность и similarity поиска

**Data identity:** одинаковые IDs, scope, checksums, embeddings и references, кроме явно учтённых deletion exclusions.

**Retrieval similarity:** сопоставимые top-K и метрики при одинаковой search config, правильные citations/versions и отсутствие регрессии по утверждённым порогам.

Не требовать идентичной latency на разных серверах. Измерять её отдельно.

## 8. Validation report

Пример:

```json
{
  "validationSchemaVersion": "1",
  "exportId": "export_...",
  "importId": "import_...",
  "sourceEnvironment": "development",
  "targetEnvironment": "staging",
  "checks": {
    "manifest": "passed",
    "objects": "passed",
    "databaseCounts": "passed",
    "foreignKeys": "passed",
    "contentChecksums": "passed",
    "embeddingDimensions": "passed",
    "embeddingChecksums": "passed",
    "searchIndexes": "passed",
    "deletionJournal": "passed",
    "retrievalRegression": "passed"
  },
  "metrics": {
    "recallAtK": null,
    "mrr": null,
    "citationCorrectness": null,
    "latencyP95Ms": null
  },
  "warnings": [],
  "blockingFailures": [],
  "result": "passed"
}
```

Не помещать в report полный текст документов или секреты. Query text может требовать отдельного контроля доступа.

## 9. PASS / FAIL

**PASS**, если manifest/package валидны, объекты восстановлены, counts/checksums совпадают или объяснены, links корректны, embeddings совместимы, индексы доступны, deletion journal применён, retrieval metrics проходят утверждённые thresholds, отсутствуют блокирующие licensing/security warnings.

**FAIL**, если отсутствует обязательный объект, checksum не совпадает без объяснения, chunk связан с неверной редакцией, embedding имеет неправильную размерность/модель, восстановлены удалённые данные, filters/ACL пропускают запрещённые данные, citation невалидна, retrieval regression превышает порог или неизвестно право на экспорт источника.

Warnings должны быть явно перечислены и приняты уполномоченным лицом.

## 10. Capacity и DR

Измерять размер DB dump, object snapshot, число chunks/vectors, время export/transfer/restore, время построения индексов, время regression suite, временный диск и нагрузку CPU/RAM/IO.

Не оценивать время только по числу документов. Успешный corpus import не доказывает выполнение RPO/RTO всего приложения по D-022 — для этого нужны отдельные restore drills.

## 11. OPEN-вопросы

- контрольный dataset и владелец expected results;
- пороги Recall@K/MRR и legal correctness;
- точные/semantic query наборы;
- допустимое ANN отклонение;
- место хранения baseline/reports;
- тестовые данные, допустимые для Git;
- проверка лицензированных источников;
- какие checks блокируют activation.

Не назначать SLO/quality thresholds без baseline и подтверждения.

# 28. Index Build Manifest and Reproducibility

**Статус: PROPOSED.** Метаданные для понимания происхождения chunks/embeddings и воспроизводимого переноса индекса.

**Связанные документы:** `13-file-storage-and-document-processing.md`, `17-rag-and-knowledge-retrieval.md`, `18-legal-research-and-external-sources.md`, `27-data-portability-and-index-transfer.md`.

## 1. Цель

Результат RAG зависит от source revision, parser, normalization, structural parser, chunking, embedding model и search configuration. Чтобы переносить готовый индекс и понимать, когда нужна переиндексация, система должна фиксировать provenance каждой сборки.

Предлагается концепция `IndexBuild` / `IndexManifest`. Это не утверждение Prisma-модели, API или миграции.

## 2. Независимые версии pipeline

Не сводить изменения к одной версии:

| Версия | Что описывает |
|---|---|
| Source revision | Конкретный исходник/редакцию |
| Extractor/parser | Извлечение текста |
| Normalization | Нормализацию текста |
| Structural parser | Распознавание структуры |
| Chunking | Правила и границы chunks |
| Embedding | Provider/model/revision/dimensions |
| Search config | FTS, distance, filters, ranking |
| Index build | Конкретную сборку корпуса |

Изменение reranker или query rewriting обычно не требует повторного парсинга. Смена embedding model обычно требует пересоздания vectors для затронутых chunks. Изменение chunking требует новых chunks и embeddings, но не обязательно повторного получения исходника.

## 3. Минимальный состав manifest

Пример иллюстративный; schema version и обязательность полей нужно утвердить перед реализацией.

```json
{
  "manifestType": "spectre-index-export",
  "manifestSchemaVersion": "1",
  "exportId": "export_...",
  "createdAt": "2026-01-01T00:00:00Z",
  "scope": {
    "corpusType": "public_legal_corpus",
    "sourceIds": ["source_..."],
    "documentCount": 0,
    "documentVersionCount": 0,
    "structuralNodeCount": 0,
    "chunkCount": 0,
    "embeddingCount": 0
  },
  "snapshot": {
    "snapshotId": "snapshot_...",
    "watermark": "..."
  },
  "pipeline": {
    "extractor": {"name": "parser-name", "version": "..."},
    "normalizationVersion": "...",
    "structuralParserVersion": "...",
    "chunking": {"strategy": "...", "version": "...", "configHash": "..."},
    "embedding": {
      "provider": "...",
      "model": "...",
      "modelRevision": null,
      "dimensions": 0,
      "preprocessingVersion": "...",
      "distanceMetric": "..."
    }
  },
  "database": {
    "postgresMajorVersion": "...",
    "pgvectorVersion": "...",
    "schemaMigrationRevision": "..."
  },
  "objects": {
    "objectCount": 0,
    "totalBytes": 0,
    "checksumAlgorithm": "sha256"
  },
  "validation": {"status": "passed", "reportRef": "..."}
}
```

Не использовать placeholders как реальные значения. Если provider не сообщает model revision, фиксировать `unknown`/`unavailable`, а не придумывать ревизию.

## 4. Что фиксировать

### Source и document version
- source ID и source reference;
- document ID и version ID;
- source snapshot/content hash;
- даты публикации, получения и действия, если подтверждены;
- provenance и разрешённые locator/reference.

### Structural node и chunk
- document/version IDs;
- node ID, node type, parent ID, sibling order;
- номер/обозначение статьи, части, пункта и т. п.;
- chunk ID и ordinal;
- точный текст chunk и checksum;
- ссылка на исходный node и locator/page range;
- chunking strategy/version;
- заголовки-предки, добавленные как контекст.

Не предполагать одинаковую структуру у всех актов. Если структура распознана эвристически или моделью, сохранять факт/качество распознавания; не выдавать догадку за подтверждённую структуру первоисточника.

### Embedding
- provider;
- model identifier и revision, если доступна;
- dimensions;
- preprocessing/normalization version;
- distance metric и vector index configuration;
- время генерации и pipeline version;
- количество успехов/ошибок;
- checksum payload, если выбран стабильный способ сериализации.

Сам vector переносится как сохранённое значение. Обычный импорт не вызывает embedding model повторно.

## 5. Checksums и IDs

Рекомендуется раздельно контролировать:
- source artifact bytes;
- extracted text;
- normalized text;
- chunk text;
- serialized embedding payload;
- object storage binary.

SHA-256 подходит как кандидат для проверки неизменности байтов, но не доказывает юридическую корректность или качество парсинга.

Content hash не должен быть единственным business ID: исправление пробела может поменять hash, не создавая новую юридическую сущность. Если используются deterministic IDs, зафиксировать namespace, алгоритм и версию алгоритма.

## 6. Когда нужна переиндексация

| Изменение | Extraction | Structure/chunks | Embeddings | Search indexes |
|---|---:|---:|---:|---:|
| Новый source artifact | Да | Да | Да | Да |
| Новая редакция | Да | Да | Да | Да |
| Исправление parser bug | Да | Возможно | Возможно | Да |
| Новая normalization | Да | Да | Да | Да |
| Новое chunking | Нет, если extraction валиден | Да | Да | Да |
| Новая embedding model | Нет | Нет | Да | Да |
| Изменение FTS config | Нет | Нет | Нет | FTS rebuild |
| Новый reranker | Нет | Нет | Нет | Не обязательно |
| Перестроение ANN index | Нет | Нет | Нет | Да, физический индекс |

Точная область повторной обработки зависит от pipeline dependencies. Не пересобирать весь корпус без определения affected scope.

## 7. Несовместимость embedding spaces

Не смешивать vectors несовместимых моделей/preprocessing в одном пространстве поиска.

При смене модели:
1. Создать новую версию embedding configuration.
2. Построить vectors для нужного корпуса.
3. Проверить coverage, ошибки и dimensions.
4. Запустить retrieval evaluation.
5. Переключить активную конфигурацию после проверки.
6. Старые vectors удалять по отдельной политике retention/deletion.

Перенос готовых vectors между серверами не требует повторной генерации, если данные и схема совместимы.

## 8. Три вида воспроизводимости

- **Transfer reproducibility:** импортированные данные совпадают с экспортированными.
- **Pipeline reproducibility:** повторный запуск pipeline с теми же версиями даёт эквивалентный результат; может быть ограничен недетерминированными OCR/ML-компонентами.
- **Retrieval reproducibility:** запросы дают сопоставимые результаты в заданных допусках.

Первое обязательно для переносимости. Второе и третье подтверждаются тестами.

## 9. Критерии готовности

- Каждый export имеет manifest schema version.
- Для chunk/embedding известны pipeline versions.
- Определимы документы/редакции в snapshot.
- Проверяются checksums.
- Совместимость schema/extensions проверяется при импорте.
- Embeddings не регенерируются без отдельной операции reindex.
- Несовместимые vectors не смешиваются.
- Parser/chunking/model changes отражаются в версии сборки.
- Сохраняется validation report.

## 10. OPEN-вопросы

- Формат manifest и inventory.
- Где хранить manifest и validation report.
- Нужна ли сущность `IndexBuild` в Prisma.
- Как связать существующие `DocumentExtraction`, `DocumentChunk`, `Embedding` и legal entities с build ID.
- Какие model metadata доступны у будущей embedding model.
- Как сериализовать vectors для checksum.
- Нужны ли несколько активных поколений индекса.

Не добавлять поля или таблицы в Prisma до сопоставления с реальной схемой и согласования.

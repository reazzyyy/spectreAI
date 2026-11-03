# Cursor Instructions — Data Portability Documentation Package

**Тип задачи:** documentation-only integration.  
**Результат:** добавить новые документы; существующие документы не переписывать и не дублировать.  
**Пути ниже — от корня репозитория.** Внутри `docs/` соседние файлы ссылаются друг на друга без префикса `docs/`.

## 1. Новые файлы

1. `docs/27-data-portability-and-index-transfer.md`
2. `docs/28-index-build-manifest-and-reproducibility.md`
3. `docs/29-corpus-export-import-runbook.md`
4. `docs/30-portability-integrity-and-search-validation.md`
5. `docs/CURSOR-INSTRUCTIONS-DATA-PORTABILITY.md`

## 2. Жёсткие ограничения

- Не переписывать и не копировать целиком существующие документы.
- Не менять `docs/decisions-log.md`.
- Не менять статусы D-001–D-023, O-001–O-010, H-001–H-005, FILE-* и RAG-*.
- Не добавлять CONFIRMED decisions.
- Не менять код, Prisma schema, migrations, API, Docker, CI/CD, infrastructure или runtime config.
- Не создавать сущности/таблицы/enum/API на основании предложений из этих документов.
- Не выбирать object storage, embedding model, parser, export format, approval workflow или activation mechanism.
- До закрытия O-002 не передавать реальные клиентские документы, D3-derived data или embeddings внешнему AI. Только SyntheticAIProvider и synthetic data (D-012).
- Не считать O-006 закрытым: право на получение, хранение, индексацию и экспорт правовых источников должно быть проверено.
- Соблюдать D-014 для production, staging, backups, logs, indexes, temporary exports и других копий.
- Соблюдать D-019/D-020 и deletion journal при restore.
- Не коммитить секреты и реальные клиентские данные.

## 3. Перед интеграцией

Сверить актуальные файлы в целевой ветке:
- `docs/DOCUMENTATION-GOVERNANCE.md`
- `docs/decisions-log.md`
- `docs/02-architecture.md`
- `docs/06-data-model.md`
- `docs/08-data-lifecycle-and-deletion.md`
- `docs/13-file-storage-and-document-processing.md`
- `docs/17-rag-and-knowledge-retrieval.md`
- `docs/18-legal-research-and-external-sources.md`
- `docs/23-deployment-and-infrastructure.md`
- `docs/security/data-classification.md`
- `docs/security/data-flow-and-data-inventory.md`
- `docs/security/business-continuity-and-disaster-recovery.md`
- `AGENTS.md`

Архив проекта, на основе которого подготовлен пакет, может отставать от текущей ветки. Текущая ветка является объектом интеграции.

## 4. Не дублировать уже существующее

Уже описаны:
- file upload, extraction, chunks, embeddings, lifecycle — `docs/13`;
- RAG, chunking, embeddings, retrieval, quality evaluation — `docs/17`;
- legal source registry, legal versions, ingestion и validity — `docs/18`;
- deployment, backup/restore, CI/CD — `docs/23`;
- deletion/retention — `docs/08`;
- data classification/data flows — `docs/security/`.

Новые документы связывают эти процессы в переносимый snapshot: scope, consistent snapshot, manifest, database + object export, transfer of saved embeddings, physical index restore/rebuild, deletion journal и post-import validation.

## 5. Не редактировать старые файлы автоматически

Если после сверки действительно нужны ссылки/дополнения, создать отдельный файл `docs/PORTABILITY-INTEGRATION-NOTES.md` с минимальными предложениями и точными местами. Не менять исходные документы.

Проверить необходимость следующих предложений:

### 5.1 `docs/DOCUMENTATION-GOVERNANCE.md`
Добавить строки в каталог канонических документов для:
- portability/index transfer → `docs/27-data-portability-and-index-transfer.md`;
- index manifest → `docs/28-index-build-manifest-and-reproducibility.md`;
- corpus export/import → `docs/29-corpus-export-import-runbook.md`;
- portability validation → `docs/30-portability-integrity-and-search-validation.md`.

### 5.2 `docs/23-deployment-and-infrastructure.md`
Предложить ссылку на runbook corpus export/import, подчеркнув, что это не замена application backup/DR.

### 5.3 `docs/17-rag-and-knowledge-retrieval.md`
Предложить ссылку на manifest/reproducibility для pipeline provenance и переноса сохранённых vectors.

### 5.4 `docs/18-legal-research-and-external-sources.md`
Предложить ссылки на portability/runbook из ingestion/versioning. Не менять O-006.

### 5.5 `docs/08-data-lifecycle-and-deletion.md`
Предложить ссылку на применение deletion journal перед активацией imported snapshot. Не менять D-019/D-020.

### 5.6 `docs/security/data-flow-and-data-inventory.md`
Предложить учесть export/import и temporary packages в data-flow inventory, когда механизм будет принят/реализован.

## 6. Проверки согласованности

Проверить, что новые документы:
- не противоречат D-014, D-018, D-019, D-020, D-022;
- не разрешают перенос D3 без отдельного основания;
- не разрешают external AI transfer до O-002;
- не объявляют legal sources экспортируемыми до O-006;
- не закрывают FILE-001/FILE-007;
- не выбирают embedding model;
- не выбирают параметры HNSW/IVFFlat;
- не обещают идентичность ANN top-K между версиями движка;
- не смешивают corpus export с application backup/DR;
- не предлагают пересчитывать embeddings при обычном импорте;
- учитывают original objects, manifest, checksums и deletion journal.

## 7. Отчёт Cursor

После работы показать:
1. Добавленные файлы и назначение.
2. Пересечения с существующими документами и как их избежали.
3. `docs/PORTABILITY-INTEGRATION-NOTES.md`, если он нужен.
4. Новые OPEN-вопросы, если появились; не менять статусы существующих.
5. Подтверждение, что код, schema, API, decisions и infrastructure не менялись.
6. `git diff --stat`, полный diff новых файлов и результат проверки markdown links.

## 8. Приёмка

- Добавлены только новые документы и, при необходимости, integration notes.
- Нет копирования существующих разделов.
- Все ссылки корректны.
- Новые документы помечены PROPOSED.
- OPEN/HYPOTHESIS не стали CONFIRMED.
- Код/schema/API/migrations/CI/CD/deployment не изменялись.
- Нет реальных клиентских данных и секретов в примерах.
- Нет утверждения, что права на legal source export подтверждены.

Любая реализация export/import, новые модели, permissions, API и автоматизация требуют отдельной технической задачи и необходимых решений владельца продукта.

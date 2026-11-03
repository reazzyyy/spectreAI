# 29. Corpus Export and Import Runbook

**Статус: PROPOSED.** Операционный сценарий переноса разрешённого корпуса. Конкретные команды и storage provider выбираются после проверки реализации.

**Связанные документы:** `23-deployment-and-infrastructure.md`, `27-data-portability-and-index-transfer.md`, `28-index-build-manifest-and-reproducibility.md`, `08-data-lifecycle-and-deletion.md`, `security/business-continuity-and-disaster-recovery.md`.

## 1. Граница процедуры

Это перенос подготовленного корпуса, а не backup/restore всего production приложения. Пользовательские D3-данные не входят в стандартную процедуру.

До операции проверить:
- право на получение, хранение, индексацию и экспорт каждого источника (O-006);
- классификацию включённых данных;
- местоположение source/target, временных файлов и копий (D-014);
- полномочия инициатора;
- PostgreSQL/pgvector compatibility;
- свободное место;
- актуальный deletion journal;
- возможность провести validation.

## 2. Режимы

- **Full snapshot:** полный согласованный scope на определённый момент; рекомендуемый первый режим.
- **Incremental delta:** изменения после известного base snapshot; не входит в первый обязательный объём.
- **Disaster recovery:** восстановление production после сбоя; регулируется BCDR/deployment документами и учитывает D-020 deletion journal.

## 3. Preflight checklist

- [ ] Указаны source и target environments.
- [ ] Зафиксированы corpus scope и snapshot boundary.
- [ ] Проверены права на источники (O-006).
- [ ] D3/D4 исключены, если нет отдельного разрешения.
- [ ] Проверена география всех копий (D-014).
- [ ] Проверены версии PostgreSQL, pgvector и schema.
- [ ] Достаточно места для dump, objects и restore.
- [ ] Зафиксирован deletion journal watermark.
- [ ] Определены оператор и audit/correlation ID.
- [ ] Target изолирован от действующего корпуса.

Если обязательная проверка не пройдена, операцию не начинать.

## 4. Export procedure

### 4.1 Создать export operation
Создать уникальный `exportId`; зафиксировать инициатора, scope, source environment, цель, основание, время, snapshot boundary и статус. Не записывать содержимое документов, vectors или секреты в audit.

### 4.2 Зафиксировать согласованный snapshot
Определить механизм consistency: snapshot transaction, ingestion watermark, контролируемая пауза публикации новых версий или эквивалент. Зафиксировать точный список source/document/version IDs. Простое последовательное копирование таблиц во время обновления корпуса не гарантирует согласованность.

### 4.3 Database export
Экспортировать corpus data: metadata, versions, structure, extracted content, chunks, vectors, provenance и нужные связи. Не включать `.env`, secrets, sessions, unrelated user content, временные AI jobs и логи без отдельного основания.

`pg_dump`/`pg_restore` — возможные инструменты, но конкретный формат и flags выбираются после проверки версий, расширений, размера и требований к snapshot consistency.

### 4.4 Object export
Для каждого объекта, на который ссылается БД, зафиксировать object key/version, размер и SHA-256; перенести его в target snapshot. Не считать одинаковые object keys в разных buckets доказательством идентичности.

Если extracted text хранится в object storage, он тоже должен попасть в inventory. Если он хранится в PostgreSQL, он должен быть в database snapshot. FILE-007 остаётся OPEN.

### 4.5 Manifest и package validation
Создать manifest по `28-index-build-manifest-and-reproducibility.md`. Проверить:
- manifest schema;
- object inventory;
- checksums;
- counts;
- snapshot boundary;
- отсутствие D4/секретов;
- отсутствие неразрешённого D3;
- права на экспорт;
- закрытое место хранения пакета.

При ошибке отметить export failed и не передавать пакет.

### 4.6 Transfer
Использовать только защищённый и разрешённый канал. Не использовать GitHub artifacts/releases, публичные buckets, личные облака или случайные файлообменники.

## 5. Import procedure

### 5.1 Проверить target
Проверить регион, PostgreSQL/pgvector, schema revision, свободное место, permissions, изоляцию target и отсутствие конфликтующего активного корпуса. Не импортировать поверх production без отдельного плана.

### 5.2 Проверить пакет
Проверить manifest, export ID, checksums, counts, source authorization, compatibility, pipeline versions и deletion watermark. Повреждённый/неизвестный пакет отклонить.

### 5.3 Восстановить objects
Загрузить в закрытое target storage, сохранить mapping keys и проверить size/checksum. Не активировать БД-записи, если обязательные объекты отсутствуют.

### 5.4 Восстановить PostgreSQL
Восстановить в пустую БД, изолированную схему или отдельный namespace. Проверить pgvector, grants, sequences, constraints, triggers, indexes, FTS configuration и schema revision.

Физические индексы могут быть построены заново. Это не означает повторную генерацию embeddings.

### 5.5 Применить deletion journal
До активации применить удаления после snapshot watermark. Если невозможно определить, какие записи удалены после snapshot, импорт блокируется. Удалённые данные не должны вернуться после import/restore (D-019/D-020).

### 5.6 Technical validation
Проверить counts, foreign keys, orphan references, checksums, chunk count, embedding count/dimensions, parent-child links, source/version metadata и search indexes.

### 5.7 Retrieval validation
Запустить контрольный набор запросов и сравнить с baseline по `30-portability-integrity-and-search-validation.md`.

### 5.8 Activate
Активировать только после прохождения integrity, deletion и retrieval checks, отсутствия блокирующих warnings и подтверждения уполномоченного оператора.

Механизм активации (active pointer, schema swap, feature flag и т. п.) не выбран. Не реализовывать его только по этому примеру.

## 6. Failure и rollback

До активации неуспешный импорт не должен затрагивать действующий корпус. Частичные данные изолировать или очистить контролируемо.

После активации при критической проблеме:
- вернуть предыдущий валидный corpus, если механизм это поддерживает;
- иначе отключить scope и восстановить по отдельной процедуре;
- сохранить audit trail;
- оценить влияние на юридические ответы и citations.

Rollback приложения и rollback данных — разные операции. Не удалять предыдущий corpus сразу после переключения.

## 7. Import report

Сохранять:
- exportId/importId;
- source/target;
- scope и snapshot ID;
- начало/окончание;
- counts и transferred bytes;
- checksum failures;
- restore warnings;
- rebuilt indexes;
- deletion watermark applied;
- retrieval metrics;
- pass/fail;
- operator/correlation ID.

Не включать в report полный текст документов и секреты.

## 8. Cleanup

После операции удалить временные plaintext dumps и staging files по утверждённой процедуре, проверить отсутствие копий в CI artifacts, очистить временные credentials и зафиксировать удаление пакета, если его хранение больше не требуется.

Срок хранения export packages OPEN; он не выводится автоматически из 35-дневного backup retention.

## 9. OPEN-вопросы

- Object storage provider и механизмы versioning/copy.
- Где запускается export coordinator.
- Snapshot mechanism при непрерывном ingestion.
- Формат PostgreSQL dump.
- Активация и rollback корпуса.
- Permissions/approval.
- Retention export packages.
- Incremental delta.
- Разные лицензии источников.
- Блокирующие validation thresholds.

Corpus export/import не заменяет полный backup/restore приложения и DR-процедуру.

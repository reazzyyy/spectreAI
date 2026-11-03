# Заметки по интеграции пакета переносимости корпуса

**Статус: PROPOSED.** Это не канон и не решение журнала. Файл фиксирует, куда при следующей правке документации поставить короткие ссылки. Исходные документы в этой интеграции не менялись. Статусы D-001–D-023, O-001–O-010, H-001–H-005, FILE-* и RAG-* не менялись.

**Дата сверки:** 2026-11-03.  
**Объект сверки:** текущая ветка spectreAI (`26-codebase-current-state.md`, `decisions-log.md`, канон `02-architecture.md`, `06-data-model.md`, `08-data-lifecycle-and-deletion.md`, `13-file-storage-and-document-processing.md`, `17-rag-and-knowledge-retrieval.md`, `18-legal-research-and-external-sources.md`, `23-deployment-and-infrastructure.md`, `security/`).  
**Пакет:** `27-data-portability-and-index-transfer.md`, `28-index-build-manifest-and-reproducibility.md`, `29-corpus-export-import-runbook.md`, `30-portability-integrity-and-search-validation.md`.

Инструкция агенту: `CURSOR-INSTRUCTIONS-DATA-PORTABILITY.md`. Пути в той инструкции — от корня репозитория.

## 1. Что пакет добавляет

Пакет описывает перенос уже собранного разрешённого корпуса между окружениями: согласованный snapshot, manifest, базу и объекты, сохранённые embeddings, журнал удалений и проверку retrieval.

Он не заменяет:

- загрузку, извлечение, chunks и lifecycle — `13-file-storage-and-document-processing.md`;
- RAG, chunking, embeddings и оценку качества — `17-rag-and-knowledge-retrieval.md`;
- каталог правовых источников и их ingestion — `18-legal-research-and-external-sources.md`;
- backup/restore приложения и DR — `23-deployment-and-infrastructure.md`, `security/business-continuity-and-disaster-recovery.md`;
- удаление и retention — `08-data-lifecycle-and-deletion.md`;
- классификацию и инвентарь потоков — `security/data-classification.md`, `security/data-flow-and-data-inventory.md`.

## 2. Сверка с журналом

Противоречий с D-014, D-018, D-019, D-020, D-022, D-012 / O-002 не найдено.

Пакет оставляет открытыми O-006, O-005, FILE-001, FILE-007 и выбор embedding-модели (RAG-002). Параметры HNSW/IVFFlat не выбираются. Обычный import не пересчитывает embeddings. ANN top-K между версиями движка не обещается идентичным. Corpus export не объявлен выполнением RPO/RTO приложения.

В коде на дату снимка `26-codebase-current-state.md` нет документов, chunks, embeddings, object storage, FTS/pgvector-индекса приложения, журнала удалений и export/import. Локальный образ `pgvector/pgvector:pg16` не закрывает открытый вопрос о версиях PostgreSQL и pgvector для production.

## 3. Три разных «экспорта»

Их нельзя склеивать в одно разрешение.

| Контур | Где уже описан | Что это |
|---|---|---|
| Выгрузка пользователя (черновик, документ) | **O-009**, ворота C в `../tasks/roadmap.md`, `07-access-control-matrix.md` | Право участника скачать продукт. Пакет 27–30 это право не выдаёт и O-009 не закрывает. |
| Backup/restore приложения | `23-deployment-and-infrastructure.md` §11–§12, `08-data-lifecycle-and-deletion.md` §12, BCDR | Вся рабочая система, 35 дней (**D-020**), цели **D-022**. |
| Перенос корпуса оператором | `27`–`30` | Подготовленный корпус и сохранённый индекс. Срок пакета не выводится из 35 дней. |

«Импорт» в `18-legal-research-and-external-sources.md` §6 и §19 (этап 2) — приём источника в каталог. «Импорт» в `29-corpus-export-import-runbook.md` — восстановление уже собранного пакета в другом окружении.

## 4. Предлагаемые ссылки

Ниже — текст, который можно вставить позже. В этой интеграции файлы не редактировались.

### 4.1 `DOCUMENTATION-GOVERNANCE.md`

В таблицу §2, после строки AS-IS (`26-codebase-current-state.md`):

| Область | Канонический источник | Примечание |
|---|---|---|
| Перенос корпуса и индекса | `27-data-portability-and-index-transfer.md` | **PROPOSED.** Не заменяет backup/DR и не закрывает O-006. |
| Manifest сборки индекса | `28-index-build-manifest-and-reproducibility.md` | **PROPOSED.** Не модель Prisma и не выбор embedding-модели. |
| Runbook export/import корпуса | `29-corpus-export-import-runbook.md` | **PROPOSED.** Не замена `23` и не пользовательский экспорт O-009. |
| Проверка переноса и retrieval | `30-portability-integrity-and-search-validation.md` | **PROPOSED.** Пороги качества не назначает (RAG-010). |

Пока строки не в каталоге, приоритет источников из §1 на пакет не распространяется: это дополнение со статусом PROPOSED.

### 4.2 `23-deployment-and-infrastructure.md`

Место: конец §11 «Резервное копирование» (после §11.2) или абзац в §1 «Цель документа».

Предлагаемая фраза:

> Перенос подготовленного правового корпуса между окружениями описан отдельно в `29-corpus-export-import-runbook.md` (**PROPOSED**). Эта процедура не заменяет резервное копирование приложения, не использует срок 35 дней как срок хранения export package и не подтверждает RPO/RTO (**D-022**).

Не менять D-014, D-020, D-022 и INFRA-010/INFRA-011.

### 4.3 `17-rag-and-knowledge-retrieval.md`

Место: §9.2 «Изменение модели» и строка RAG-009 в §22.

Предлагаемая фраза после шагов смены модели:

> Происхождение сборки и перенос уже посчитанных vectors между окружениями — `28-index-build-manifest-and-reproducibility.md` и `27-data-portability-and-index-transfer.md` (**PROPOSED**). Обычный перенос не вызывает embedding-модель повторно. Смена модели остаётся отдельной операцией reindex. RAG-009 не становится CONFIRMED.

§19 и §20 по метрикам и ACL не дублировать: `30-portability-integrity-and-search-validation.md` на них ссылается и не назначает пороги.

### 4.4 `18-legal-research-and-external-sources.md`

Место: §6 «Получение и синхронизация данных» и §19 этап 2. Не в разделе, где «импорт» означает первичную загрузку источника.

Предлагаемая фраза:

> После того как версия источника уже сохранена и проиндексирована, перенос этого корпуса в другое окружение описывают `27-data-portability-and-index-transfer.md` и `29-corpus-export-import-runbook.md` (**PROPOSED**). Право на получение, хранение, индексацию и экспорт источника остаётся **O-006**.

LEGAL-001–LEGAL-015 не закрывать.

### 4.5 `08-data-lifecycle-and-deletion.md`

Место: §12.1 «Поведение после восстановления».

Предлагаемая фраза:

> То же правило действует до активации импортированного corpus snapshot: актуальный журнал удалений применяется к пакету, и удалённые данные не возвращаются в доступное состояние (`27-data-portability-and-index-transfer.md` §10, `29-corpus-export-import-runbook.md` §5.5). Срок хранения временного export package этим разделом не задаётся и не равен 35 дням резервных копий.

D-019 и D-020 не переформулировать.

### 4.6 `security/data-flow-and-data-inventory.md`

Место: список «Обязательные потоки для инвентаризации».

Когда механизм будет принят и появится реализация, добавить поток: закрытое хранилище export package → защищённый канал → целевое окружение (БД и объекты), с регионом копий (**D-014**), без D4 и без D3 по умолчанию. До реализации поток не считать существующим и не помечать verified.

### 4.7 `../tasks/roadmap.md`

Не канон. При следующей правке плана можно отметить, что операторский перенос корпуса стоит после появления корпуса и индекса (фазы 4–6, ворота B и F / **O-006**) и не является воротами C (**O-009**). В этой интеграции roadmap не менялся.

## 5. Вопросы, которые остаются OPEN внутри пакета

В журнал они не добавлялись.

- Формат export package и manifest; где хранить manifest и validation report.
- Нужна ли incremental delta в первой версии и как фиксировать snapshot при непрерывном ingestion.
- Кто запускает и одобряет corpus export/import. Это не O-009.
- Срок хранения временных export packages. Это не D-020 и не O-005.
- Механизм активации и rollback корпуса.
- Несколько поколений индекса одновременно.
- Версии PostgreSQL и pgvector для production.
- Нужна ли сущность `IndexBuild` в Prisma и как связать её с будущими `DocumentExtraction`, `DocumentChunk`, `Embedding` и сущностями `18`.
- Сериализация vectors для checksum.
- Пороги Recall@K, MRR, legal correctness и допустимое отклонение ANN. Не назначать без baseline (RAG-010).
- Какие проверки блокируют активацию.

## 6. Что в этой интеграции не делалось

Код, Prisma schema, миграции, API, Docker, CI/CD, runtime config, `decisions-log.md` и перечисленные в §4 канонические файлы не изменялись. Реализация export/import требует отдельной технической задачи и решения владельца продукта.

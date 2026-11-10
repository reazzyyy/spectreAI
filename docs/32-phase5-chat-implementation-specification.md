# 32. Phase 5 — Chat Implementation Specification

**Статус:** PROPOSED implementation specification. Не является новым CONFIRMED-решением и не изменяет `docs/decisions-log.md`.

**Дата аудита исходников:** 2026-11-10.

**Назначение:** дать Cursor исполнимую техническую спецификацию Phase 5, не дублируя продуктовые правила из документов 06, 07, 11, 12, 15, 16, 19, 20 и `workspace-phase2/*`.

## 1. Область и исходное состояние

Phase 5 создаёт первый вертикальный сценарий: пользователь открывает Workspace, создаёт или открывает Conversation, отправляет сообщение, получает сохранённый ответ через AI Gateway и после перезагрузки восстанавливает историю.

AS-IS на 2026-11-10:

- `Workspace`, `WorkspaceMember`, `Document`, `AIJob`, `DocumentExtraction` существуют в Prisma.
- `AiGateway` и `SyntheticAIProvider` существуют; `/api/v1/ai/generate` — синхронный synthetic endpoint, не Chat API.
- BullMQ зарегистрирован; текущий worker обрабатывает extraction.
- Conversation, Message, AI Generation, Context Snapshot, chat API, chat RLS и chat UI отсутствуют.
- Figma-прототип не является подключённым frontend и не должен копироваться в приложение как готовая реализация.

## 2. Нормативные ограничения

Cursor обязан сохранить:

1. `D-008`: Next.js + NestJS + PostgreSQL/Prisma + Redis/BullMQ.
2. `D-011`: AIJob statuses строго `queued`, `running`, `succeeded`, `failed`, `cancelled`, `timed_out`.
3. `D-012` и `O-002`: до отдельного закрытия O-002 — только SyntheticAIProvider и синтетические данные; реальные клиентские документы нельзя отправлять внешним AI/embedding-провайдерам.
4. `W-007`: PRIVATE и WORKSPACE chats внутри Workspace.
5. `W-020`: RLS обязателен для новых tenant-owned таблиц; NestJS authorization остаётся обязательным вторым уровнем.
6. `W-006`: Workspace roles OWNER, EDITOR, VIEWER.
7. `W-008`: Org Admin не получает content access только из-за административной роли.
8. `D-026`: cursor pagination для растущих списков.
9. `D-027`: Idempotency-Key для операций, создающих AIJob.
10. `docs/15`: PostgreSQL — источник истины для AIJob; BullMQ — доставка; задача/Outbox/публикация/worker должны быть безопасны при повторах.

Не изменять D/O/H статусы и не закрывать открытые продуктовые решения самостоятельно.

## 3. Скоуп первой поставки

### 3.1 Обязательный вертикальный сценарий

- создать Conversation в существующем Workspace;
- выбрать `PRIVATE` или `WORKSPACE`;
- получить список доступных пользователю Conversation;
- открыть Conversation и загрузить историю с cursor pagination;
- отправить User Message;
- создать AI Generation и AIJob идемпотентно;
- выполнить synthetic generation через worker;
- сохранить Assistant Message;
- получить статус/результат;
- восстановить Conversation после reload;
- корректно обработать отказ, повтор запроса, отмену queued/running job и отзыв доступа.

### 3.2 Не включать в первую поставку без отдельного решения

- реальный OpenAI API;
- передачу реальных документов внешнему провайдеру;
- полноценный streaming, если polling закрывает первый вертикальный сценарий;
- редактирование уже отправленного сообщения с пересчётом последующих turn;
- regeneration UX с ветвлением истории;
- поиск по всей организации без явного ACL scope;
- Admin Grant;
- экспорт переписки.

Figma может показывать эти состояния, но экран не делает их backend-контрактом.

## 4. Открытые UX-решения, которые нельзя выдумывать

В Figma flow register для повторной генерации, редактирования сообщения и отмены есть незакрытые детали (в частности, DEC-05: судьба старого ответа, последующих сообщений, partial output и гонок отмены/завершения). До отдельного подтверждения:

- не перезаписывать старый Assistant Message;
- не удалять историю молча;
- не реализовывать destructive edit;
- можно заложить `generationNo` / `supersedesGenerationId`, но не включать UI-поведение, требующее продуктового решения;
- cancellation в первой версии должна гарантировать запрет публикации результата после успешной отмены, но не обещать отзыв уже переданных данных.

## 5. Предлагаемая модель данных

Это логическая спецификация. Перед миграцией Cursor должен проверить актуальную Prisma schema и существующие индексы, затем добавить только недостающие поля/таблицы.

### 5.1 Conversation

| Поле | Назначение |
|---|---|
| `id` | UUID |
| `organizationId` | Tenant boundary |
| `workspaceId` | Обязательная связь с Workspace |
| `ownerUserId` | Владелец PRIVATE-чата; для WORKSPACE фиксирует создателя/владельца записи |
| `createdByUserId` | Actor, создавший Conversation |
| `visibility` | `PRIVATE` или `WORKSPACE` |
| `title` | Пользовательское название; первоначально может генерироваться из первого сообщения только по отдельному UX правилу |
| `status` | Минимум ACTIVE/ARCHIVED; не смешивать с AIJob status |
| `lastMessageAt` | Сортировка списка |
| `createdAt`, `updatedAt` | Временные метки |

Обязательные ограничения: composite FK/unique с `organizationId`; индекс `(organizationId, workspaceId, lastMessageAt DESC, id DESC)`; индекс owner для PRIVATE списка.

### 5.2 Message

| Поле | Назначение |
|---|---|
| `id` | UUID |
| `organizationId` | Tenant boundary |
| `conversationId` | Родительский Conversation |
| `role` | `user` или `assistant`; системные инструкции не сохранять как обычное пользовательское сообщение |
| `content` | Текст сообщения |
| `createdByUserId` | Для user message — автор; для assistant — system/service actor или nullable по принятой схеме |
| `generationId` | Nullable; ссылка на AI Generation для assistant message |
| `clientMessageId` | Идемпотентность отправки с клиента в рамках Conversation |
| `createdAt` | Стабильный порядок |

Сообщения по умолчанию append-only. Исправление/редактирование не должно молча менять исторический текст, на котором основан предыдущий ответ. Для MVP можно не реализовывать edit; будущая модель revision/branch требует решения DEC-05.

### 5.3 AiGeneration

Самостоятельная сущность для одного запуска генерации. Не хранить единственный ответ в Conversation или только в AIJob.

Рекомендуемые поля:

- `id`, `organizationId`, `conversationId`;
- `userMessageId`;
- `assistantMessageId` nullable до успешного сохранения;
- `generationNumber`;
- `status` как бизнес-статус генерации (не подменяет AIJob enum);
- `aiJobId` unique nullable;
- `providerId`, `modelId`, `promptVersion`;
- `contextSnapshotId` nullable;
- `inputHash`;
- `startedAt`, `completedAt`, `createdAt`;
- `supersedesGenerationId` nullable — только для будущего regeneration, не означает автоматического удаления старого ответа.

Не копировать в поля/логи полный конфиденциальный prompt или текст документа без явной политики хранения.

### 5.4 ContextSnapshot и ContextSnapshotItem

Использовать концепцию из `docs/19` и `docs/28`, не создавать вторую параллельную систему.

Snapshot фиксирует воспроизводимость конкретной генерации: prompt version, retrieval/index generation, IDs источников и версий, checksums, параметры отбора, token counts, model/provider metadata. По умолчанию хранить provenance и ссылки, а не дублировать полный текст всех документов.

`ContextSnapshotItem` хранит упорядоченные ссылки на Message/DocumentVersion/DocumentChunk/другие разрешённые evidence items, их роль в контексте и source locator.

### 5.5 MessageSource

Серверная связь ответа с фактически переданными источниками:

- `messageId`;
- `contextSnapshotItemId` или `chunkId` + `documentVersionId`;
- `citationKey` (например, `S1` внутри конкретной генерации);
- `rank`, `sourceType`, `pageStart/pageEnd`, `quoteLocator`;
- `createdAt`.

Не сохранять как проверенную ссылку произвольный `documentId` или citation ID, придуманный моделью. Сервер формирует разрешённый список источников и валидирует все ссылки ответа.

## 6. Доступ и RLS

### 6.1 Conversation visibility

- `PRIVATE`: доступ только `ownerUserId` при действующем доступе к Workspace и Organization.
- `WORKSPACE`: чтение active Workspace members; запись OWNER/EDITOR; VIEWER — read-only.
- PERSONAL Workspace не становится общим из-за значения visibility; фактический доступ остаётся у владельца PERSONAL Workspace.
- Org Admin не получает доступ к PRIVATE/WORKSPACE содержимому только по роли в Organization.
- Conversation ID, Message ID, Generation ID и AIJob ID не являются доказательством доступа.

### 6.2 Проверки

Каждый read/write endpoint проверяет:
1. actor/session и active organization membership;
2. WorkspaceAccess;
3. Conversation visibility;
4. роль участника для операции;
5. актуальность прав повторно при чтении результата job/generation.

### 6.3 RLS

Для `conversations`, `messages`, `ai_generations`, `context_snapshots`, `context_snapshot_items`, `message_sources`:

- `ENABLE ROW LEVEL SECURITY` и `FORCE ROW LEVEL SECURITY`;
- `organization_id` сравнивается с `app.current_organization_id`;
- `app.current_user_id` участвует в PRIVATE/WORKSPACE ACL;
- policy учитывает owner PERSONAL Workspace / active TEAM membership;
- policy для Message/Generation/Snapshot проверяет доступ через родительский Conversation;
- добавить migration-role/runtime-role integration tests;
- не полагаться на Prisma schema для генерации RLS policy — policy оформлять versioned SQL migration.

Если сложная policy ухудшает читаемость, допустимы безопасные SQL views/functions, но они не заменяют NestJS authorization и должны быть протестированы на runtime role.

## 7. API-контракты (предлагаемые)

Согласовать с `docs/11-api-conventions.md` и существующим `/api/v1`.

| Метод | Endpoint | Назначение |
|---|---|---|
| `POST` | `/workspaces/:workspaceId/conversations` | Создать Conversation |
| `GET` | `/workspaces/:workspaceId/conversations` | Список, cursor pagination, фильтр visibility |
| `GET` | `/conversations/:conversationId` | Метаданные Conversation |
| `PATCH` | `/conversations/:conversationId` | Переименование/архивирование в пределах разрешений |
| `GET` | `/conversations/:conversationId/messages` | История с cursor pagination |
| `POST` | `/conversations/:conversationId/messages` | Создать user message + generation + AIJob |
| `GET` | `/ai-generations/:generationId` | Состояние генерации |
| `POST` | `/ai-generations/:generationId/cancel` | Запрос отмены |

`POST message` принимает `Idempotency-Key` и/или `clientMessageId`; повтор с тем же ключом и тем же payload возвращает ту же операцию, с другим payload — конфликт. Не создавать duplicate user message, generation или AIJob.

Не раскрывать внутренние provider errors; использовать единый error envelope из `docs/11`.

## 8. Orchestration

### 8.1 Создание задачи

В одной PostgreSQL transaction:

1. проверить actor и Conversation ACL;
2. проверить Idempotency-Key;
3. создать User Message;
4. создать AiGeneration `queued`;
5. создать AIJob с `type=chat.generate`, `workspaceId`, creator и связью на generation/conversation (добавить nullable FK/target relation без нарушения текущих extract jobs);
6. записать Outbox event;
7. commit.

Outbox publisher доставляет `jobId` в BullMQ. Не класть в queue payload полный текст документов или секреты.

### 8.2 Worker

1. Получить jobId.
2. В транзакции прочитать AIJob и проверить допустимый статус/lease.
3. Повторно проверить Conversation ACL, Workspace membership, документы и выбранный scope.
4. Собрать контекст только из разрешённых источников.
5. До O-002 использовать только synthetic payload; не отправлять реальные документы во внешний provider.
6. Вызвать `AiGateway`.
7. Проверить cancellation/status перед публикацией результата.
8. Сохранить assistant message, generation result, context snapshot и sources транзакционно.
9. Перевести AIJob в `succeeded`; ошибки классифицировать и использовать только ограниченные retries по `docs/15`.

### 8.3 Cancellation

- queued job: может быть отменён до начала;
- running job: записать cancel request и передать cooperative abort signal worker/provider;
- если provider не поддерживает прерывание, остановить дальнейшую обработку и запретить публикацию результата после cancellation commit;
- гонка completion/cancel решается условным update по текущему статусу/версия строки;
- `cancelled` — только после подтверждения, что job не опубликует результат; иначе оставить фактический статус и отобразить UI состояние «запрос на остановку».

Partial output не сохранять как полноценный ответ без отдельного продуктового решения.

## 9. AI Gateway

Текущий `AiGateway` предоставляет только `generateText`; не обходить его прямым вызовом SDK из ChatService.

Предлагается постепенно ввести контракт с явными capability:

- `generateText(request)`;
- cancellation/AbortSignal;
- usage metadata;
- structured output capability;
- provider/model metadata.

Не реализовывать фиктивный streaming, если Synthetic provider его не поддерживает. Synthetic response должен быть явно маркирован в API и UI. Тестовый deterministic provider — только для тестов контрактов, не для заявления о качестве юридических ответов.

Embedding — отдельный контракт `EmbeddingProvider` в Phase 6; не предполагать, что LLM provider автоматически является embedding provider.

## 10. Frontend / Figma integration

Реализовать в текущем Next.js App Router + FSD, не переносить Figma Vite prototype целиком.

Рекомендуемые срезы:

- `entities/conversation`: types, API, query keys, list/detail queries;
- `entities/message`: types, API, cursor history;
- `entities/ai-generation`: status/result/cancel API;
- `features/create-conversation`;
- `features/send-message`;
- `features/cancel-generation`;
- `widgets/conversation-list`;
- `widgets/chat-workspace`;
- `widgets/message-list` / `message-composer` — разместить по текущим FSD правилам.

Переиспользовать design tokens и UI primitives текущего приложения. Сверять визуально с Figma, но не копировать её mock state/seed data в production data layer.

Состояния UI не равны enum AIJob: `idle`, `submitting`, `queued`, `running`, `completed`, `failed`, `cancel-requested`, `cancelled` — отображаются из server state и локального request state.

## 11. Тестирование и критерии приёмки

### Functional
- PRIVATE Conversation виден только owner;
- WORKSPACE Conversation виден active members;
- VIEWER читает, но не отправляет;
- OWNER/EDITOR отправляет;
- история восстанавливается после reload;
- cursor pagination не дублирует/не пропускает сообщения при одинаковых timestamps;
- повтор idempotency key не создаёт duplicate;
- generation связана с правильным user message и assistant message.

### Security
- чужая Organization → одинаковый 404/403 policy без enumeration;
- другой Workspace → недоступен;
- Org Admin без grant не читает private/team chat;
- отзыв membership блокирует новые запросы и чтение результата;
- RLS runtime-role tests на всех новых таблицах;
- raw prompt/document text отсутствует в обычных logs и queue payload.

### Reliability
- Outbox publish retry;
- duplicate BullMQ delivery;
- worker crash/restart;
- AIJob terminal status не исполняется повторно;
- cancel queued/running и cancel-vs-complete race;
- отказ Synthetic provider;
- transaction rollback не оставляет orphan generation/message.

### Acceptance
Phase 5 готова только когда end-to-end test проходит: login → Workspace → create PRIVATE/WORKSPACE chat → send → queued/running → synthetic answer → reload → same history; все ACL и idempotency tests зелёные.

## 12. Зависимости и блокеры

- Не блокируется O-001/O-002, если весь вертикальный сценарий остаётся synthetic и не использует реальные документы.
- Полноценный document-context Chat зависит от доступного extraction и далее от Phase 6 indexing; Phase 5 может начинаться с conversation-only synthetic context.
- Regeneration/edit UX зависит от закрытия соответствующих DEC-05 вопросов в Figma flow register.
- Streaming можно отложить до стабилизации AIJob lifecycle.


# НейроЮрист Спектр — Cursor: исправление критических дефектов P0

**Дата:** 17.11.2026  
**Статус:** PROPOSED implementation package; не меняет статус решений в `docs/decisions-log.md`.  
**Как читать сейчас:** это снимок инструкции на архив примерно 13.11.2026, не текущий AS-IS. P0-01…P0-06 после этого снимка влиты отдельными PR (#52–#57). Документ не закрывает O-002, FILE-009, Gate B и S5.  
**Формат:** самостоятельный новый документ. Существующие файлы проекта при подготовке этого документа не менялись.

> **Задача для Cursor:** исправить надёжность уже написанного MVP до начала Phase 6/RAG. Работать короткими PR, каждый с воспроизведённым дефектом, тестом и проверкой. Не включать внешний AI, OCR, BM25, embeddings, vector search и не расширять функциональность UI.

## 0. Инструкция, которую можно вставить в Cursor

> Открой текущую ветку SpectreAI. Прочитай корневой AGENTS.md, docs/decisions-log.md, docs/DOCUMENTATION-GOVERNANCE.md, .cursor/skills/using-agent-skills/SKILL.md, docs/15-ai-jobs-and-background-processing.md, docs/32-phase5-chat-implementation-specification.md, docs/26-codebase-current-state.md и этот документ. Сверь выводы аудита с текущим кодом — архив, использованный для аудита, отражал состояние примерно 13.11.2026. Составь краткий план первого PR **P0-01**, перечисли затрагиваемые файлы и тесты. Реализуй только P0-01, продемонстрируй тест до/после и результат команды сборки. Следующий PR начинай только после оценки результата предыдущего. Не меняй решения D/W/O и не редактируй всю документацию. При конфликте с текущей веткой сначала изложи конкретное расхождение и варианты решения.

### Правила

1. Иерархия требований: `decisions-log` → канонические docs → PROPOSED docs → этот пакет. Не переоткрывать D-011 (статусы AIJob), D-012 (Synthetic), D-027 (идемпотентность), D-030 (caps), D-031 (скан без OCR — failed), W-020 (RLS).
2. В кодовой части менять только точечные модули, необходимые для выбранного PR, и добавлять unit/integration tests; не делать масштабный рефакторинг или массовый docs-sync.
3. Сохранять существующие публичные API/ответы и смысл SyntheticAIProvider. Исходные клиентские тексты нельзя отправлять во внешний AI до O-002.
4. Нельзя объявлять проблему исправленной только по mock/unit-тесту, когда ошибка связана с Redis/PostgreSQL concurrency.
5. Устаревший `docs/34` описывает состояние до появления Chat API/Outbox. Не реализовывать заново Conversation, AiGeneration, Message, ContextSnapshot.
6. Если нужен рискованный migration/production credential rollout, описать его отдельно и остановить затронутый PR до подтверждения.

### PR-порядок

| PR | Тема | Блокирует | Главный тест |
|---|---|---|---|
| 1 | P0-01: корректная маршрутизация BullMQ | Все фоновые задачи | Mixed queue concurrency |
| 2 | P0-02: extraction retries, outbox и recovery | Надёжный document processing | Crash/Redis outage |
| 3 | P0-03: окно истории AI до target message | Корректный контекст чата | 100 messages + delayed job |
| 4 | P0-04: atomic generation/cancel/outbox | Недублируемые ответы | Race tests |
| 5 | P0-05: fail-closed runtime DB credentials | Надёжность RLS | Startup/privilege test |
| 6 (отдельный gate) | P0-06: data classification vs synthetic mode | Будущий реальный AI | No external D3 transfer |

---

## P0-01. Исправить два специализированных Worker в одной очереди

**Подтверждённый дефект кода:**

- `apps/api/src/queue/ai-jobs.queue.ts` задаёт общую очередь `ai-jobs`.
- `apps/api/src/worker/extract-worker.ts` слушает эту очередь, но при чужом `aiJob.type` просто `return`.
- `apps/api/src/worker/chat-worker.ts` слушает ту же очередь, но при чужом `job.name/type` тоже `return`.
- BullMQ резервирует job любому consumer очереди; простой `return` означает successful completion. Так один worker может забрать и потерять задание другого типа.

**Предлагаемый минимальный фикс — один dispatcher при сохранении одной очереди:**

1. Создать общий `worker:ai` entrypoint; в нём распределять по проверенному `job.name`: `document.extract` → extract processor; `chat.generate` → chat processor; unknown type → безопасный fail, не silent success.
2. Извлечь inline extract-обработку в отдельный processor и повторно использовать существующий `ChatJobProcessor`. Минимизировать изменения бизнес-логики в этом PR.
3. Убрать возможность запуска несовместимых специализированных consumers на одной очереди. Старые `worker:extract`/`worker:chat` либо становятся безопасными wrappers общего dispatcher, либо явно заменяются с обновлением скриптов запуска. Нельзя оставить два старых entrypoint как есть.
4. Сверять тип из БД (`AiJob.type`) с именем BullMQ job и `jobId` из payload. Не доверять payload organization/workspace/user IDs; для tenant operations используется server-side source of truth.
5. `AIJob` остаётся единственным PG источником состояния; BullMQ — транспорт. В Redis payload нет текста файлов, чатов и prompts.
6. Не добавлять новую очередь, если это не требуется нагрузкой: `docs/15` допускает разделение очередей в будущем. Если команда всё же выбирает две очереди — сначала аргументированное сравнение, **не смешивать** два решения в одном PR.

**Тесты (реальный Redis):**

- `QUEUE-001`: одновременно запущены два processor/consumer; 20+ extract и 20+ chat jobs; каждый завершается корректным бизнес-результатом, нет `completed` в Redis при `queued` в PG.
- `QUEUE-002`: job неизвестного типа → явно rejected/failed и error code.
- `QUEUE-003`: payload job type ≠ `AiJob.type` → нет выполнения чужой бизнес-операции.
- `QUEUE-004`: повторно доставлен terminal job → no-op, не второй результат.
- `QUEUE-005` (сквозной тест после **P0-02**): остановка/перезапуск Redis не приводит к потере durable-записанного задания. Не считать этот тест обязательным для отдельного PR-1, пока ещё не реализован extraction outbox/recovery.

**DoD:** безопасность смешанной очереди проверена под конкуренцией; старые опасные команды запуска устранены; `pnpm --filter @spectre/api build` и tests зелёные.

---

## P0-02. Extraction: настоящие retries и восстановление публикации

**Подтверждённый дефект кода:** `apps/api/src/worker/extract-worker.ts` (район строк 71–90) превращает любое rejected исключение в `timed_out`. При временной ошибке PG job может снова стать `queued`, но BullMQ processor завершится успешно и не поставит повтор. `apps/api/src/documents/ai-jobs.service.ts` публикует best-effort, а durable republisher для `document.extract` отсутствует.

### Требуемая state machine

| Событие | AIJob по D-011 | Следующее действие |
|---|---|---|
| Create + durable Outbox event | `queued` | publish idempotently по `jobId` |
| Worker claim | `running` | increment attempt exactly once |
| Success | `succeeded` | atomic extraction + document `ready` |
| Permanent parser rejection | `failed` | document `processing_failed`, без retry |
| Transient error, attempts remain | `queued` | **реально запланировать** retry/backoff |
| Attempts exhausted | `failed` | terminal, не реанимировать случайно |
| Доказанный реальный timeout | `timed_out` | terminal + resource limit |
| Duplicate terminal delivery | без изменений | no-op |

**Разделять ошибки:**

- Permanent: `NO_TEXT_LAYER` (D-031), `EMPTY_TEXT`, `UNSUPPORTED_MIME`, `TOO_MANY_PAGES`, `TEXT_TOO_LARGE` и валидированные corrupt/password files.
- Transient: временная недоступность object storage/DB/Redis, иной явно классифицированный инфраструктурный сбой.
- Parser exception ≠ автоматический timeout. Неизвестная ошибка получает собственный безопасный код и ограниченную retry-policy.
- `Promise.race` не останавливает CPU-heavy parsing. Для реального hard-timeout нужен изолированный прерываемый boundary (thread/subprocess); если это отдельный срез, обозначить оставшийся soft-timeout риск и **не объявлять hard-stop готовым**.

**Implementation direction:**

1. Сначала P0-01, затем изменения retry; иначе можно ошибочно диагностировать потерянный тип задания как parser failure.
2. Использовать **одну** модель retry ownership: BullMQ attempts/backoff + PG transitions или эквивалентную доказуемо идемпотентную модель. Не просто менять `AIJob.status` обратно на `queued`.
3. Переиспользовать существующий `OutboxEvent` для `document.extract`. Для новой операции после надёжного сохранения source blob атомарно создать/обновить нужные PG records и outbox event; публиковать jobId-only; републикация должна быть recoverable после Redis outage.
4. При ошибке между blob, PG и Redis иметь проверяемую компенсацию через текущий two-phase upload/sweeper; не удалять без проверки пользовательские файлы.
5. Idempotent claim: одновременно два запуска не создают два успешных `DocumentExtraction` и не превышают `maxAttempts=3` (D-030). Terminal job автоматически не возвращается в running.
6. Не вводить новые D-011 statuses `retry_wait`/`completed`. Backoff хранится в metadata.

**Тесты:**

- `EX-001`: transient fail один раз → автоматический retry → success; attemptCount точный, один extraction.
- `EX-002`: scanned PDF без text layer → permanent failed (D-031), без бессмысленных повторов.
- `EX-003`: parser threw → не `timed_out`.
- `EX-004`: real deadline → timed_out, невозможен последующий «запоздалый» success commit.
- `EX-005`: Redis down при enqueue → PG/outbox durable, восстановление Redis запускает job.
- `EX-006`: crash между queue add и publishedAt → дубликат доставляется, но результат один.
- `EX-007`: два worker claims/terminal redelivery → no double commit.
- `EX-008`: exhausted attempts → окончательный failed, не вечный queued.

**DoD:** ни один неуспешный job не зависает в `queued` без scheduled/recovery path; timeout и parser error не смешиваются; постоянные ошибки не тратят три попытки.

---

## P0-03. Правильный контекст разговора для конкретной AiGeneration

**Подтверждённый дефект:** `apps/api/src/chat/chat-job.processor.ts:109–113` выбирает `orderBy createdAt ASC, id ASC; take 50` — **самые ранние** 50 сообщений. Также нет ограничения по `generation.userMessageId`: при задержке worker в контекст ответа на запрос A может войти сообщение B, отправленное позднее.

**Алгоритмический контракт:**

1. Target = `AiGeneration.userMessageId`. Загрузить его через server actor/RLS; сверить conversation, org, status; при отсутствии или отменённом доступе — fail closed.
2. История для generation A — допустимый префикс Conversation **до и включая target**, без будущих сообщений независимо от момента запуска worker.
3. Выбирать **последние** N разрешённых сообщений (query DESC LIMIT N → reverse ASC), а не первые. N=50 — защитный scaffold; дополнительно ввести output/input token budget.
4. У `createdAt` может совпасть точность; случайный UUID **не гарантирует** causal order. Для concurrent/tied timestamps нужен persisted monotonic ordinal/sequence **или** строгий консервативный cutoff, исключающий неоднозначные чужие сообщения. Не выдавать лексикографический UUID за порядок вставки.
5. Snapshot обязан сохранить targetUserMessageId, cutoff, selectionPolicyVersion, упорядоченные ids/content hashes, promptVersion. После завершения generation не пересчитывать snapshot на «последней истории».
6. Не вводить пока дополнительную summarization/model pipeline, full RAG context и streaming: это другая задача.

**Тесты:**

- `CTX-001`: разговор из 100 сообщений → модель получает последние разрешённые, а не первые 50.
- `CTX-002`: отправлены A и B; worker A сработал после B → B не появляется в A snapshot/provider input.
- `CTX-003`: одинаковые timestamps → стабильный cutoff, нет future inclusion.
- `CTX-004`: target из недоступного PRIVATE чата → gateway не вызывается.
- `CTX-005`: пересоздание run из тех же inputs → одинаковая ordered provenance/manifest (если policy фиксирована).
- `CTX-006`: длинное сообщение/диалог → строгое ограничение prompt budget с сохранением target.

**DoD:** delayed generation воспроизводима и отвечает на правильный target; длинные разговоры не теряют последнюю историю.

---

## P0-04. Атомарные transitions, отмена и недублируемые ответы

**Подтверждённый риск:** `apps/api/src/chat/chat-job.processor.ts` не делает атомарный `queued→running` claim; уже `running` может обрабатываться вторым worker. После чтения `freshGen` и ACL вне финальной транзакции происходит безусловная запись `succeeded`, тогда как `apps/api/src/chat/chat.service.ts:393–432` параллельно выполняет `cancelled`. В PG отсутствует очевидная уникальность одного assistant message на generation.

**Контракт:**

1. Claim через compare-and-swap/lease: только один worker владеет активной попыткой; повторная доставка не должна дублировать provider call.
2. Terminal = ровно один из `succeeded, failed, cancelled, timed_out`. Terminal не перезаписывается даже при позднем результате AI.
3. Cancel и finalize конкурируют за **одну** generation row/транзакционный predicate. Cancel завершился первым → assistant не публикуется. Success commit первый → поздний cancel не меняет success.
4. Вставка assistant message, snapshot/items/sources, обновление `AiGeneration`, `AIJob` и Conversation — одна транзакция. Не держать БД транзакцию открытой во время вызова модели.
5. Re-check актуального actor access (включая PRIVATE и revoked membership) должен относиться к финальной публикации, а не только к началу worker.
6. Добавить уникальность assistant result per generation, если соответствует данным; предварительно проверить существующие строки и описать безопасную migration/backfill. Не вводить destructive migrations без решения.
7. В multi-instance `OutboxPublisherService` нужен claim/lock/optimistic ownership на непубликованные события: `findMany(publishedAt:null)` из двух процессов не гарантирует одиночную доставку. Worker идемпотентен и к redelivery.
8. Исключения gateway/worker не оставляют вечный `running`: deadline/lease expiration/retry/final status — измеряемые.

**Тесты:**

- `GEN-001`: два worker запускают один job → один provider invocation/assistant result.
- `GEN-002`: cancel между model result и DB commit → cancelled без опубликованного assistant.
- `GEN-003`: cancel после committed success → succeeded остаётся.
- `GEN-004`: membership revoked до финализации → ответ не публикуется лицу без права.
- `GEN-005`: crash между gateway и final commit → recovery без orphan snapshot/messages.
- `GEN-006`: два outbox publisher → нет двойной генерации.
- `GEN-007`: два одновременных POST с одинаковым Idempotency-Key → один job и корректный idempotent response/conflict, не 500.

**DoD:** ровно один terminal outcome и ≤1 assistant message; отмена и повторная доставка не создают неконсистентной истории.

---

## P0-05. Fail-closed конфигурация runtime PostgreSQL/RLS

**Подтверждённый риск:** `packages/db/src/index.ts:73–77` разрешает для `purpose:'runtime'` подставить `DATABASE_URL` (migrator) при отсутствующей `DATABASE_URL_RUNTIME`. В худшем случае привилегированный DB user обходит RLS.

**Минимальный PR:**

1. В shared/production окружениях `DATABASE_URL_RUNTIME` обязателен; его отсутствие — startup failure до HTTP/worker start.
2. Не принимать совпадающие runtime/migrator identities либо роль с `BYPASSRLS`, superuser/owner privileges. Реально проверить роль через DB в startup/preflight без вывода secret URI.
3. Negative tests для cross-org, workspace/PRIVATE conversation на runtime role; тест на неправильный ENV.
4. **Не удалять** blindly migrator client из `PrismaService`: текущие bootstrap/auth/outbox/worker обращаются к нему. Сделать inventory всех usage и отдельно предложить least-privilege service role для production. Сам fail-fast guard **не доказывает**, что каждый внутренний запрос уже проходит RLS.
5. Не создавать привилегированного bypass для vector/search/worker «ради удобства» при будущей Phase 6.

**Тесты:**

- `RLS-001`: NODE_ENV=production, нет DATABASE_URL_RUNTIME → startup fail.
- `RLS-002`: runtime URL указывает на privileged DB identity → startup fail.
- `RLS-003`: actual role has BYPASSRLS/superuser → fail.
- `RLS-004`: Actor A не читает Org B через runtime.
- `RLS-005`: Actor без права не читает PRIVATE chat/snapshot.

**DoD:** ошибочный runtime URL не отключает RLS незаметно. Удаление миграционных привилегий из живых worker — отдельный dependency-aware этап до production.

---

## P0-06. Отдельный будущий safety gate: Synthetic mode ≠ синтетические данные

В `apps/api/src/chat/chat-job.processor.ts` и `apps/api/src/ai/ai.controller.ts` server-side `dataClass:'synthetic'` задаётся константой, хотя в строке может быть реальный текст пользователя. Сейчас работает только SyntheticAIProvider без внешних вызовов: **утечка этим не доказана**.

До добавления любого внешнего AI adapter:

1. Разделить execution mode (SyntheticProvider) и data classification (D0–D4 / synthetic fixture marker).
2. Проводить transfer-policy gate на сервере перед внешним провайдером; user-supplied `dataClass` не доверять.
3. D3 запрещён внешнему AI до закрытия O-002; изменение ENV/adapter не может обходить правило.
4. Тест D3-like chat input → outbound request blocked до сетевого вызова; никакого payload в логах.
5. Не считать этот PR разрешением выбрать модель OpenAI (O-001 всё ещё открыт).

---

## 7. Тестовый контур и команды

Тесты P0-01/P0-02/P0-04/P0-05 должны использовать **настоящие PostgreSQL + Redis**, не только mocks. В CI/локально:

```bash
pnpm install --frozen-lockfile
docker compose up -d
pnpm --filter @spectre/db migrate:deploy
pnpm --filter @spectre/db validate
pnpm --filter @spectre/api build
pnpm --filter @spectre/api test
pnpm --filter @spectre/db test
pnpm test
```

Тесты concurrency делать с deterministic barriers/latches, а не угадывать гонку случайными sleep. Ресурсы тестов — синтетические; не работать с реальными клиентскими файлами. Fault injection: Redis недоступен, worker crash, delayed job, provider error, revoked membership, duplicate delivery, role misconfiguration.

**Сохранить D-011 статусы строго:** `queued, running, succeeded, failed, cancelled, timed_out`. `completed` — техническое состояние BullMQ, не новый статус `AIJob`. Ретрайные задержки — metadata, не отдельный enum.

### Приёмка всего пакета

- [ ] Mixed chat+extract workers никогда не подтверждают чужой job без обработки.
- [ ] Временная ошибка extraction приводит к реальной bounded повторной попытке, permanent — terminal.
- [ ] Нет ложного `timed_out` при произвольном parser exception.
- [ ] Отказ Redis до/после publish не теряет durable AIJob.
- [ ] Ответ на message A не видит message B, созданное после A.
- [ ] Для 100 сообщений контекст берётся из последних допустимых, с фиксированным cutoff и budget.
- [ ] Concurrent claim/cancel/idempotency не даёт двух assistant replies и не переписывает terminal.
- [ ] В production нельзя стартовать с runtime DB owner/BYPASSRLS из-за отсутствующей ENV.
- [ ] Негативные ACL/PRIVATE/cross-org regression tests остаются зелёными.
- [ ] API/Redis/logs не содержат исходных документов/prompts/секретов.
- [ ] Не добавлены внешние AI, OCR, vector, RAG code или неподтверждённые D/O изменения.

---

## 8. PR-отчёт, который Cursor обязан вернуть

После **каждого** маленького PR:

1. Что сломано (кратко) и каким тестом воспроизведено.
2. Какие файлы изменены и зачем; отдельно новая миграция/конфигурация.
3. Выбранная семантика атомарности, retry и ошибок (без изменения D-011).
4. Запущенные команды и **реальный** результат; skipped tests/незапущенные интеграционные тесты перечислить явно.
5. Failure cases: что произойдёт при Redis outage, crash, cancel, ACL revoke.
6. Оставшийся долг; не объявлять production-ready до O-002/O-003/O-005 и полного RLS credential hardening.
7. Commit/PR согласно репозиторному `AGENTS.md`; merge — после подтверждения владельца.

Не начинать Phase 6, пока не выполнены acceptance conditions P0-01…P0-05. P0-06 является дополнительным блокером **перед внешним AI**, не перед локальным Synthetic MVP.

**Этот документ — единственный новый артефакт текущего шага. Исходники, существующие docs и decisions-log не менялись.**

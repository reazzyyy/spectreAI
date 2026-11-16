# Интеграция пакета Retrieval Engine

**Дата:** 2026-11-16  
**Ветка:** `docs/ai-retrieval-package-integration`  
**Статус:** документационная интеграция; код Retrieval Engine / LegalAct schema **не** реализуется этим пакетом.

## Согласованные правила интеграции

- **B1:** `docs/ai/retrieval/` остаётся **PROPOSED**-дополнением; приоритет `decisions-log` → канон (`17`/`18`/`30`) → Phase 6 (`33`) → этот пакет.
- **C1:** обновлены `DOCUMENTATION-GOVERNANCE.md`, корневой `README.md`, `AGENTS.md` и перекрёстные ссылки в `17`/`18`/`33`/`30`/`decisions-log`. Статусы D/O/H **не** менялись; новые официальные ID **не** назначались.
- Код, Prisma-схема, зависимости и деплой в рамках этой интеграции **не** меняются.

## Соответствие канону (сверка)

| Тема в пакете | Канон / решение | Итог |
|---|---|---|
| PostgreSQL + pgvector | **D-018** CONFIRMED | Согласовано; пакет не предлагает отдельную vector DB |
| PostgreSQL FTS vs ParadeDB BM25 | D-018 фиксирует FTS; ParadeDB — **TO_VALIDATE** | ParadeDB не заменяет D-018; benchmark допустим только как эксперимент до нового решения |
| Embedding-модель (Qwen3 и др.) | Gate B / O-001 OPEN | Кандидаты **TO_VALIDATE**; не фиксировать schema dimensions до Gate B |
| Chunking Structure-Aware / Parent-Child | **FILE-009** OPEN; `docs/33` рекомендует parent+child | PROPOSED-направление; не закрывает FILE-009 |
| RRF fusion | `docs/33`, `docs/17` | Согласовано как кандидат |
| Cross-Encoder rerank | DEFERRED в пакете | Согласовано с «optional reranker» в `docs/33` |
| OCR | **H-002** / **O-004** / **D-031** | «OCR по необходимости» не разрешает OCR для клиентских сканов до решений; для нормативных материалов — отдельное согласование |
| Источники НПА / лицензии | **O-006** OPEN | Пакет корректно оставляет источник OPEN; не подключать платные базы |
| Synthetic / внешний AI | **D-012** / **O-002** | Пакет явно ограничивает; не меняет |
| Tenant ACL / RLS | **W-020**, `docs/07` | Согласовано: ACL серверный; не из запроса пользователя |
| LegalAct* логическая модель | `docs/06`, `docs/18` | Не Prisma-схема; физическая схема — только после O-006 и валидации |
| Сценарии A–E (нормы → практика → договоры) | Phase 6 (`docs/33`) = user-document RAG | **Дополняют**, не заменяют: Phase 6 — документы org/workspace; пакет — legal knowledge / research vertical |
| Evaluation metrics | `docs/30`, `docs/22` | Согласовано по Recall/MRR/nDCG + ACL leakage = 0 |
| Blue-green index | DEFERRED | Согласовано с MVP-простотой `docs/33` / `docs/28` |

## Что обновлено в каноне при интеграции

| Файл | Изменение |
|---|---|
| `docs/DOCUMENTATION-GOVERNANCE.md` | Строка каталога + § про пакет `docs/ai/` |
| `README.md` | Индекс + приоритет |
| `AGENTS.md` | Указатель на PROPOSED-пакет |
| `docs/decisions-log.md` | Указатель (без смены статусов) |
| `docs/17`, `docs/18`, `docs/33`, `docs/30` | Перекрёстные ссылки на пакет |
| `docs/ai/README.md` | Вход в каталог |
| `docs/ai/retrieval/README.md` | Ссылки на канон и INTEGRATION-NOTES |

## Намеренно не сделано

- Не закрыты O-006, Gate B, FILE-009, O-002, O-004.
- Не созданы таблицы LegalAct / LegalProvision в Prisma.
- Не добавлен ParadeDB / новая embedding-зависимость в код.
- Не объявлен Retrieval Engine «реализованным» в AS-IS (`docs/26`).

## Следующий шаг (вне этой интеграции)

По `08-decisions-and-open-questions.md` и канону `docs/18`: выбрать разрешённый тестовый нормативный источник (**O-006**), затем прототип exact lookup + temporal model — только после явного решения владельца. Phase 6 user-document indexing остаётся по `docs/33` / `CURSOR-INSTRUCTIONS-PHASE5-6.md`.

# Phase 5–6 gaps tracker

**Источник:** `docs/34-phase5-6-code-and-design-audit.md` (снимок 2026-11-10).  
**Спеки (PROPOSED):** `docs/32`, `docs/33`. Инструкция: `docs/CURSOR-INSTRUCTIONS-PHASE5-6.md`.  
**Правило:** этот файл — рабочий трекер. Не закрывает D/O/H и не заменяет `docs/decisions-log.md`.

## P0 — блокируют безопасную Phase 5/6

| ID | Пробел | Срез | Статус |
|---|---|---|---|
| P5-01 | Нет Conversation / Message Prisma + API + UI | 5A | open |
| P5-02 | Нет chat ACL + RLS (PRIVATE/WORKSPACE; Org Admin без auto content) | 5A | open |
| P5-03 | `/ai/generate` синхронный synthetic — не chat orchestration | 5A | open |
| P5-04 | Нет AI Generation entity; AIJob сейчас extract-centric | 5A | open |
| P5-05 | Нет transactional Outbox / publisher для chat jobs | 5A | open |
| P6-01 | Нет DocumentVersion; extraction unique на documentId | 6A | open |
| P6-02 | Нет chunk / embedding / index generation schema + indexing worker + retrieval SQL | 6A→6B | open |

## P1 — нужны до полноценного RAG

| ID | Пробел | Срез | Статус |
|---|---|---|---|
| P6-03 | Structure parser (heading/clause/paragraph/offsets) | 6A | open |
| P6-04 | Русскоязычный FTS + exact identifier path | 6A | open |
| P6-05 | EmbeddingProvider + выбранная модель/dimensions | Gate B → 6B | blocked (Gate B) |
| P6-06 | pgvector migration + HNSW benchmark | Gate B → 6B | blocked (Gate B) |
| P6-07 | RRF / reranking / context builder / citation validator | 6B / optional | open |
| P6-08 | Search ACL tests, cache invalidation, delete tombstone | 6A+ | open |
| P6-09 | Golden set + retrieval regression (Recall@K, MRR, nDCG) | 6A+ | open |

## Открытые решения (не кодировать закрытие)

| Тема | Где | Примечание |
|---|---|---|
| FILE-009 chunking strategy | decisions-log / D-025 | OPEN до benchmark + явного выбора |
| Gate B embeddings | roadmap ворота B | модель/dimensions; внешний embedder только с O-002 |
| O-002 внешняя передача | decisions-log | до закрытия — только Synthetic |
| DEC-05 regenerate/edit/cancel details | design flow register | не внедрять product semantics до решения |
| O-012 workspace delete confirmer | decisions-log | вне scope Phase 5/6 |
| O-004 / D-031 OCR/scan | decisions-log | scan → failed; OCR не в 5/6 |

## Порядок закрытия (канон инструкции)

1. **5A** foundation (models/RLS/ACL) → orchestration (API/Outbox/worker/Synthetic) → e2e history  
2. **5B** context/source refs (synthetic-safe)  
3. **6A** DocumentVersion → structure/chunk experiment → FTS (FILE-009 остаётся OPEN до confirm)  
4. **Gate B** → **6B** vector/HNSW/RRF  
5. Optional quality (rewrite/rerank/MMR) только по метрикам

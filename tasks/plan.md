# Implementation Plan: Phase 5A Chat (foundation)

> **Статус:** 5A-1 + **5A-2 закрыты в коде** (2026-11-12). Следующий — **5B** context/UI или Phase 6A.  
> **Канон:** `docs/32`, D-011/D-012/D-026/D-027, W-006–W-008/W-020, AS-IS `docs/26`.  
> **Пробелы:** `tasks/phase5-6-gaps.md`. JOB-012 остаётся OPEN (Outbox scaffold only).  
> **Не цель:** внешний LLM (O-002), regenerate/edit (DEC-05), DocumentVersion/FTS/vector, OCR, workspace delete (O-012).

---

## Overview

1. Docs pack — done.
2. 5A-1 data/access — done.
3. 5A-2 orchestration — API, Outbox, chat worker, Synthetic, e2e — **done**.
4. Later — 5B context/UI; 6A DocumentVersion/FTS; Gate B → 6B vector.

## Task slices

```text
5A-1   models/RLS/ACL  (done)
5A-2   API + Outbox + chat worker + Synthetic + e2e  (done)
5B     context/source refs + chat UI
6A…    DocumentVersion / FTS
```

### Acceptance

- [x] Models + migrations + RLS + runtime-role tests
- [x] ConversationAccess + HTTP create/list/open; PRIVATE vs WORKSPACE
- [x] Send message → Generation + AIJob + Outbox; idempotent; Synthetic persisted
- [x] Reload restores history; ACL/idempotency e2e
- [x] AS-IS `docs/26` + READMEs updated after 5A-2

### Out of scope

OpenAI, embeddings, DocumentVersion, chunks, FTS/pgvector, regenerate/edit product rules, OCR success path, workspace hard delete, chat UI.

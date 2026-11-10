# Implementation Plan: Phase 5A Chat (foundation)

> **Статус:** план среза после интеграции спек Phase 5–6 (2026-11-11). Код Phase 5A **ещё не начат**.  
> **Предыдущий план:** Hardening + Phase 4 extract — **закрыт** (`tasks/todo.md`).  
> **Канон:** `docs/32`, `docs/CURSOR-INSTRUCTIONS-PHASE5-6.md`, D-011/D-012/D-026/D-027, W-006–W-008/W-020, `docs/15`/`19`, AS-IS `docs/26`.  
> **Пробелы:** `docs/34`, трекер `tasks/phase5-6-gaps.md`.  
> **Не цель:** внешний LLM (O-002), regenerate/edit (DEC-05), DocumentVersion/FTS/vector (Phase 6), OCR (O-004), workspace delete (O-012).

---

## Overview

1. **Docs pack** — `docs/32`–`34` + инструкция в репозитории (**PROPOSED**; статусы D/O/H не менялись).
2. **Phase 5A data/access** — Conversation, Message, Generation; RLS; PRIVATE/WORKSPACE ACL.
3. **Phase 5A orchestration** — API, Outbox, BullMQ chat worker, Synthetic only, cursor messages, e2e history.
4. **Later** — 5B context; 6A DocumentVersion/FTS; Gate B → 6B vector.

## Architecture Decisions (locked from journal)

- Synthetic only until **O-002** (**D-012**).
- AIJob statuses **D-011**; Idempotency-Key **D-027**; cursor lists **D-026**.
- RLS + NestJS authz (**W-020**); Org Admin без auto content (**W-008**).
- Не начинать 6B schema до Gate B; FILE-009 остаётся OPEN.

## Task slices (перед кодом — отчёт из §3 инструкции)

```text
Docs   docs/32–34 + governance/roadmap/gaps  (этот пакет)
5A-1   Conversation/Message/Generation + RLS + ACL tests
5A-2   API + Outbox + chat worker + Synthetic + e2e history
5B     context/source refs (synthetic-safe) — после 5A
6A…    DocumentVersion / FTS — отдельный план; не в этом срезе
```

### Acceptance (Phase 5A)

- [ ] Models + migrations + RLS ENABLE/FORCE + runtime-role tests
- [ ] Create/list/open Conversation; PRIVATE vs WORKSPACE isolation
- [ ] Send message → Generation + AIJob + Outbox; idempotent; Synthetic response persisted
- [ ] Reload restores history; cross-tenant / cross-workspace / private isolation negative tests
- [ ] AS-IS `docs/26` + READMEs updated after code

### Out of scope

OpenAI, embeddings, DocumentVersion, chunks, FTS/pgvector, regenerate/edit product rules, OCR success path, workspace hard delete.

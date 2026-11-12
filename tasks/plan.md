# Implementation Plan: Phase 5A Chat (foundation)

> **Статус:** 5A-1 **закрыт в коде** (2026-11-12). Следующий срез — **5A-2** orchestration.  
> **Предыдущий:** Hardening + Phase 4 extract — **закрыт**; docs pack Phase 5–6 — **закрыт**.  
> **Канон:** `docs/32`, `docs/CURSOR-INSTRUCTIONS-PHASE5-6.md`, D-011/D-012/D-026/D-027, W-006–W-008/W-020, AS-IS `docs/26`.  
> **Пробелы:** `tasks/phase5-6-gaps.md`.  
> **Не цель 5A-2:** внешний LLM (O-002), regenerate/edit (DEC-05), DocumentVersion/FTS/vector, OCR, workspace delete (O-012).

---

## Overview

1. **Docs pack** — done.
2. **Phase 5A-1 data/access** — Conversation, Message, AiGeneration; RLS; `ConversationAccess` — **done**.
3. **Phase 5A-2 orchestration** — API, Outbox, BullMQ chat worker, Synthetic only, cursor messages, e2e history — **next**.
4. **Later** — 5B context; 6A DocumentVersion/FTS; Gate B → 6B vector.

## Architecture Decisions (locked from journal)

- Synthetic only until **O-002** (**D-012**).
- AIJob statuses **D-011**; Idempotency-Key **D-027**; cursor lists **D-026**.
- RLS + NestJS authz (**W-020**); Org Admin без auto content (**W-008**).
- Не начинать 6B schema до Gate B; FILE-009 остаётся OPEN.

## Task slices

```text
Docs   docs/32–34 + governance/roadmap/gaps  (done)
5A-1   Conversation/Message/Generation + RLS + ACL tests  (done)
5A-2   API + Outbox + chat worker + Synthetic + e2e history  (next)
5B     context/source refs (synthetic-safe) — после 5A-2
6A…    DocumentVersion / FTS — отдельный план
```

### Acceptance

- [x] Models + migrations + RLS ENABLE/FORCE + runtime-role tests (5A-1)
- [x] ConversationAccess PRIVATE vs WORKSPACE unit isolation (5A-1; HTTP create/list/open — 5A-2)
- [ ] Send message → Generation + AIJob + Outbox; idempotent; Synthetic response persisted
- [ ] Reload restores history; cross-tenant / cross-workspace / private isolation e2e
- [x] AS-IS `docs/26` + READMEs updated after 5A-1

### Out of scope

OpenAI, embeddings, DocumentVersion, chunks, FTS/pgvector, regenerate/edit product rules, OCR success path, workspace hard delete.

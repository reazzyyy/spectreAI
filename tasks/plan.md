# Implementation Plan: Hardening + Phase 4 extract

> **Статус:** в работе (2026-11-10).  
> **Предыдущий план:** Phase 3 document upload — **закрыт** (`tasks/todo.md`).  
> **Канон:** D-010/D-017, **D-025–D-031**, D-011, D-012, W-005/W-020, `docs/13`, `docs/15`, AS-IS `docs/26`.  
> **Не цель:** OCR promise (O-004), OpenAI (O-002), chat, RAG chunks (FILE-009), production object storage (O-003), workspace delete (O-012).

---

## Overview

1. **Docs pack** — CONFIRMED D-025–D-031 (закрыт в journal).
2. **Hardening** — upload atomicity, validation, rate limit, AI auth, cursor lists, workspace RLS on documents.
3. **Phase 4 thin** — AIJob + DocumentExtraction in PG, BullMQ worker, extract TXT/DOCX/digital PDF; scan → failed (D-031).
4. **Backlog parallel** — thin audit_events, streaming upload; AV remains OPEN (FILE-010).

## Architecture Decisions (locked)

- Extracted text in **PostgreSQL** (D-025).
- Cursor pagination (D-026); Idempotency-Key / `documentId:extract:v1` (D-027).
- Caps D-030; scan policy D-031.
- EDITOR delete own only (D-029) — apply when delete HTTP exists; no workspace delete without O-012.

## Task slices

```text
A   Docs: D-025–D-031 + docs/11/13/15/07 + debt/todo sync
B   Hardening: two-phase upload, DOCX/PDF harden, Redis rate limit,
    AI ActorGuard, visible-workspace SQL + cursor, documents RLS membership
C   Phase 4: AIJob + DocumentExtraction + worker + enqueue + tests + AS-IS
D   audit_events thin + streaming upload; FILE-010 note; O-012 untouched
```

### Acceptance

- [ ] Upload: DB row before blob finalize; orphans swept; encrypted PDF / bad DOCX rejected
- [ ] Rate limit on login/upload/ai; `/ai/generate` requires session; dataClass server synthetic
- [ ] List documents/workspaces support cursor; no N+1 content ACL for workspace list
- [ ] RLS: non-member cannot SELECT documents of TEAM workspace even with org GUC
- [ ] Upload → AIJob extract → text in PG or failed for scan; idempotent re-enqueue
- [ ] Audit events for login/upload/download without content
- [ ] AS-IS + READMEs updated

### Out of scope

OCR success path, embeddings, chat, grant, hard delete workspace, ClamAV product, Chromatic.

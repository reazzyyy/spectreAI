# Implementation Plan: Phase 5A Chat (foundation)

> **Статус:** 5A + **5B context refs закрыты** (2026-11-12). Следующий — chat UI или **6A**.  
> **Канон:** `docs/32`, D-011/D-012, W-007/W-020, AS-IS `docs/26`.  
> **Пробелы:** `tasks/phase5-6-gaps.md`. JOB-012 / CTX-* / FILE-009 / Gate B / O-002 remain OPEN.  
> **Не цель:** внешний LLM, DocumentVersion-in-context, regenerate/edit (DEC-05), OCR, workspace delete.

---

## Overview

1. 5A-1/5A-2 — done.
2. 5B conversation_only ContextSnapshot + MessageSource — **done** (no chat UI in this slice).
3. Later — chat UI; 6A DocumentVersion/FTS; Gate B → 6B vector.

## Task slices

```text
5A…   chat foundation + orchestration  (done)
5B    context/source refs conversation_only  (done)
UI    chat FSD widgets  (next optional)
6A…   DocumentVersion / FTS
```

### Acceptance

- [x] ContextSnapshot/Item/MessageSource + RLS
- [x] Worker persists snapshot/sources with synthetic reply
- [x] GET generation returns contextMode + sources
- [x] AS-IS + READMEs + e2e

### Out of scope

OpenAI, embeddings, DocumentVersion, chunks, FTS/pgvector, regenerate/edit, OCR, workspace hard delete, chat UI.

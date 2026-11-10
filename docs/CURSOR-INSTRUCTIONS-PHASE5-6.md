# Cursor Instructions — Phase 5 Chat + Phase 6 Search/RAG

**Назначение:** инструкция для Cursor по реализации следующих срезов. Сначала прочитать документы, затем составить план, не начинать широкие изменения без отчёта о конфликтах.

## 1. Обязательное чтение

1. `AGENTS.md` и `.cursor/rules/*`.
2. `docs/decisions-log.md` — единственный источник статусов D/O/H.
3. `docs/26-codebase-current-state.md` — AS-IS snapshot; проверить, не изменился ли код с даты документа.
4. `docs/32-phase5-chat-implementation-specification.md`.
5. `docs/33-phase6-rag-implementation-specification.md`.
6. `docs/34-phase5-6-code-and-design-audit.md`.
7. `docs/06-data-model.md`, `docs/07-access-control-matrix.md`, `11-api-conventions.md`, `12-authentication-and-sessions.md`, `15-ai-jobs-and-background-processing.md`, `docs/16-prompt-management-and-ai-safety.md`, `17-rag-and-knowledge-retrieval.md`, `19-conversation-and-workspace-context.md`, `20-ai-product-workflows.md`.
8. `docs/workspace-phase2/02-data-model-and-rls.md`, `03-api-auth-and-invitations.md`, `05-testing-and-acceptance.md`.
9. `docs/27–30` — portability, index manifest, runbook and search validation.
10. Figma flow register only as UX reference; identify which flows are accepted vs unresolved.

## 2. Non-negotiable constraints

- Do not change confirmed decisions or OPEN/HYPOTHESIS statuses.
- Do not edit existing docs 00–31 to duplicate the new specs. If a contradiction is discovered, report it and propose a minimal targeted amendment separately.
- No external LLM/embedding/reranker call with real client content until O-002 is closed.
- Use SyntheticAIProvider for synthetic-only Chat integration.
- Do not invent embedding model/dimensions before Gate B.
- Do not implement OCR before O-004; D-031 remains active.
- Do not implement workspace deletion/second confirmer (O-012) as part of Phase 5/6.
- Every new tenant-owned table needs RLS ENABLE + FORCE, explicit SQL policy, and runtime-role integration tests.
- Preserve FSD and current stack; do not transplant the Figma Vite prototype wholesale.

## 3. Required first response from Cursor

Before coding, return:

1. Current git branch/status and code drift from AS-IS docs.
2. Inventory of existing schema/modules/migrations/tests relevant to Chat, AIJob, Outbox, DocumentVersion and search.
3. A file-by-file implementation plan for Phase 5A and 6A.
4. A list of conflicts/decisions that require user approval.
5. Confirmation that no external provider will receive real data.

Do not begin Phase 6B vector schema until Gate B has a selected model and dimensions.

## 4. Implementation order

### Slice 1 — Phase 5A data/access foundation

- Add Conversation and Message models with `organizationId`, `workspaceId`, `visibility`, `ownerUserId` and correct composite FKs/indexes.
- Add AI Generation model and link it to current AIJob without breaking extract jobs.
- Add SQL RLS migration for Conversation, Message, Generation and related tenant records.
- Use current `PrismaService.withActor` pattern and server-derived ActorContext.
- Implement `PRIVATE` vs `WORKSPACE` ACL; OWNER/EDITOR write, VIEWER read-only; Org Admin no automatic content access.
- Add tests before UI.

### Slice 2 — Phase 5A orchestration/API

- Implement create/list/open Conversation and cursor-paginated messages.
- Implement idempotent send message transaction (Message + Generation + AIJob + Outbox).
- Add Outbox publisher and Chat worker using BullMQ; do not send full document text in queue payload.
- Re-check ACL in worker and before returning result.
- Use SyntheticAIProvider only; clearly mark synthetic response in API/UI.
- Implement cancel request safely; do not claim provider cancellation if not supported.
- Add e2e flow: login → Workspace → create chat → send → synthetic result → reload → history.

### Slice 3 — Phase 6A DocumentVersion and extraction migration

- Introduce immutable DocumentVersion and migrate existing Document data as version 1.
- Move extraction relationship to DocumentVersion using expand-and-contract; preserve current data and verify checksums/counts.
- Do not add chunks until version migration and FK tests pass.

### Slice 4 — Phase 6A structure/chunk/FTS

- Implement structural parser output with raw vs normalized vs retrieval text.
- Benchmark fixed-size, structure-aware and parent-child chunking on golden set.
- Implement selected strategy only after reporting metrics; FILE-009 remains OPEN until user confirms the result.
- Add index generation/manifest linkage aligned with docs 28–30.
- Add Russian PostgreSQL FTS + exact identifier route; explicitly do not call FTS BM25.
- Add indexing AIJob idempotency and worker; do not mark a document searchable before successful index validation.

### Slice 5 — Gate B then Phase 6B

Only after explicit Gate B decision:
- add pgvector extension migration;
- add EmbeddingProvider adapter separate from `generateText`;
- fix dimensions/profile metadata;
- create HNSW index and benchmark against exact search;
- implement vector retrieval + RRF;
- add tests for model incompatibility and index generation switch.

### Slice 6 — optional quality improvements

Query rewriting/decomposition, Cross-Encoder reranking, MMR and retrieval cache are separate measured increments. Do not add them all by default. Show baseline vs candidate quality/latency/cost and request approval if new provider/data handling is involved.

## 5. Required tests per slice

- Unit: access policy, chunking boundaries, normalization, RRF rank fusion, context budget, citation validation.
- Integration: RLS under runtime DB role; tenant/workspace/private chat isolation; FTS; version scoping; index generation switch.
- E2E: Chat lifecycle and document search lifecycle.
- Reliability: duplicate queue delivery, worker restart, Outbox retry, cancellation race, idempotent reindex, failed new generation leaves previous active generation intact.
- Security: prompt injection in source document treated as data; no ACL leakage; revoked user cannot retrieve cached or prior job result.
- Evaluation: golden set report with Recall@K, MRR, nDCG, citation precision, exact-vs-ANN delta, p50/p95.

## 6. Definition of done

A slice is done only when:
- migrations are reversible/expand-contract where required;
- Prisma schema and generated client validate;
- API DTO/runtime validation exists;
- RLS policies and tests are present for every new tenant table;
- no direct provider calls bypass AI Gateway;
- idempotency and job lifecycle are tested;
- FSD boundaries/lint/build/tests pass;
- docs 26 AS-IS and relevant roadmap are updated after implementation;
- OPEN questions remain OPEN until explicitly decided.

## 7. Cursor final report format

At the end of each slice report:
1. files changed;
2. migrations added and data backfill performed;
3. endpoints and contracts added;
4. security/RLS policy and tests;
5. commands/tests run and results;
6. known limitations;
7. decisions still OPEN;
8. whether any existing confirmed decision was affected (expected: no).


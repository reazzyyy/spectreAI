# Task list

План среза: `tasks/plan.md`. Roadmap: `tasks/roadmap.md`.  
Долги Фазы 2: `tasks/phase2-debt.md`. Пробелы Phase 5–6: `tasks/phase5-6-gaps.md`.

## Closed — Frontend D-024 + product CRM UI

- [x] F1–F4 foundation / shell / Storybook / Playwright
- [x] F5a–F5k Workspace / Matter / Client / invites / TEAM / org roles
- [x] Chore: system-map SCSS; CI `web-e2e`

## Closed — Phase 3 documents (thin)

- [x] D3a–D3c + docs sync

## Closed — Arch decisions pack (2026-11-10)

- [x] D-025–D-031 in journal + docs sync

## Closed — Hardening + Phase 4 extract (2026-11-10)

- [x] B: upload two-phase, DOCX/PDF harden, Redis rate limit, AI ActorGuard, cursor lists, documents W-020+ RLS
- [x] C: AIJob + DocumentExtraction + extract worker + idempotent enqueue + AS-IS
- [x] D: thin audit_events, disk multipart upload; FILE-010 noted OPEN; O-012 untouched

## Closed — Phase 5–6 specification package (2026-11-11)

- [x] Copy `docs/32`–`34` + `CURSOR-INSTRUCTIONS-PHASE5-6.md`
- [x] Governance / roadmap / plan / todo / `tasks/phase5-6-gaps.md` pointers (D/O/H statuses unchanged)

## Closed — Phase 5A-1 Chat foundation (2026-11-12)

- [x] 5A-1: Conversation / Message / AiGeneration models + RLS + `ConversationAccess` ACL tests (P5-01/02/04 data layer)
- [x] Docs AS-IS / db+access READMEs / gaps tracker after code

## Closed — Phase 5A-2 Chat orchestration (2026-11-12)

- [x] 5A-2: API + Outbox + chat worker + Synthetic + e2e history (P5-03/05; HTTP of P5-01)
- [x] Docs AS-IS / api+db READMEs / gaps after code

## Closed — Phase 5B context refs (2026-11-12)

- [x] ContextSnapshot / Item / MessageSource + RLS; conversation_only synthetic wiring
- [x] Generation API returns sources; e2e + RLS coverage; AS-IS/trackers

## Closed — Phase 5 chat UI (2026-11)

- [x] Thin project chat UI (#47, #48)

## Closed — Phase 6A DocumentVersion (2026-11-17)

- [x] DocumentVersion v1 on upload (#51). FTS, chunks and vector are not in this slice

## Closed — P0 reliability (2026-11)

- [x] P0-01 one ai-jobs consumer (#52)
- [x] P0-02 extract retry and outbox recovery (#53)
- [x] P0-03 history cutoff at the target message (#54)
- [x] P0-04 one chat outcome (#55)
- [x] P0-05 runtime role check on startup (#56). Auth still uses the migrator until S5
- [x] P0-06 in-process synthetic transfer gate (#57). Wording of D-035 is still open

## Closed — quality remediation S1–S16

- [x] S1–S2 web build and hook lint (#59, #58)
- [x] S3–S4, S6 RLS auth tables, append-only audit, document-version backfill (#61–#63)
- [x] S9, S11–S16 extract lease, worker membership re-check, HTTP codes, UUID 404, list cursors, narrow shell, test isolation (#64–#67, #70–#72)

## Next

- [x] 6A-0: `search_tsv` + GIN on `document_extractions` (`docs/35`). No search API and no `searchEligible` flip
- [ ] 6A-1: `document.search_publish` job sets `searchEligible` idempotently; extract still does not
- [ ] 6A-2: `GET /workspaces/:id/search` with ACL in SQL and a cursor
- [ ] 6A-3: search field in documents and the project
- [ ] 6A-4: Russian golden set and the synonym limitation in AS-IS
- [x] D-035–D-042 recorded. O-012 closed by D-039. S5, S7, S8, S10, and the safe S0 jobs are in code
- [x] D-042 explicit `APP_ENV`; dev token hidden on production, staging, and preview
- [x] S5 login and session resolve use spectre_auth (D-036). Invites, audit, and job enqueue still use the migrator
- [x] S7 block Org Admin self-add and peer-admin content role (D-037)
- [x] S10 production rate limit fail-closed (D-040)
- [x] S8 document deletion lifecycle and no-confirmer guard (D-038, D-039). Full confirmer flow stays Phase 10
- [x] S0: `typecheck`, `db validate`, and web `lint:all` (D-041). `build` waits for a deterministic Next build
- [ ] Remaining Phase 2 debt (`tasks/phase2-debt.md`) — confirmer flow, email provider, idle session
- [ ] FILE-010 antivirus product integration

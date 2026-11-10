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

## Next — Phase 5A Chat

- [ ] 5A-1: Conversation / Message / Generation models + RLS + ACL tests (`docs/32`, gaps P5-01/02/04)
- [ ] 5A-2: API + Outbox + chat worker + Synthetic + e2e history (P5-03/05)
- [ ] Docs AS-IS after code

## Later

- [ ] Phase 5B: context / source refs (synthetic-safe)
- [ ] Phase 6A: DocumentVersion → structure/chunk experiment → FTS (FILE-009 OPEN until confirm)
- [ ] Gate B → Phase 6B vector / HNSW / RRF
- [ ] Remaining Phase 2 debt (`tasks/phase2-debt.md`) — O-012, email provider, idle session…
- [ ] Optional: CI Chromatic publish when token ready
- [ ] FILE-010 antivirus product integration

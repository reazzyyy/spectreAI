# Task list

План среза: `tasks/plan.md`. Roadmap: `tasks/roadmap.md`. Долги Фазы 2: `tasks/phase2-debt.md`.

## Closed — Frontend D-024 + product CRM UI

- [x] F1–F4 foundation / shell / Storybook / Playwright
- [x] F5a–F5k Workspace / Matter / Client / invites / TEAM / org roles
- [x] Chore: system-map SCSS; CI `web-e2e`

## Closed — Phase 3 documents (thin)

- [x] D3a: Prisma Document + RLS + LocalObjectStorage
- [x] D3b: Upload/list/get/download API + e2e isolation/validation
- [x] D3c: Web `/documents` list + upload
- [x] Docs: AS-IS + API/web README sync

## Closed — Arch decisions pack (2026-11-10)

- [x] D-025 FILE-007 text in PostgreSQL (Phase 4)
- [x] D-026 API-004 cursor pagination
- [x] D-027 API-005 job idempotency
- [x] D-028 O-011 invite TTL 72h default
- [x] D-029 O-013 EDITOR delete own only
- [x] D-030 H-005 scaffold extract caps
- [x] D-031 scan-without-text → failed (Gate E / O-004 open)

## In progress — Hardening + Phase 4

- [ ] B: upload two-phase, file harden, rate limit, AI ActorGuard, cursor lists, W-020+ RLS
- [ ] C: AIJob + DocumentExtraction + worker + idempotent enqueue
- [ ] D: thin audit_events, streaming upload, AV note; O-012 stays OPEN

## Later

- [ ] Optional: CI Chromatic publish when token ready
- [ ] Remaining Phase 2 debt from `tasks/phase2-debt.md` (separate PRs)
- [ ] Phase 5: chat on Synthetic (after extract)

# Phase 2 — Workspace + membership

Глобальный план: `tasks/roadmap.md`. Детали: `tasks/plan.md` (**утверждён** 2026-11-03).  
S0 note: `docs/workspace-phase2/S0-rls-foundation-and-inventory.md`.

## Gate
- [x] План Phase 2 утверждён

## Slices
- [x] S0 Foundation / RLS inventory + role topology (working note)
- [x] S1 Schema Workspace* + RLS + runtime role + harness (verified: migrate + `pnpm test` with Docker)
- [x] S2 `@spectre/access` Workspace policies + tx GUC (branch `feature/workspace-phase2-s2-access`)
- [x] S3 Workspace HTTP API + e2e negatives (PERSONAL create only until TEAM decision)
- [x] S4a CSRF (**W-014** / **W-014a** Origin + double-submit)
- [x] S4b Dev bootstrap (**W-012**)
- [ ] S4c Invitations (TTL **O-011** config)

## Checkpoint: Phase 2 (roadmap)
- [x] S0–S3 merged to `main`, CI green
- [ ] Runtime-role RLS tests green
- [x] AS-IS / package README updated (through S4b)
- [ ] No export / grant / chat / purge quietly shipped

## Later (не этот checkpoint)
- [ ] S5 Chat · S6 Admin grant · S7 Lifecycle · S8 Hardening
- [ ] Optional: ActorGuard on `/ai/*`
- [ ] Decision: who may create TEAM Workspace

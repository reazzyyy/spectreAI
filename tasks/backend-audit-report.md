# Backend audit report (frontend-operator checklist)

**Date:** 2026-11-12  
**Branch context:** local scaffold against AS-IS `docs/26-codebase-current-state.md`  
**Method:** checklist plan (env → automated tests → auth HTTP → isolation via e2e evidence → domain/worker → hygiene)

Verdict key: **PASS** | **FAIL** | **N/A** | **OPEN**

---

## Environment (§0)

| Check | Verdict | Evidence |
|---|---|---|
| docker Postgres + Redis | PASS | `docker compose up -d` — both Up |
| migrate:deploy | PASS | applied `20261110180000_phase4_hardening` |
| bootstrap:dev | PASS | `already-exists` org Spectre |
| API health | PASS | `GET /api/v1/health` → `{ status: "ok" }` |

---

## Automated suites (§8)

| Suite | Verdict | Evidence |
|---|---|---|
| `@spectre/db validate` | PASS | schema valid |
| `@spectre/access test` | PASS | 3 files / 23 tests |
| `@spectre/ai-gateway test` | PASS | 1 file / 5 tests |
| `@spectre/api test` | PASS | 6 files / 45 tests |
| `@spectre/db test` (RLS harness) | PASS | 1 file / 4 tests |

---

## B-ID findings (§2–§7, §10)

| ID | Area | Check | Verdict | Evidence | Action |
|---|---|---|---|---|---|
| B-001 | auth | unauthenticated `/auth/me` → 401 | PASS | manual HTTP | none |
| B-002 | auth | login 200 + `organization.name` + role; no password/hash/token in body | PASS | manual HTTP + e2e login expect `name: "org-a"` | none |
| B-003 | auth | cookies `spectre_sid` HttpOnly + `spectre_csrf` | PASS | manual HTTP | none |
| B-004 | auth | `/auth/me` returns same org name | PASS | manual HTTP | none |
| B-005 | auth | bad password → 401 (uniform) | PASS | manual HTTP | none |
| B-006 | CSRF | mutating without CSRF header → 403 | PASS | manual HTTP + e2e | none |
| B-007 | CSRF | foreign Origin → 403 | PASS | manual HTTP + e2e | none |
| B-008 | CSRF | valid Origin+header create client → 201 | PASS | manual HTTP | none |
| B-009 | auth | logout then me → 401 | PASS | manual HTTP | none |
| B-010 | errors | `{ error: { code, message, requestId } }` | PASS | e2e asserts `error.code` / messages; PowerShell stream read flaky locally | none |
| B-011 | isolation | foreign Client/Matter/Workspace → identical 404 | PASS | `api.e2e-spec.ts` cross-org cases | none |
| B-012 | isolation | foreign clientId on matter/workspace → 422 | PASS | e2e | none |
| B-013 | isolation | foreign matter link → 422; foreign ws matter ops → 404 | PASS | e2e | none |
| B-014 | isolation | foreign org members GET → 404 | PASS | e2e | none |
| B-015 | isolation | org role: no owner role / self / foreign org | PASS | e2e patch cases | none |
| B-016 | isolation | Org Admin ≠ content read | PASS | `packages/access` workspace tests | none |
| B-017 | workspace | PERSONAL\|TEAM create; bad visibility 422; members EDITOR\|VIEWER | PASS | e2e | none |
| B-018 | invitations | create+devToken; reject owner role; accept; revoke; foreign org 404 | PASS | e2e | none |
| B-019 | documents | upload; no `storageKey`; foreign workspace 404; download | PASS | e2e documents block | none |
| B-020 | documents | no Redis → still enqueue PG job / `processing` (fail-open publish) | PASS | `AiJobsService.publish` no-ops if queue null | none (document behavior) |
| B-021 | AI | provider synthetic; generate needs session; non-synthetic blocked; no openai dep | PASS | e2e + ai-gateway tests | none |
| B-022 | worker/queue | queue name `ai-jobs`; `worker:extract` entry exists | PASS | `AI_JOBS_QUEUE`; `src/worker/extract-worker.ts` | none |
| B-023 | RLS | runtime role tests | PASS | `@spectre/db` vitest | none |
| B-024 | inventory | controllers match AS-IS; no hard DELETE on Client/Matter/Document | PASS | `@Controller` scan; no `@Delete` on those modules | none |
| B-025 | hygiene | `.env` / `.data/` gitignored; bootstrap does not print password | PASS | `.gitignore`; bootstrap script comment/contract | none |
| B-026 | hygiene | thin audit without content | PASS | `audit.service.ts` TSDoc + create without payload bodies | none |
| B-027 | docs drift | api README Auth said invitations OUT OF SCOPE | FAIL→fixed | README Auth bullet | fixed in this audit |
| B-028 | docs drift | api README Documents said status `uploaded`, no worker | FAIL→fixed | README Documents section vs Phase 4 worker | fixed in this audit |
| B-029 | scope | MFA/SSO/chat/hard delete/OpenAI/full docs/07 | N/A | AS-IS §8 | none |
| B-030 | canon | idle session timeout etc. | OPEN | AS-IS canon table | track in journal, not blocker |

---

## Blockers for merge

None found in runtime/security contracts covered by this audit.

Documentation drifts **B-027** / **B-028** corrected in [apps/api/README.md](../apps/api/README.md).

---

## How to re-run (operator)

```bash
docker compose up -d
pnpm --filter @spectre/db migrate:deploy
pnpm --filter @spectre/api bootstrap:dev
pnpm --filter @spectre/api dev   # other terminal
curl http://localhost:3000/api/v1/health

pnpm --filter @spectre/db validate
pnpm --filter @spectre/access test
pnpm --filter @spectre/ai-gateway test
pnpm --filter @spectre/api test
pnpm --filter @spectre/db test
```

Feed new FAIL rows to the agent as `B-xxx` only — do not ask for a whole-backend re-audit without IDs.

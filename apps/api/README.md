# `@spectre/api`

NestJS HTTP API scaffold. Global prefix: `/api/v1`. Default port: `3000`. A path id that is not a UUID is `404 NOT_FOUND` before the database query, the same code as a missing resource.

## Prerequisites

- `docker compose up -d` (Postgres + Redis)
- `.env` from `.env.example` (`DATABASE_URL` + `DATABASE_URL_RUNTIME`). Production refuses to start when the runtime URL is missing or points at a superuser / BYPASSRLS / owner role.
- `pnpm --filter @spectre/db migrate:deploy` (creates `spectre_app` + tenant RLS)

## Run

`dev` / `start` load root `.env` via `tsx --env-file` (needed for `WEB_ORIGIN` CSRF allowlist). Nest DI under tsx ESM requires explicit `@Inject(...)` on constructors (metadata is not emitted).

```bash
pnpm --filter @spectre/api dev
pnpm --filter @spectre/api test
pnpm --filter @spectre/api build
```

### Dev bootstrap (W-012)

Creates the first Organization + Owner for local login. Refused when `NODE_ENV=production` or without `BOOTSTRAP_DEV=1`. Password comes from env only (never logged).

```bash
# in root .env (see .env.example): BOOTSTRAP_DEV=1, BOOTSTRAP_ORG_NAME, BOOTSTRAP_OWNER_EMAIL, BOOTSTRAP_OWNER_PASSWORD
pnpm --filter @spectre/db migrate:deploy
pnpm --filter @spectre/api bootstrap:dev
# → prints organizationId / email; login via POST /auth/login or apps/web /login
```

Idempotent for the same org name + owner email (re-runs refresh the owner password hash to match env). Refuses replacing an existing different owner on that org; refuses creating another org when that email already owns a different one. Optional `BOOTSTRAP_OUT_FILE` writes the same JSON payload for CI.

### Invitations (S4c)

- Owner-only: `GET/POST /organizations/:orgId/invitations`, resend, revoke.
- `POST /invitations/accept` — new user supplies `password`; existing user must be logged in as the invite email.
- Roles: `admin` | `member` only (not `owner`). Raw token stored as SHA-256; `devToken` returned outside production only.
- TTL: `INVITE_TTL_HOURS` (**D-028**, default 72h). Email provider stub — out of this slice (devToken stands in).

E2e seeds organizations, clients, matters, users + memberships, a TEAM Workspace fixture, logs in via cookie, and asserts cross-org Client/Matter/Workspace → `404`, foreign `clientId`/`matterId` → `422`, PERSONAL|TEAM create, bad visibility → `422`.

On every GitHub pull request, the same suite runs in `.github/workflows/ci.yml` against a service Postgres (`pgvector/pgvector:pg16`) after `migrate:deploy`.

## Modules (AS-IS)

| Path | Role |
|---|---|
| `src/main.ts` | Bootstrap + `cookie-parser` |
| `src/app.module.ts` | Controllers + DI wiring |
| `src/db/` | Dual Prisma (`migrator` auth/seed, `runtime` + GUC); actor-scoped Client/Matter/Workspace stores |
| `src/workspaces/` | Prisma WorkspaceStore + HTTP list/create/get/patch, members, matter links (S3) |
| `src/documents/` | Upload (two-phase) / list cursor / download; extract enqueue; LocalObjectStorage |
| `src/chat/` | Phase 5A–5B: conversations/messages/generations HTTP, Outbox claim, Synthetic worker. One running attempt and at most one assistant message per generation. Context is the last 50 unambiguous messages up to the target user message, inside an 8000-character budget |
| `src/worker/` | `worker:ai` dispatcher for `document.extract` and `chat.generate` on `ai-jobs`. `worker:extract` / `worker:chat` start that same dispatcher |
| `src/audit/` | Thin audit_events (no content) |
| `src/health/` | Liveness |
| `src/auth/` | Login/logout/me, SessionService, REQUEST-scoped `ACTOR_CONTEXT`, `ActorGuard` |
| `src/clients/` | Client list/create/get/patch via Prisma + `ClientAccess` |
| `src/matters/` | Matter list/create/get/patch via Prisma + `MatterAccess` |
| `src/ai/` | Provider status + in-process generate (**session required**). Posted text is server-classed `D3`; client `dataClass` is ignored. External transfer stays blocked |
| `src/http/` | Errors, CSRF, cursor helpers, Redis rate limit |
| `src/queue/` | BullMQ `ai-jobs` queue factory (wired when `REDIS_URL` set) |
| `src/scripts/` | Dev bootstrap + `sweep:uploading` orphan sweeper |
| `src/invitations/` | Org invitations; TTL via `INVITE_TTL_HOURS` (**D-028**) |

## Auth scaffold

- Cookie `spectre_sid` (HttpOnly, SameSite=Lax); DB stores SHA-256 of the opaque token only.
- CSRF (**W-014a**): login sets non-HttpOnly `spectre_csrf`; mutating requests need matching `X-CSRF-Token` + `WEB_ORIGIN` when Origin/Referer present. Global `CsrfGuard`. Production boot **requires** non-empty `WEB_ORIGIN`.
- `ACTOR_CONTEXT` comes from Session + live User/Membership checks — never from client `organizationId` / `userId`.
- Password hashing: argon2id.
- **OUT OF SCOPE:** MFA/SSO (**O-008**), public self-registration, recovery. Invitations HTTP is in scope (see Invitations above). Web login UI lives in `@spectre/web`.

## Client / Matter scaffold

- Endpoints (session required): `GET/POST /clients`, `GET/PATCH /clients/:id`, `GET/POST /matters`, `GET/PATCH /matters/:id`.
- `organizationId` is stamped from the actor only; body/header org is ignored.
- Matter `clientId` must belong to the same org (missing/foreign → identical `422 VALIDATION_ERROR`).
- `workspaceId` accepted without Workspace FK validation (**D-009**).
- Status values: `active` | `archived` (no hard delete in this slice).
- Access model: org-membership isolation via `@spectre/access` — **not** full `docs/07` ACL.

## Documents (Phase 3 + Phase 4 extract)

- `GET/POST /workspaces/:workspaceId/documents` — list / multipart `files` (≤10, PDF/DOCX/TXT, ≤25 МБ).
- `GET /documents/:id`, `GET /documents/:id/download` — metadata / binary; `storageKey` never in JSON.
- Access: Workspace `canReadContent` / `canMutateContent`; foreign workspace → `404`.
- Oversize upload is `413 PAYLOAD_TOO_LARGE`. Login and upload rate limits are `429 RATE_LIMITED`. An idempotency mismatch on chat send is `409 CONFLICT`.
- Storage: `LocalObjectStorage` under `DOCUMENT_STORAGE_ROOT` (default `.data/documents`) — local scaffold, not O-003 hoster.
- After upload+enqueue status → `processing`; worker (`pnpm --filter @spectre/api worker:ai`, queue `ai-jobs`) → `ready` / `processing_failed`. `worker:extract` and `worker:chat` are aliases of that dispatcher. Extract enqueue writes an outbox row in the same transaction as the AIJob; Redis publish is retried from that row. Transient extract errors are requeued through BullMQ backoff (max 3, **D-030**). A `running` extract whose `startedAt` is older than the 120s lease is reclaimed on the next delivery, or set to `timed_out` when attempts are spent, and the document leaves `processing`. Before that write, the worker re-checks the uploader's active organization membership and content-write role; a revoke fails the job with `ACL_REVOKED` and does not store extracted text. Chat uses the same membership re-check before publishing the assistant message. Parser exceptions are not stored as `timed_out`. The extract deadline does not kill the parser process. OCR success path still OPEN (**O-004**).

## Workspace scaffold (S3)

- Endpoints (session required): `GET/POST /workspaces`, `GET/PATCH /workspaces/:id`, members CRUD-lite, matter link/unlink.
- Create accepts **PERSONAL** (default) or **TEAM**; other `visibility` → `422`.
- Content list/read uses `WorkspaceAccess` (owner or TEAM member). Member management: Workspace owner or Org Admin (no auto content for Org Admin).
- Foreign/missing Workspace → identical `404`; foreign Matter on link → `422`.
- Org directory: `GET /organizations/:id/members` (same-org; SEC-01).
- Org roles: `PATCH /organizations/:id/members/:userId` — Owner sets `admin`|`member` only (not owner/self).
- **OUT:** ownership transfer, hard delete.

## Hard boundaries

- `POST /auth/login` and `GET /auth/me` return `organization: { id, name, role }` (name for shell chrome; not an access claim).
- No valid session → Clients / Matters / Workspaces / `/auth/me` return `401`.
- Session mutating without CSRF / bad Origin → `403 CSRF_REJECTED`.
- Foreign or missing Client/Matter/Workspace → identical `404 NOT_FOUND`.
- AI path uses only `@spectre/ai-gateway` Synthetic provider.

Full inventory: `docs/26-codebase-current-state.md`.

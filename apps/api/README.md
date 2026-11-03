# `@spectre/api`

NestJS HTTP API scaffold. Global prefix: `/api/v1`. Default port: `3000`.

## Prerequisites

- `docker compose up -d` (Postgres + Redis)
- `.env` from `.env.example` (`DATABASE_URL` + `DATABASE_URL_RUNTIME`)
- `pnpm --filter @spectre/db migrate:deploy` (creates `spectre_app` + tenant RLS)

## Run

```bash
pnpm --filter @spectre/api dev
pnpm --filter @spectre/api test
pnpm --filter @spectre/api build
```

E2e seeds organizations, clients, matters, users + memberships, a TEAM Workspace fixture, logs in via cookie, and asserts cross-org Client/Matter/Workspace → `404`, foreign `clientId`/`matterId` → `422`, and TEAM create → `422`.

On every GitHub pull request, the same suite runs in `.github/workflows/ci.yml` against a service Postgres (`pgvector/pgvector:pg16`) after `migrate:deploy`.

## Modules (AS-IS)

| Path | Role |
|---|---|
| `src/main.ts` | Bootstrap + `cookie-parser` |
| `src/app.module.ts` | Controllers + DI wiring |
| `src/db/` | Dual Prisma (`migrator` auth/seed, `runtime` + GUC); actor-scoped Client/Matter/Workspace stores |
| `src/workspaces/` | Prisma WorkspaceStore + HTTP list/create/get/patch, members, matter links (S3) |
| `src/health/` | Liveness |
| `src/auth/` | Login/logout/me, SessionService, REQUEST-scoped `ACTOR_CONTEXT`, `ActorGuard` |
| `src/clients/` | Client list/create/get/patch via Prisma + `ClientAccess` |
| `src/matters/` | Matter list/create/get/patch via Prisma + `MatterAccess` |
| `src/ai/` | Provider status + synthetic generate |
| `src/http/` | Uniform error JSON + shared middleware helper |
| `src/queue/` | BullMQ queue name/helpers; **no worker** |

## Auth scaffold

- Cookie `spectre_sid` (HttpOnly, SameSite=Lax); DB stores SHA-256 of the opaque token only.
- `ACTOR_CONTEXT` comes from Session + live User/Membership checks — never from client `organizationId` / `userId`.
- Password hashing: argon2id.
- **OUT OF SCOPE:** MFA/SSO (**O-008**), invitations, register, recovery, CSRF token. Web login UI lives in `@spectre/web` (Фаза 1).

## Client / Matter scaffold

- Endpoints (session required): `GET/POST /clients`, `GET/PATCH /clients/:id`, `GET/POST /matters`, `GET/PATCH /matters/:id`.
- `organizationId` is stamped from the actor only; body/header org is ignored.
- Matter `clientId` must belong to the same org (missing/foreign → identical `422 VALIDATION_ERROR`).
- `workspaceId` accepted without Workspace FK validation (**D-009**).
- Status values: `active` | `archived` (no hard delete in this slice).
- Access model: org-membership isolation via `@spectre/access` — **not** full `docs/07` ACL.

## Workspace scaffold (S3)

- Endpoints (session required): `GET/POST /workspaces`, `GET/PATCH /workspaces/:id`, members CRUD-lite, matter link/unlink.
- Create accepts **PERSONAL only** (`visibility: TEAM` → `422`); TEAM create deferred.
- Content list/read uses `WorkspaceAccess` (owner or TEAM member). Member management: Workspace owner or Org Admin (no auto content for Org Admin).
- Foreign/missing Workspace → identical `404`; foreign Matter on link → `422`.
- **OUT:** invitations, CSRF, Workspace UI, TEAM create policy, hard delete.

## Hard boundaries

- No valid session → Clients / Matters / Workspaces / `/auth/me` return `401`.
- Foreign or missing Client/Matter/Workspace → identical `404 NOT_FOUND`.
- AI path uses only `@spectre/ai-gateway` Synthetic provider.

Full inventory: `docs/26-codebase-current-state.md`.

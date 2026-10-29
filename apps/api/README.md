# `@spectre/api`

NestJS HTTP API scaffold. Global prefix: `/api/v1`. Default port: `3000`.

## Prerequisites

- `docker compose up -d` (Postgres + Redis)
- `.env` from `.env.example` (`DATABASE_URL`)
- `pnpm --filter @spectre/db migrate:deploy`

## Run

```bash
pnpm --filter @spectre/api dev
pnpm --filter @spectre/api test
pnpm --filter @spectre/api build
```

E2e seeds organizations, clients, matters, a user + membership, logs in via cookie, and asserts cross-org Client/Matter → `404` and foreign `clientId` on Matter → `422`.

## Modules (AS-IS)

| Path | Role |
|---|---|
| `src/main.ts` | Bootstrap + `cookie-parser` |
| `src/app.module.ts` | Controllers + DI wiring |
| `src/db/` | `PrismaService` from `@spectre/db` |
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
- **OUT OF SCOPE:** MFA/SSO (**O-008**), invitations, register, recovery, CSRF token, web login UI.

## Client / Matter scaffold

- Endpoints (session required): `GET/POST /clients`, `GET/PATCH /clients/:id`, `GET/POST /matters`, `GET/PATCH /matters/:id`.
- `organizationId` is stamped from the actor only; body/header org is ignored.
- Matter `clientId` must belong to the same org (missing/foreign → identical `422 VALIDATION_ERROR`).
- `workspaceId` accepted without Workspace FK validation (**D-009**).
- Status values: `active` | `archived` (no hard delete in this slice).
- Access model: org-membership isolation via `@spectre/access` — **not** full `docs/07` ACL.

## Hard boundaries

- No valid session → Clients / Matters / `/auth/me` return `401`.
- Foreign or missing Client/Matter → identical `404 NOT_FOUND`.
- AI path uses only `@spectre/ai-gateway` Synthetic provider.

Full inventory: `docs/26-codebase-current-state.md`.

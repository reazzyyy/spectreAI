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

E2e seeds organizations, matters, a user + membership, logs in via cookie, and asserts cross-org `GET /matters/:id` → `404`.

## Modules (AS-IS)

| Path | Role |
|---|---|
| `src/main.ts` | Bootstrap + `cookie-parser` |
| `src/app.module.ts` | Controllers + DI wiring |
| `src/db/` | `PrismaService` from `@spectre/db` |
| `src/health/` | Liveness |
| `src/auth/` | Login/logout/me, SessionService, REQUEST-scoped `ACTOR_CONTEXT`, `ActorGuard` |
| `src/matters/` | Read Matter via Prisma + `@spectre/access` |
| `src/ai/` | Provider status + synthetic generate |
| `src/http/` | Uniform error JSON + shared middleware helper |
| `src/queue/` | BullMQ queue name/helpers; **no worker** |

## Auth scaffold

- Cookie `spectre_sid` (HttpOnly, SameSite=Lax); DB stores SHA-256 of the opaque token only.
- `ACTOR_CONTEXT` comes from Session + live User/Membership checks — never from client `organizationId` / `userId`.
- Password hashing: argon2id.
- **OUT OF SCOPE:** MFA/SSO (**O-008**), invitations, register, recovery, CSRF token, web login UI.

## Hard boundaries

- No valid session → Matters / `/auth/me` return `401`.
- Matter reads use Postgres through `@spectre/db`; organization isolation is enforced by `MatterAccess` (foreign/missing → identical `NOT_FOUND`).
- AI path uses only `@spectre/ai-gateway` Synthetic provider.

Full inventory: `docs/26-codebase-current-state.md`.

# `@spectre/db`

Prisma 7 schema, migrations, and runtime client factory for the scaffold data subset (**D-009** + auth scaffold).

## Models in schema

`Organization`, `Client`, `Matter`, `User`, `OrganizationMembership`, `Session`.

- `Matter.workspaceId` optional, **no FK** until Workspace exists.
- Matter→Client FK is composite on `(organizationId, clientId)`.
- `Session` is the DB form of `AuthSession` in `docs/12` (scaffold subset); stores `organizationId` bound at login for `ACTOR_CONTEXT`.
- No Document, AIJob, Audit, Invitation, or MFA/SSO models (**O-008** out of scope).

## Public API

- `createPrismaClient(databaseUrl?)` — Prisma 7 client with `@prisma/adapter-pg` (default URL from `DATABASE_URL` or local compose).
- Re-exports: `PrismaClient`, `Prisma`, model types.

## Commands

```bash
pnpm --filter @spectre/db validate
pnpm --filter @spectre/db generate
# when Postgres from docker-compose is up:
pnpm --filter @spectre/db migrate:deploy
```

Config: `prisma.config.ts` (URL from `DATABASE_URL`).  
Generated client: `src/generated` (do not hand-edit).

**Consumers:** `@spectre/api` uses this client for Matter reads and session auth.

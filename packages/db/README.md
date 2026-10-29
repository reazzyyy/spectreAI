# `@spectre/db`

Prisma 7 schema, migrations, and runtime client factory for the scaffold data subset (**D-009**).

## Models in schema

`Organization`, `Client`, `Matter` only.

- `Matter.workspaceId` optional, **no FK** until Workspace exists.
- Matter→Client FK is composite on `(organizationId, clientId)`.
- No User, Membership, Document, AIJob, or Audit models yet.

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

**Consumers:** `@spectre/api` injects this client for `GET /matters/:matterId` via `PrismaService`.

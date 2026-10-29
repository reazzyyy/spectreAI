# `@spectre/db`

Prisma 7 schema and migrations for the scaffold data subset (**D-009**).

## Models in schema

`Organization`, `Client`, `Matter` only.

- `Matter.workspaceId` optional, **no FK** until Workspace exists.
- Matter→Client FK is composite on `(organizationId, clientId)`.
- No User, Membership, Document, AIJob, or Audit models yet.

## Commands

```bash
pnpm --filter @spectre/db validate
pnpm --filter @spectre/db generate
# when Postgres from docker-compose is up:
pnpm --filter @spectre/db exec prisma migrate dev
```

Config: `prisma.config.ts` (URL from `DATABASE_URL`).  
Generated client: `src/generated` (do not hand-edit).

**Note:** `@spectre/api` does not yet inject this client for Matter reads.

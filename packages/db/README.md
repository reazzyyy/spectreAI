# `@spectre/db`

Prisma 7 schema, migrations, and runtime client factory (**D-009**, auth scaffold, Workspace S1).

## Models in schema

`Organization`, `Client`, `Matter`, `User`, `OrganizationMembership`, `Session`,  
`Workspace`, `WorkspaceMember`, `WorkspaceMatter`.

- Workspace PERSONAL/TEAM (**W-002**); Matter link via `WorkspaceMatter` M:N (**W-003**).
- `Matter.workspaceId` optional legacy, **no FK** — prefer join table; drop later after backfill.
- Matter→Client and Workspace→Client FKs are composite on `(organizationId, clientId)`.
- No Document, AIJob, Audit, Invitation, Chat, or MFA/SSO models yet.

## Public API

- `createPrismaClient({ purpose: "migrator" | "runtime" })` — Prisma 7 + `@prisma/adapter-pg`.
  - **migrator** (`DATABASE_URL`): migrate, seed, auth bootstrap.
  - **runtime** (`DATABASE_URL_RUNTIME`): Nest tenant queries under RLS.
- `withActorContext(prisma, actor, fn)` — interactive tx + `set_config` for `app.current_*` GUC.
- Re-exports: `PrismaClient`, `Prisma`, model types, Workspace enums.

## RLS (S1)

Tenant-boundary policies (`organization_id` = GUC) + `FORCE ROW LEVEL SECURITY` on:  
`clients`, `matters`, `organization_memberships`, `workspaces`, `workspace_members`, `workspace_matters`.

Runtime role `spectre_app` (no BYPASSRLS). **Incomplete W-020:** workspace-membership / chat / grant policies come in later slices — AS-IS must not claim full RLS.

Auth still uses migrator URL until SECURITY DEFINER helpers (S0 §6).

## Commands

```bash
pnpm --filter @spectre/db validate
pnpm --filter @spectre/db generate
# Postgres up (docker compose):
pnpm --filter @spectre/db migrate:deploy
pnpm --filter @spectre/db test   # validate + RLS harness (skips if DB down)
```

Config: `prisma.config.ts` (migrate URL from `DATABASE_URL`).  
Generated client: `src/generated` (do not hand-edit).

**Consumers:** `@spectre/api` (migrator for auth; runtime + GUC for Client/Matter).

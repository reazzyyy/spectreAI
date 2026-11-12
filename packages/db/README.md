# `@spectre/db`

Prisma 7 schema, migrations, and runtime client factory (**D-009**, Workspace, documents, AIJob extract, Phase 5A-1 chat foundation).

## Models in schema

`Organization`, `Client`, `Matter`, `User`, `OrganizationMembership`, `Session`,  
`Workspace`, `WorkspaceMember`, `WorkspaceMatter`, `Document`, `OrganizationInvitation`,  
`AiJob`, `DocumentExtraction`, `AuditEvent`, `Conversation`, `Message`, `AiGeneration`, `OutboxEvent`.

- Workspace PERSONAL/TEAM (**W-002**); Matter link via `WorkspaceMatter` M:N (**W-003**).
- `Matter.workspaceId` optional legacy, **no FK** — prefer join table; drop later after backfill.
- Matter→Client and Workspace→Client FKs are composite on `(organizationId, clientId)`.
- Document metadata (Phase 3 thin); binary in private storage by `storageKey`.
- Chat (Phase 5A-1/5A-2): Conversation PRIVATE/WORKSPACE, Message, AiGeneration, OutboxEvent scaffold (JOB-012 remains OPEN); no ContextSnapshot yet.
- No grant, DocumentVersion, or MFA/SSO models yet.

## Public API

- `createPrismaClient({ purpose: "migrator" | "runtime" })` — Prisma 7 + `@prisma/adapter-pg`.
  - **migrator** (`DATABASE_URL`): migrate, seed, auth bootstrap.
  - **runtime** (`DATABASE_URL_RUNTIME`): Nest tenant queries under RLS.
- `withActorContext(prisma, actor, fn)` — interactive tx + `set_config` for `app.current_*` GUC.
- Re-exports: `PrismaClient`, `Prisma`, model types, Workspace / Document / Chat enums.

## RLS

Tenant-boundary policies (`organization_id` = GUC) + `FORCE ROW LEVEL SECURITY` on:  
`clients`, `matters`, `organization_memberships`, `workspaces`, `workspace_members`, `workspace_matters`,  
`documents` (org + workspace owner/active member),  
`conversations` (org + workspace access + PRIVATE owner / WORKSPACE shared),  
`messages` / `ai_generations` (via parent conversation EXISTS under same RLS),  
`outbox_events` (org GUC),  
`ai_jobs`, `document_extractions`, `audit_events`, `organization_invitations`.

Runtime role `spectre_app` (no BYPASSRLS). **Incomplete W-020:** grant policies and full `docs/07` matrix still later — AS-IS must not claim full RLS. NestJS authz is not replaced by RLS.

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

**Consumers:** `@spectre/api` (migrator for auth; runtime + GUC for tenant queries).

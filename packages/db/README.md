# `@spectre/db`

Prisma 7 schema, migrations, and runtime client factory (**D-009**, Workspace, documents, AIJob extract, Phase 5A-1 chat foundation).

## Models in schema

`Organization`, `Client`, `Matter`, `User`, `OrganizationMembership`, `Session`,  
`Workspace`, `WorkspaceMember`, `WorkspaceMatter`, `Document`, `OrganizationInvitation`,  
`AiJob`, `DocumentVersion`, `DocumentExtraction`, `AuditEvent`, `Conversation`, `Message`, `AiGeneration`, `OutboxEvent`,  
`ContextSnapshot`, `ContextSnapshotItem`, `MessageSource`.

- Workspace PERSONAL/TEAM (**W-002**); Matter link via `WorkspaceMatter` M:N (**W-003**).
- `Matter.workspaceId` optional legacy, **no FK** — prefer join table; drop later after backfill.
- Matter→Client and Workspace→Client FKs are composite on `(organizationId, clientId)`.
- Document metadata (Phase 3 thin); binary in private storage by `storageKey`.
- Chat (Phase 5A–5B): Conversation, Message, AiGeneration, OutboxEvent scaffold, ContextSnapshot conversation_only + MessageSource. Partial unique index: one assistant message per generation.
- DocumentVersion (Phase 6A): immutable file version 1 on upload; extraction binds `documentVersionId`. `searchEligible` stays false until a later FTS slice (**D-033**, **D-034**).
- No grant or MFA/SSO models yet. JOB-012 / CTX-* remain OPEN in the journal.

## Public API

- `createPrismaClient({ purpose: "migrator" | "runtime" })` — Prisma 7 + `@prisma/adapter-pg`.
  - **migrator** (`DATABASE_URL`): migrate, seed, auth bootstrap.
  - **runtime** (`DATABASE_URL_RUNTIME`): Nest tenant queries under RLS. Does not fall back to `DATABASE_URL`. Production must set it; startup rejects a superuser, BYPASSRLS, or table-owner role.
- `withActorContext(prisma, actor, fn)` — interactive tx + `set_config` for `app.current_*` GUC.
- Re-exports: `PrismaClient`, `Prisma`, model types, Workspace / Document / Chat enums.

## RLS

Tenant-boundary policies (`organization_id` = GUC) + `FORCE ROW LEVEL SECURITY` on:  
`clients`, `matters`, `organization_memberships`, `workspaces`, `workspace_members`, `workspace_matters`,  
`documents` (org + workspace owner/active member), `document_versions` (via parent document),  
`conversations` (org + workspace access + PRIVATE owner / WORKSPACE shared),  
`messages` / `ai_generations` (via parent conversation EXISTS under same RLS),  
`context_snapshots` / `context_snapshot_items` / `message_sources` (via conversation/message ACL),  
`outbox_events` (org GUC),  
`ai_jobs`, `document_extractions`, `audit_events` (SELECT/INSERT for the current org only; `system_event` rows are hidden from every tenant; no UPDATE/DELETE), `organization_invitations`,  
`users` (self or membership in the current org), `sessions` (own user in the current org), `organizations` (own org id).

Runtime role `spectre_app` (no BYPASSRLS). It has no INSERT/UPDATE/DELETE on `users`, `sessions`, or `organizations`, and cannot SELECT `password_hash` or `token_hash`. It cannot UPDATE or DELETE `audit_events`. New tables no longer receive UPDATE/DELETE from default privileges; a migration must grant those explicitly. **Incomplete W-020:** grant policies and full `docs/07` matrix still later — AS-IS must not claim full RLS. NestJS authz is not replaced by RLS.

Login, session resolve, invites, and bootstrap still use the migrator URL. The local migrator is superuser and bypasses FORCE RLS. Replacing that path is S5 (narrow auth role or `SECURITY DEFINER` with a fixed `search_path`).

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

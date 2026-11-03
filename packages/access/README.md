# `@spectre/access`

Organization-scoped Client/Matter access policy (scaffold). Used by the API so a foreign or missing record becomes `null` (mapped to identical `NOT_FOUND`).

**Scope:** isolation by actor `organizationId` (active membership). This is **not** the full `docs/07` ACL / Workspace matrix.

## Public API

- `ClientRecord` / `ClientStore` / `ClientAccess` — read, list, create, update for organization
- `MatterRecord` / `MatterStore` / `MatterAccess` — read, list, create, update for organization

## Rules encoded here

- Actor organization comes from the **server**, not from the client body.
- Create always stamps `organizationId` from the actor.
- Update/read of another org’s id → `null` (no leak of the other tenant’s fields).
- Hard delete is intentionally out of this package (first CRUD slice = CRU + list).
- `workspaceId` may be set without validating Workspace existence (**D-009**, no FK yet).

```bash
pnpm --filter @spectre/access test
```

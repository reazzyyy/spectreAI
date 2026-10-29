# `@spectre/access`

Organization-scoped Matter read policy. Used by the API so a foreign or missing Matter becomes `null` (mapped to identical `NOT_FOUND`).

## Public API

- `MatterRecord` — id, organizationId, title, clientId, workspaceId
- `MatterStore.findById`
- `MatterAccess.readForOrganization(actorOrganizationId, matterId)`

## Rules encoded here

- Actor organization comes from the **server**, not from the client body.
- Wrong org or unknown id → `null` (no leak of the other tenant’s fields).

```bash
pnpm --filter @spectre/access test
```

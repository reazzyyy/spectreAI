# `@spectre/access`

Server-side access policy for Client/Matter (org isolation) and Workspace ACL (**W-001–W-008**).

Foreign or missing records → `null` (HTTP maps to identical `NOT_FOUND`).

## Public API

- `ClientRecord` / `ClientStore` / `ClientAccess` — org-scoped CRU+list
- `MatterRecord` / `MatterStore` / `MatterAccess` — org-scoped CRU+list
- `WorkspaceRecord` / `WorkspaceStore` / `WorkspaceAccess` — content vs member-management

## Workspace rules (S2)

- Actor comes from the **server** (`WorkspaceActor`: userId, organizationId, orgRole).
- **Content:** PERSONAL → owner only; TEAM → owner or active EDITOR/VIEWER member.
- **Org Admin does not read content** via these helpers (admin grant is a later slice).
- **Member management:** Workspace Owner **or** Org Owner/Admin (`W-008`) — without implying content read.
- **Create:** PERSONAL only in this phase (TEAM create deferred).
- Cannot attach membership to Workspace owner; cannot manage members on PERSONAL.
- VIEWER cannot mutate content; EDITOR/OWNER can (`canMutateContent`).

```bash
pnpm --filter @spectre/access test
```

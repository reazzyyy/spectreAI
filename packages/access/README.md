# `@spectre/access`

Server-side access policy for Client/Matter (org isolation), Workspace ACL (**W-001–W-008**), Document metadata org isolation (Phase 3), and Conversation ACL (Phase 5A-1 / **W-007**).

Foreign or missing records → `null` (HTTP maps to identical `NOT_FOUND`).

## Public API

- `ClientRecord` / `ClientStore` / `ClientAccess` — org-scoped CRU+list
- `MatterRecord` / `MatterStore` / `MatterAccess` — org-scoped CRU+list
- `WorkspaceRecord` / `WorkspaceStore` / `WorkspaceAccess` — content vs member-management
- `DocumentRecord` / `DocumentStore` / `DocumentAccess` — org-scoped create/list/read; callers apply Workspace content ACL first. Hard delete is only `uploading`. A persisted document becomes unreadable only when a different user id is supplied (`DeletionConfirmationRequiredError` otherwise). That id is not a role check; the confirmer matrix is Phase 10 (**D-038** / **D-039**).
- `ConversationRecord` / `ConversationStore` / `ConversationAccess` — PRIVATE/WORKSPACE chat ACL on top of Workspace content role; Org Admin ≠ content
- `isActiveOrganizationMembership` / `mayMutateWorkspaceContent` — worker re-check before a delayed chat or extract commit. Revoked organization membership is not active. Content write is owner or editor.

## Workspace rules (S2)

- Actor comes from the **server** (`WorkspaceActor`: userId, organizationId, orgRole).
- **Content:** PERSONAL → owner only; TEAM → owner or active EDITOR/VIEWER member.
- **Org Admin does not read content** via these helpers (admin grant is a later slice).
- **Member management:** Workspace Owner **or** Org Owner/Admin (`W-008`) — without implying content read. A content role cannot be given to the actor, another org owner/admin, or anyone who is not an active member of the same organization (**D-037**). The last case throws `WorkspaceMemberTargetError` (HTTP 422).
- **Create:** PERSONAL (default) or TEAM (**W-002**).
- Cannot attach membership to Workspace owner; cannot manage members on PERSONAL.
- VIEWER cannot mutate content; EDITOR/OWNER can (`canMutateContent`).

```bash
pnpm --filter @spectre/access test
```

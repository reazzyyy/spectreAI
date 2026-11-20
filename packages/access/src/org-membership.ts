/**
 * Organization membership still admits the actor.
 * Workspace role is checked separately. Missing or revoked is not active.
 * Workers re-check this at final commit: a job queued while the user was
 * active must not publish after the membership is revoked.
 */
export function isActiveOrganizationMembership(
  status: string | null | undefined,
): boolean {
  return status === "active";
}

/** Content write is owner or editor. Viewer and missing role cannot publish a worker result. */
export function mayMutateWorkspaceContent(
  role: "OWNER" | "EDITOR" | "VIEWER" | null,
): boolean {
  return role === "OWNER" || role === "EDITOR";
}

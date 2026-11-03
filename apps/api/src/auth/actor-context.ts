export const ACTOR_CONTEXT = "spectre.actor";

export type ActorOrgRole = "owner" | "admin" | "member";

/**
 * Authenticated actor for protected routes.
 * Must be derived from a server session (+ live membership), never from client-supplied ids.
 */
export interface ActorContext {
  organizationId: string;
  userId: string;
  /** OrganizationMembership.role — used for Workspace member-management without content (W-008). */
  orgRole: ActorOrgRole;
}

export const ACTOR_CONTEXT = "spectre.actor";

/**
 * Authenticated actor for protected routes.
 * Must be derived from a server session (+ live membership), never from client-supplied ids.
 */
export interface ActorContext {
  organizationId: string;
  userId: string;
}

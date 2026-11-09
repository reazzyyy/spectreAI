import { apiRequest } from "@/shared/api";
import type {
  AcceptInvitationInput,
  AcceptInvitationResult,
  CreateInvitationInput,
  Invitation,
  InvitationListResponse,
} from "../model/types";

function orgInvitesPath(organizationId: string, suffix = ""): string {
  return `/organizations/${encodeURIComponent(organizationId)}/invitations${suffix}`;
}

/** GET /organizations/:orgId/invitations — owner only. */
export function listInvitations(
  organizationId: string,
): Promise<InvitationListResponse> {
  return apiRequest<InvitationListResponse>(orgInvitesPath(organizationId), {
    method: "GET",
  });
}

/** POST /organizations/:orgId/invitations — owner only. */
export function createInvitation(
  organizationId: string,
  input: CreateInvitationInput,
): Promise<Invitation> {
  return apiRequest<Invitation>(orgInvitesPath(organizationId), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** POST …/invitations/:id/resend — owner only. */
export function resendInvitation(
  organizationId: string,
  invitationId: string,
): Promise<Invitation> {
  return apiRequest<Invitation>(
    orgInvitesPath(organizationId, `/${encodeURIComponent(invitationId)}/resend`),
    { method: "POST" },
  );
}

/** DELETE …/invitations/:id — owner only. */
export function revokeInvitation(
  organizationId: string,
  invitationId: string,
): Promise<Invitation> {
  return apiRequest<Invitation>(
    orgInvitesPath(organizationId, `/${encodeURIComponent(invitationId)}`),
    { method: "DELETE" },
  );
}

/** POST /invitations/accept — new user + password, or logged-in matching email. */
export function acceptInvitation(
  input: AcceptInvitationInput,
): Promise<AcceptInvitationResult> {
  const body: AcceptInvitationInput = { token: input.token };
  if (input.password !== undefined && input.password.length > 0) {
    body.password = input.password;
  }
  return apiRequest<AcceptInvitationResult>("/invitations/accept", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

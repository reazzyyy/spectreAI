/** Org invitation from GET/POST …/invitations (S4c). */
export type InvitableRole = "admin" | "member";

export type Invitation = {
  id: string;
  organizationId: string;
  emailNormalized: string;
  role: InvitableRole;
  invitedByUserId: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  lastSentAt: string | null;
  sendCount: number;
  /** Dev-only outbox substitute — never log. */
  devToken?: string;
};

export type InvitationListResponse = {
  items: Invitation[];
};

export type CreateInvitationInput = {
  email: string;
  role: InvitableRole;
};

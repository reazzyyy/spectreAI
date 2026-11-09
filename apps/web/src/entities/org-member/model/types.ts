/** Org membership row from GET …/organizations/:id/members (SEC-01). */
export type OrgMemberRole = "owner" | "admin" | "member";
export type OrgMemberStatus = "active" | "revoked";

export type OrgMember = {
  userId: string;
  email: string;
  role: OrgMemberRole;
  status: OrgMemberStatus;
  userStatus: string;
};

export type OrgMemberListResponse = {
  items: OrgMember[];
};

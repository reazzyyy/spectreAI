import { apiRequest } from "@/shared/api";
import type {
  OrgMember,
  OrgMemberListResponse,
  UpdateOrgMemberRoleInput,
} from "../model/types";

/** GET /organizations/:orgId/members — same-org directory. */
export function listOrgMembers(
  organizationId: string,
): Promise<OrgMemberListResponse> {
  return apiRequest<OrgMemberListResponse>(
    `/organizations/${encodeURIComponent(organizationId)}/members`,
    { method: "GET" },
  );
}

/** PATCH /organizations/:orgId/members/:userId — owner sets admin|member. */
export function updateOrgMemberRole(
  organizationId: string,
  userId: string,
  input: UpdateOrgMemberRoleInput,
): Promise<OrgMember> {
  return apiRequest<OrgMember>(
    `/organizations/${encodeURIComponent(organizationId)}/members/${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

import { apiRequest } from "@/shared/api";
import type { OrgMemberListResponse } from "../model/types";

/** GET /organizations/:orgId/members — same-org directory. */
export function listOrgMembers(
  organizationId: string,
): Promise<OrgMemberListResponse> {
  return apiRequest<OrgMemberListResponse>(
    `/organizations/${encodeURIComponent(organizationId)}/members`,
    { method: "GET" },
  );
}

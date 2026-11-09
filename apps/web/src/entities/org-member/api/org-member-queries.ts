import { queryOptions } from "@tanstack/react-query";
import { listOrgMembers } from "./org-member-api";

/** Query key + options for org member directory. */
export function orgMembersListQueryOptions(organizationId: string) {
  return queryOptions({
    queryKey: ["org-members", "list", organizationId] as const,
    queryFn: () => listOrgMembers(organizationId),
    enabled: organizationId.length > 0,
  });
}

import { queryOptions } from "@tanstack/react-query";
import { listInvitations } from "./invitation-api";

/** Query key + options for org invitation list. */
export function invitationsListQueryOptions(organizationId: string) {
  return queryOptions({
    queryKey: ["invitations", "list", organizationId] as const,
    queryFn: () => listInvitations(organizationId),
    enabled: organizationId.length > 0,
  });
}

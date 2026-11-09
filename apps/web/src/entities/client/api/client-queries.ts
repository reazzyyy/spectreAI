import { queryOptions } from "@tanstack/react-query";
import { fetchClient, listClients } from "./client-api";

/** Query key + options for GET /clients. */
export const clientsListQueryOptions = queryOptions({
  queryKey: ["clients", "list"] as const,
  queryFn: listClients,
});

/** Query key + options for GET /clients/:id. */
export function clientDetailQueryOptions(clientId: string) {
  return queryOptions({
    queryKey: ["clients", "detail", clientId] as const,
    queryFn: () => fetchClient(clientId),
    enabled: clientId.length > 0,
  });
}

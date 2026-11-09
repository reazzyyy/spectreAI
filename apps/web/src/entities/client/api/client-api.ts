import { apiRequest } from "@/shared/api";
import type {
  Client,
  ClientListResponse,
  CreateClientInput,
  UpdateClientInput,
} from "../model/types";

/** GET /clients — org-scoped list. */
export function listClients(): Promise<ClientListResponse> {
  return apiRequest<ClientListResponse>("/clients", { method: "GET" });
}

/** GET /clients/:id — foreign/missing → API 404. */
export function fetchClient(clientId: string): Promise<Client> {
  return apiRequest<Client>(`/clients/${encodeURIComponent(clientId)}`, {
    method: "GET",
  });
}

/** POST /clients — creates Client in the session organization. */
export function createClient(input: CreateClientInput): Promise<Client> {
  return apiRequest<Client>("/clients", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** PATCH /clients/:id — name/status. */
export function updateClient(
  clientId: string,
  input: UpdateClientInput,
): Promise<Client> {
  return apiRequest<Client>(`/clients/${encodeURIComponent(clientId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

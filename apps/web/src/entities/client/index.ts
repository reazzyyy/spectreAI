export type {
  Client,
  ClientListResponse,
  CreateClientInput,
  UpdateClientInput,
} from "./model/types";
export {
  listClients,
  fetchClient,
  createClient,
  updateClient,
} from "./api/client-api";
export {
  clientsListQueryOptions,
  clientDetailQueryOptions,
} from "./api/client-queries";

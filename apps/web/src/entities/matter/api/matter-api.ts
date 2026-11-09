import { apiRequest } from "@/shared/api";
import type {
  CreateMatterInput,
  Matter,
  MatterListResponse,
  UpdateMatterInput,
} from "../model/types";

/** GET /matters — org-scoped list for the session actor. */
export function listMatters(): Promise<MatterListResponse> {
  return apiRequest<MatterListResponse>("/matters", { method: "GET" });
}

/** GET /matters/:id — foreign/missing → API 404. */
export function fetchMatter(matterId: string): Promise<Matter> {
  return apiRequest<Matter>(`/matters/${encodeURIComponent(matterId)}`, {
    method: "GET",
  });
}

/** POST /matters — creates Matter in the session organization. */
export function createMatter(input: CreateMatterInput): Promise<Matter> {
  return apiRequest<Matter>("/matters", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** PATCH /matters/:id — title/status/client/workspace. */
export function updateMatter(
  matterId: string,
  input: UpdateMatterInput,
): Promise<Matter> {
  return apiRequest<Matter>(`/matters/${encodeURIComponent(matterId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

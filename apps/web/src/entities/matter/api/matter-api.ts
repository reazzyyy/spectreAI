import { apiRequest } from "@/shared/api";
import type { MatterListResponse } from "../model/types";

/** GET /matters — org-scoped list for the session actor. */
export function listMatters(): Promise<MatterListResponse> {
  return apiRequest<MatterListResponse>("/matters", { method: "GET" });
}

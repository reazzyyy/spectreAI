import { apiRequest } from "@/shared/api";
import type {
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  Workspace,
  WorkspaceListResponse,
} from "../model/types";

/** GET /workspaces — content-visible list for the session actor. */
export function listWorkspaces(): Promise<WorkspaceListResponse> {
  return apiRequest<WorkspaceListResponse>("/workspaces", { method: "GET" });
}

/** GET /workspaces/:id — content ACL; foreign/missing → API 404. */
export function fetchWorkspace(workspaceId: string): Promise<Workspace> {
  return apiRequest<Workspace>(`/workspaces/${encodeURIComponent(workspaceId)}`, {
    method: "GET",
  });
}

/** POST /workspaces — creates PERSONAL workspace (TEAM rejected by API). */
export function createWorkspace(input: CreateWorkspaceInput): Promise<Workspace> {
  return apiRequest<Workspace>("/workspaces", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** PATCH /workspaces/:id — owner rename/description (WS-04/WS-05). */
export function updateWorkspace(
  workspaceId: string,
  input: UpdateWorkspaceInput,
): Promise<Workspace> {
  return apiRequest<Workspace>(`/workspaces/${encodeURIComponent(workspaceId)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

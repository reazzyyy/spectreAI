import { apiRequest } from "@/shared/api";
import type {
  CreateWorkspaceInput,
  Workspace,
  WorkspaceListResponse,
} from "../model/types";

/** GET /workspaces — content-visible list for the session actor. */
export function listWorkspaces(): Promise<WorkspaceListResponse> {
  return apiRequest<WorkspaceListResponse>("/workspaces", { method: "GET" });
}

/** POST /workspaces — creates PERSONAL workspace (TEAM rejected by API). */
export function createWorkspace(input: CreateWorkspaceInput): Promise<Workspace> {
  return apiRequest<Workspace>("/workspaces", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

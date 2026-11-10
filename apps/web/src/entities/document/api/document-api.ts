import { apiRequest } from "@/shared/api";
import type { Document, DocumentListResponse } from "../model/types";

/** GET /workspaces/:id/documents — content-visible workspace only. */
export function listWorkspaceDocuments(
  workspaceId: string,
): Promise<DocumentListResponse> {
  return apiRequest<DocumentListResponse>(
    `/workspaces/${encodeURIComponent(workspaceId)}/documents`,
    { method: "GET" },
  );
}

/** GET /documents/:id */
export function fetchDocument(documentId: string): Promise<Document> {
  return apiRequest<Document>(
    `/documents/${encodeURIComponent(documentId)}`,
    { method: "GET" },
  );
}

/**
 * POST multipart /workspaces/:id/documents field `files` (≤10, PDF/DOCX/TXT).
 * Uses FormData so the browser sets multipart boundary (no JSON Content-Type).
 */
export function uploadWorkspaceDocuments(
  workspaceId: string,
  files: File[],
): Promise<DocumentListResponse> {
  const body = new FormData();
  for (const file of files) {
    body.append("files", file);
  }
  return apiRequest<DocumentListResponse>(
    `/workspaces/${encodeURIComponent(workspaceId)}/documents`,
    { method: "POST", body },
  );
}

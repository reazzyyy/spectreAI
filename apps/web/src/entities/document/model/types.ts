/** Document metadata DTO from Nest (Phase 3 thin; no storageKey). */
export interface Document {
  id: string;
  organizationId: string;
  workspaceId: string;
  title: string;
  status: string;
  originalFileName: string;
  mimeType: string;
  byteSize: number;
  checksumSha256: string;
  uploadedByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentListResponse {
  items: Document[];
}

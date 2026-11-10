-- Phase 3 thin: Document metadata + tenant RLS (org GUC only; W-020 workspace policies later).

CREATE TYPE "document_status" AS ENUM (
  'uploaded',
  'processing',
  'ready',
  'processing_failed',
  'archived',
  'deletion_pending',
  'deleted'
);

CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "status" "document_status" NOT NULL DEFAULT 'uploaded',
    "original_file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "checksum_sha256" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "uploaded_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "documents_organization_id_id_key" ON "documents"("organization_id", "id");
CREATE INDEX "documents_organization_id_workspace_id_created_at_idx" ON "documents"("organization_id", "workspace_id", "created_at");
CREATE INDEX "documents_organization_id_status_idx" ON "documents"("organization_id", "status");

ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_workspace_id_fkey" FOREIGN KEY ("organization_id", "workspace_id") REFERENCES "workspaces"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "documents" TO spectre_app;

ALTER TABLE "documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "documents" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS documents_tenant_isolation ON "documents";
CREATE POLICY documents_tenant_isolation ON "documents"
  FOR ALL
  USING (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  )
  WITH CHECK (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  );

-- Phase 6A: immutable DocumentVersion. search_eligible stays false (D-033/D-034).
-- Expand only: Document file columns remain. Extraction gains a required version binding.

CREATE TABLE "document_versions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "original_file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "checksum_sha256" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "uploaded_by_user_id" UUID NOT NULL,
    "search_eligible" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_versions_document_id_version_number_key"
  ON "document_versions"("document_id", "version_number");
CREATE UNIQUE INDEX "document_versions_organization_id_id_key"
  ON "document_versions"("organization_id", "id");
CREATE INDEX "document_versions_organization_id_document_id_idx"
  ON "document_versions"("organization_id", "document_id");

ALTER TABLE "document_versions"
  ADD CONSTRAINT "document_versions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_versions"
  ADD CONSTRAINT "document_versions_organization_id_document_id_fkey"
  FOREIGN KEY ("organization_id", "document_id") REFERENCES "documents"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_versions"
  ADD CONSTRAINT "document_versions_uploaded_by_user_id_fkey"
  FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "document_versions" (
    "id",
    "organization_id",
    "document_id",
    "version_number",
    "original_file_name",
    "mime_type",
    "byte_size",
    "checksum_sha256",
    "storage_key",
    "uploaded_by_user_id",
    "search_eligible",
    "created_at"
)
SELECT
    gen_random_uuid(),
    "organization_id",
    "id",
    1,
    "original_file_name",
    "mime_type",
    "byte_size",
    "checksum_sha256",
    "storage_key",
    "uploaded_by_user_id",
    false,
    "created_at"
FROM "documents";

ALTER TABLE "documents" ADD COLUMN "current_version_id" UUID;

UPDATE "documents" AS d
SET "current_version_id" = v."id"
FROM "document_versions" AS v
WHERE v."document_id" = d."id"
  AND v."version_number" = 1;

ALTER TABLE "documents"
  ADD CONSTRAINT "documents_current_version_id_fkey"
  FOREIGN KEY ("current_version_id") REFERENCES "document_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "documents_current_version_id_key" ON "documents"("current_version_id");

ALTER TABLE "document_extractions" ADD COLUMN "document_version_id" UUID;

UPDATE "document_extractions" AS e
SET "document_version_id" = d."current_version_id"
FROM "documents" AS d
WHERE d."id" = e."document_id";

ALTER TABLE "document_extractions" ALTER COLUMN "document_version_id" SET NOT NULL;
CREATE UNIQUE INDEX "document_extractions_document_version_id_key"
  ON "document_extractions"("document_version_id");
ALTER TABLE "document_extractions"
  ADD CONSTRAINT "document_extractions_document_version_id_fkey"
  FOREIGN KEY ("document_version_id") REFERENCES "document_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "document_versions" TO spectre_app;

ALTER TABLE "document_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_versions" FORCE ROW LEVEL SECURITY;
CREATE POLICY document_versions_workspace_isolation ON "document_versions"
  FOR ALL
  USING (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM "documents" d
      WHERE d.id = "document_versions"."document_id"
        AND d.organization_id = "document_versions"."organization_id"
    )
  )
  WITH CHECK (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM "documents" d
      WHERE d.id = "document_versions"."document_id"
        AND d.organization_id = "document_versions"."organization_id"
    )
  );

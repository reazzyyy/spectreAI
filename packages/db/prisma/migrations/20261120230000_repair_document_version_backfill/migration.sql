-- Phase 6A backfill ran while FORCE RLS was already on documents.
-- A non-superuser table owner then sees zero rows, so version 1 was skipped
-- and current_version_id stayed null. Local CI uses a superuser and hid this.
-- Re-run the copy with row_security off. Idempotent: existing version 1 is kept.
-- search_eligible stays false (D-033 / D-034).

SET LOCAL row_security = off;

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
    d."organization_id",
    d."id",
    1,
    d."original_file_name",
    d."mime_type",
    d."byte_size",
    d."checksum_sha256",
    d."storage_key",
    d."uploaded_by_user_id",
    false,
    d."created_at"
FROM "documents" AS d
WHERE NOT EXISTS (
    SELECT 1
    FROM "document_versions" AS v
    WHERE v."document_id" = d."id"
      AND v."version_number" = 1
);

UPDATE "documents" AS d
SET "current_version_id" = v."id"
FROM "document_versions" AS v
WHERE v."document_id" = d."id"
  AND v."version_number" = 1
  AND d."current_version_id" IS NULL;

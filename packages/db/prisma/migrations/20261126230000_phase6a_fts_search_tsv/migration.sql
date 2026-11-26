-- Phase 6A-0: Russian FTS vector on extracted text (D-018 / D-034).
-- The column is GENERATED so Prisma does not write it and a later schema diff
-- must not drop it by accident. Search still stays off until search_eligible
-- is set by a later publish job (D-033). No new table and no extra GRANT:
-- document_extractions already has FORCE RLS, and the parent documents policy
-- hides the row from a user who cannot read that document.
--
-- Prefix cap: a STORED tsvector larger than about 1 MB aborts the extract
-- UPDATE. Files may be 25 MB (D-010), so only the first 200000 characters are
-- indexed. The full text_content stays on the row.

ALTER TABLE "document_extractions"
  ADD COLUMN IF NOT EXISTS "search_tsv" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('russian', left(coalesce("text_content", ''), 200000))
  ) STORED;

CREATE INDEX IF NOT EXISTS "document_extractions_search_tsv_idx"
  ON "document_extractions" USING GIN ("search_tsv");

-- D-038 / D-020: a deletion journal that outlives the document row.
-- Runtime may insert and read its own organization. It cannot rewrite or erase the journal.
-- The purge job uses the migrator and is the only writer of purged_at.

CREATE TABLE "deletion_journal" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "object_type" TEXT NOT NULL,
    "object_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "confirmer_user_id" UUID NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL,
    "purge_after" TIMESTAMP(3) NOT NULL,
    "purged_at" TIMESTAMP(3),

    CONSTRAINT "deletion_journal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "deletion_journal_organization_id_object_type_object_id_key"
  ON "deletion_journal"("organization_id", "object_type", "object_id");
CREATE INDEX "deletion_journal_purged_at_purge_after_idx"
  ON "deletion_journal"("purged_at", "purge_after");

ALTER TABLE "deletion_journal"
  ADD CONSTRAINT "deletion_journal_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

GRANT SELECT, INSERT ON TABLE "deletion_journal" TO spectre_app;
REVOKE UPDATE, DELETE ON TABLE "deletion_journal" FROM spectre_app;

ALTER TABLE "deletion_journal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "deletion_journal" FORCE ROW LEVEL SECURITY;

CREATE POLICY deletion_journal_tenant_select ON "deletion_journal"
  FOR SELECT
  USING (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  );

CREATE POLICY deletion_journal_tenant_insert ON "deletion_journal"
  FOR INSERT
  WITH CHECK (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  );

-- Phase 4 + hardening: uploading status, AIJob, extractions text (D-025),
-- audit_events thin, documents workspace-membership RLS (W-020+).

ALTER TYPE "document_status" ADD VALUE IF NOT EXISTS 'uploading';

CREATE TYPE "ai_job_status" AS ENUM (
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'timed_out'
);

CREATE TABLE "ai_jobs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID,
    "document_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "status" "ai_job_status" NOT NULL DEFAULT 'queued',
    "idempotency_key" TEXT NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "last_error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "ai_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_jobs_organization_id_idempotency_key_key"
  ON "ai_jobs"("organization_id", "idempotency_key");
CREATE INDEX "ai_jobs_organization_id_status_created_at_idx"
  ON "ai_jobs"("organization_id", "status", "created_at");
CREATE INDEX "ai_jobs_document_id_idx" ON "ai_jobs"("document_id");

ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "document_extractions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "ai_job_id" UUID,
    "char_count" INTEGER NOT NULL,
    "page_count" INTEGER,
    "extractor" TEXT NOT NULL,
    "text_content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_extractions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "document_extractions_document_id_key" ON "document_extractions"("document_id");
CREATE INDEX "document_extractions_organization_id_document_id_idx"
  ON "document_extractions"("organization_id", "document_id");

ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_document_id_fkey"
  FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_extractions" ADD CONSTRAINT "document_extractions_ai_job_id_fkey"
  FOREIGN KEY ("ai_job_id") REFERENCES "ai_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "actor_user_id" UUID,
    "action" TEXT NOT NULL,
    "object_type" TEXT,
    "object_id" UUID,
    "request_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_events_organization_id_created_at_idx"
  ON "audit_events"("organization_id", "created_at");
CREATE INDEX "audit_events_action_created_at_idx"
  ON "audit_events"("action", "created_at");

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ai_jobs" TO spectre_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "document_extractions" TO spectre_app;
GRANT SELECT, INSERT ON TABLE "audit_events" TO spectre_app;

ALTER TABLE "ai_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ai_jobs" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_jobs_tenant_isolation ON "ai_jobs";
CREATE POLICY ai_jobs_tenant_isolation ON "ai_jobs"
  FOR ALL
  USING (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  )
  WITH CHECK (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  );

ALTER TABLE "document_extractions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "document_extractions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS document_extractions_tenant_isolation ON "document_extractions";
CREATE POLICY document_extractions_tenant_isolation ON "document_extractions"
  FOR ALL
  USING (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    AND EXISTS (
      SELECT 1 FROM "documents" d
      WHERE d.id = "document_extractions"."document_id"
        AND d.organization_id = "document_extractions"."organization_id"
    )
  )
  WITH CHECK (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  );

-- audit_events: append-only insert under org GUC when present; SELECT same org.
ALTER TABLE "audit_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_events_tenant_isolation ON "audit_events";
CREATE POLICY audit_events_tenant_isolation ON "audit_events"
  FOR ALL
  USING (
    "organization_id" IS NULL
    OR "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  )
  WITH CHECK (
    "organization_id" IS NULL
    OR "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  );

-- Documents: org + workspace membership / ownership (W-020+). Nest ACL remains.
DROP POLICY IF EXISTS documents_tenant_isolation ON "documents";
CREATE POLICY documents_workspace_isolation ON "documents"
  FOR ALL
  USING (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    AND (
      EXISTS (
        SELECT 1 FROM "workspaces" w
        WHERE w.id = "documents"."workspace_id"
          AND w.organization_id = "documents"."organization_id"
          AND w.owner_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      )
      OR EXISTS (
        SELECT 1 FROM "workspace_members" m
        WHERE m.workspace_id = "documents"."workspace_id"
          AND m.organization_id = "documents"."organization_id"
          AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND m.status = 'ACTIVE'
      )
    )
  )
  WITH CHECK (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    AND (
      EXISTS (
        SELECT 1 FROM "workspaces" w
        WHERE w.id = "documents"."workspace_id"
          AND w.organization_id = "documents"."organization_id"
          AND w.owner_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
      )
      OR EXISTS (
        SELECT 1 FROM "workspace_members" m
        WHERE m.workspace_id = "documents"."workspace_id"
          AND m.organization_id = "documents"."organization_id"
          AND m.user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
          AND m.status = 'ACTIVE'
      )
    )
  );

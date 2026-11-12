-- Phase 5A-2: transactional Outbox for chat.generate (docs/15 §5.3 / docs/32 §8.1).
-- JOB-012 remains OPEN in decisions-log; this migration implements the scaffold shape only.

CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "aggregate_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_attempt_at" TIMESTAMP(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "outbox_events_published_at_next_attempt_at_created_at_idx"
  ON "outbox_events"("published_at", "next_attempt_at", "created_at");
CREATE INDEX "outbox_events_organization_id_created_at_idx"
  ON "outbox_events"("organization_id", "created_at");
CREATE INDEX "outbox_events_aggregate_id_idx"
  ON "outbox_events"("aggregate_id");

ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "outbox_events" TO spectre_app;

ALTER TABLE "outbox_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outbox_events" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS outbox_events_tenant_isolation ON "outbox_events";
CREATE POLICY outbox_events_tenant_isolation ON "outbox_events"
  FOR ALL
  USING (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  )
  WITH CHECK (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  );

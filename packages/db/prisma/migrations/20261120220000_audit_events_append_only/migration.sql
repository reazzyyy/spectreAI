-- audit_events: runtime must not rewrite history, and NULL-org rows must not
-- be visible to every tenant. Anonymous events use system_event and stay
-- off the tenant policy. The migrator (local superuser) still inserts them.
-- Future tables no longer receive UPDATE/DELETE via default privileges.

ALTER TABLE "audit_events" ADD COLUMN "system_event" BOOLEAN NOT NULL DEFAULT false;

-- Owner is subject to FORCE RLS. Turn it off for this backfill only.
SET LOCAL row_security = off;
UPDATE "audit_events"
SET "system_event" = true
WHERE "organization_id" IS NULL;

ALTER TABLE "audit_events"
  ADD CONSTRAINT "audit_events_tenant_org_required"
  CHECK ("system_event" OR "organization_id" IS NOT NULL);

REVOKE UPDATE, DELETE ON TABLE "audit_events" FROM spectre_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE UPDATE, DELETE ON TABLES FROM spectre_app;

DROP POLICY IF EXISTS audit_events_tenant_isolation ON "audit_events";
DROP POLICY IF EXISTS audit_events_tenant_select ON "audit_events";
CREATE POLICY audit_events_tenant_select ON "audit_events"
  FOR SELECT
  USING (
    "system_event" = false
    AND "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  );

DROP POLICY IF EXISTS audit_events_tenant_insert ON "audit_events";
CREATE POLICY audit_events_tenant_insert ON "audit_events"
  FOR INSERT
  WITH CHECK (
    "system_event" = false
    AND "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  );

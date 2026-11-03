-- Workspace entities (W-001–W-004, W-006) + tenant RLS foundation (W-020 / ADR-0003).
-- Depth: organization_id tenant policies only (workspace-membership policies = later slices).
-- Runtime role spectre_app: no BYPASSRLS, not table owner. Migrator (current DB owner) keeps DDL.

-- Enums
CREATE TYPE "workspace_visibility" AS ENUM ('PERSONAL', 'TEAM');
CREATE TYPE "workspace_status" AS ENUM ('ACTIVE', 'ARCHIVED', 'PENDING_DELETION', 'DELETING', 'DELETED');
CREATE TYPE "workspace_member_role" AS ENUM ('EDITOR', 'VIEWER');
CREATE TYPE "workspace_member_status" AS ENUM ('ACTIVE', 'REVOKED');

-- Matter composite unique needed for WorkspaceMatter FK (organizationId, matterId)
CREATE UNIQUE INDEX IF NOT EXISTS "matters_organization_id_id_key" ON "matters"("organization_id", "id");

-- Workspaces
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "workspace_visibility" NOT NULL,
    "status" "workspace_status" NOT NULL DEFAULT 'ACTIVE',
    "client_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspaces_organization_id_id_key" ON "workspaces"("organization_id", "id");
CREATE INDEX "workspaces_organization_id_status_updated_at_idx" ON "workspaces"("organization_id", "status", "updated_at");
CREATE INDEX "workspaces_organization_id_owner_user_id_status_idx" ON "workspaces"("organization_id", "owner_user_id", "status");
CREATE INDEX "workspaces_organization_id_client_id_idx" ON "workspaces"("organization_id", "client_id");

ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_organization_id_client_id_fkey" FOREIGN KEY ("organization_id", "client_id") REFERENCES "clients"("organization_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Workspace members
CREATE TABLE "workspace_members" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "workspace_member_role" NOT NULL,
    "status" "workspace_member_status" NOT NULL DEFAULT 'ACTIVE',
    "added_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_members_workspace_id_user_id_key" ON "workspace_members"("workspace_id", "user_id");
CREATE INDEX "workspace_members_organization_id_workspace_id_idx" ON "workspace_members"("organization_id", "workspace_id");
CREATE INDEX "workspace_members_user_id_idx" ON "workspace_members"("user_id");

ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_organization_id_workspace_id_fkey" FOREIGN KEY ("organization_id", "workspace_id") REFERENCES "workspaces"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_added_by_user_id_fkey" FOREIGN KEY ("added_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Workspace ↔ Matter M:N
CREATE TABLE "workspace_matters" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "matter_id" UUID NOT NULL,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_matters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_matters_workspace_id_matter_id_key" ON "workspace_matters"("workspace_id", "matter_id");
CREATE INDEX "workspace_matters_organization_id_workspace_id_idx" ON "workspace_matters"("organization_id", "workspace_id");
CREATE INDEX "workspace_matters_organization_id_matter_id_idx" ON "workspace_matters"("organization_id", "matter_id");

ALTER TABLE "workspace_matters" ADD CONSTRAINT "workspace_matters_organization_id_workspace_id_fkey" FOREIGN KEY ("organization_id", "workspace_id") REFERENCES "workspaces"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_matters" ADD CONSTRAINT "workspace_matters_organization_id_matter_id_fkey" FOREIGN KEY ("organization_id", "matter_id") REFERENCES "matters"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_matters" ADD CONSTRAINT "workspace_matters_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill legacy Matter.workspace_id → workspace_matters when a matching workspace exists in the same org.
INSERT INTO "workspace_matters" ("id", "organization_id", "workspace_id", "matter_id", "created_by_user_id", "created_at")
SELECT gen_random_uuid(), m."organization_id", m."workspace_id", m."id", NULL, CURRENT_TIMESTAMP
FROM "matters" m
INNER JOIN "workspaces" w
  ON w."id" = m."workspace_id"
 AND w."organization_id" = m."organization_id"
WHERE m."workspace_id" IS NOT NULL
ON CONFLICT ("workspace_id", "matter_id") DO NOTHING;

-- Runtime application role (local/CI password only — not for production).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'spectre_app') THEN
    CREATE ROLE spectre_app LOGIN PASSWORD 'spectre_app' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO spectre_app', current_database());
END
$$;
GRANT USAGE ON SCHEMA public TO spectre_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO spectre_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO spectre_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO spectre_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO spectre_app;

-- Tenant-boundary RLS (incomplete W-020: org filter only; workspace-level policies later).
-- users / sessions / organizations: no FORCE RLS here — auth bootstrap uses migrator URL (temporary until DEFINER helpers).

ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clients" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clients_tenant_isolation ON "clients";
CREATE POLICY clients_tenant_isolation ON "clients"
  FOR ALL
  USING (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  )
  WITH CHECK (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  );

ALTER TABLE "matters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "matters" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS matters_tenant_isolation ON "matters";
CREATE POLICY matters_tenant_isolation ON "matters"
  FOR ALL
  USING (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  )
  WITH CHECK (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  );

ALTER TABLE "organization_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_memberships" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organization_memberships_tenant_isolation ON "organization_memberships";
CREATE POLICY organization_memberships_tenant_isolation ON "organization_memberships"
  FOR ALL
  USING (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  )
  WITH CHECK (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  );

ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspaces" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspaces_tenant_isolation ON "workspaces";
CREATE POLICY workspaces_tenant_isolation ON "workspaces"
  FOR ALL
  USING (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  )
  WITH CHECK (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  );

ALTER TABLE "workspace_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_members" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_members_tenant_isolation ON "workspace_members";
CREATE POLICY workspace_members_tenant_isolation ON "workspace_members"
  FOR ALL
  USING (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  )
  WITH CHECK (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  );

ALTER TABLE "workspace_matters" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workspace_matters" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workspace_matters_tenant_isolation ON "workspace_matters";
CREATE POLICY workspace_matters_tenant_isolation ON "workspace_matters"
  FOR ALL
  USING (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  )
  WITH CHECK (
    "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  );

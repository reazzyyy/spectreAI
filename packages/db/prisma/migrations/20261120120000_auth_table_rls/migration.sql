-- Close the W-020 gap: spectre_app had full DML and no RLS on auth tables,
-- so the runtime role could read every password_hash and token_hash.
-- Deny by default. SELECT is limited to the actor GUC. Writes are revoked.
-- password_hash and token_hash are not selectable by spectre_app.
--
-- Login, session resolve, invites, and bootstrap still use the migrator role.
-- The local migrator is the database superuser and bypasses FORCE RLS.
-- Moving that path off the owner role is S5 (narrow auth role or SECURITY DEFINER
-- with a fixed search_path). Do not use the migrator for tenant queries.

ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_self_or_org_member ON "users";
CREATE POLICY users_self_or_org_member ON "users"
  FOR SELECT
  USING (
    "id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR EXISTS (
      SELECT 1
      FROM "organization_memberships" AS m
      WHERE m."user_id" = "users"."id"
        AND m."organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
    )
  );

ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sessions_own_in_org ON "sessions";
CREATE POLICY sessions_own_in_org ON "sessions"
  FOR SELECT
  USING (
    "user_id" = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    AND "organization_id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  );

ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organizations_own_org ON "organizations";
CREATE POLICY organizations_own_org ON "organizations"
  FOR SELECT
  USING (
    "id" = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
  );

REVOKE INSERT, UPDATE, DELETE ON TABLE "users" FROM spectre_app;
REVOKE INSERT, UPDATE, DELETE ON TABLE "sessions" FROM spectre_app;
REVOKE INSERT, UPDATE, DELETE ON TABLE "organizations" FROM spectre_app;
REVOKE SELECT (password_hash) ON TABLE "users" FROM spectre_app;
REVOKE SELECT (token_hash) ON TABLE "sessions" FROM spectre_app;

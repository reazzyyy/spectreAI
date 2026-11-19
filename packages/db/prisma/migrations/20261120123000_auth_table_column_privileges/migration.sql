-- Table-level SELECT is not narrowed by REVOKE SELECT (column).
-- The previous migration's column REVOKE therefore left password_hash and
-- token_hash readable. Replace table SELECT with an explicit column list.

REVOKE SELECT ON TABLE "users" FROM spectre_app;
GRANT SELECT (id, email, status, last_login_at, created_at, updated_at)
  ON TABLE "users" TO spectre_app;

REVOKE SELECT ON TABLE "sessions" FROM spectre_app;
GRANT SELECT (id, user_id, organization_id, expires_at, revoked_at, last_seen_at, created_at)
  ON TABLE "sessions" TO spectre_app;

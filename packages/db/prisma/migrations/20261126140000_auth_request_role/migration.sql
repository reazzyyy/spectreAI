-- D-036: login and session resolve must not use the owner connection.
-- spectre_auth is NOSUPERUSER and NOBYPASSRLS. It cannot read auth tables.
-- The functions are SECURITY DEFINER, owned by the migration role, with a fixed
-- search_path. row_security is off only inside the function because FORCE RLS
-- also applies to the table owner. Local password is a scaffold, like spectre_app.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'spectre_auth') THEN
    CREATE ROLE spectre_auth
      LOGIN PASSWORD 'spectre_auth'
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO spectre_auth', current_database());
END
$$;

GRANT USAGE ON SCHEMA public TO spectre_auth;

CREATE OR REPLACE FUNCTION public.auth_lookup_login(p_email text, p_organization_id text)
RETURNS TABLE (
  user_id uuid,
  password_hash text,
  user_status text,
  email text,
  membership_role text,
  membership_status text,
  organization_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
BEGIN
  IF p_organization_id IS NULL OR p_organization_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.password_hash,
    u.status::text,
    u.email,
    m.role::text,
    m.status::text,
    o.name
  FROM public.users AS u
  LEFT JOIN public.organization_memberships AS m
    ON m.user_id = u.id
   AND m.organization_id = p_organization_id::uuid
  LEFT JOIN public.organizations AS o
    ON o.id = p_organization_id::uuid
  WHERE u.email = p_email;
END;
$$;

CREATE OR REPLACE FUNCTION public.auth_create_session(
  p_user_id text,
  p_organization_id text,
  p_token_hash text,
  p_expires_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
BEGIN
  IF p_token_hash IS NULL OR char_length(p_token_hash) < 32 THEN
    RETURN false;
  END IF;
  IF p_user_id IS NULL OR p_user_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  IF p_organization_id IS NULL OR p_organization_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN false;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.users AS u
    JOIN public.organization_memberships AS m
      ON m.user_id = u.id
     AND m.organization_id = p_organization_id::uuid
    WHERE u.id = p_user_id::uuid
      AND u.status::text = 'active'
      AND m.status::text = 'active'
  ) THEN
    RETURN false;
  END IF;

  INSERT INTO public.sessions (id, user_id, organization_id, token_hash, expires_at)
  VALUES (gen_random_uuid(), p_user_id::uuid, p_organization_id::uuid, p_token_hash, p_expires_at);

  UPDATE public.users
  SET last_login_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE id = p_user_id::uuid;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.auth_resolve_session(p_token_hash text)
RETURNS TABLE (
  user_id uuid,
  organization_id uuid,
  email text,
  user_status text,
  membership_role text,
  membership_status text,
  organization_name text,
  expires_at timestamp,
  revoked_at timestamp
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
BEGIN
  IF p_token_hash IS NULL OR char_length(p_token_hash) < 32 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    s.user_id,
    s.organization_id,
    u.email,
    u.status::text,
    m.role::text,
    m.status::text,
    o.name,
    s.expires_at,
    s.revoked_at
  FROM public.sessions AS s
  JOIN public.users AS u ON u.id = s.user_id
  JOIN public.organizations AS o ON o.id = s.organization_id
  LEFT JOIN public.organization_memberships AS m
    ON m.user_id = s.user_id
   AND m.organization_id = s.organization_id
  WHERE s.token_hash = p_token_hash;
END;
$$;

CREATE OR REPLACE FUNCTION public.auth_revoke_session(p_token_hash text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
BEGIN
  IF p_token_hash IS NULL OR char_length(p_token_hash) < 32 THEN
    RETURN;
  END IF;

  UPDATE public.sessions
  SET revoked_at = pg_catalog.now()
  WHERE token_hash = p_token_hash
    AND revoked_at IS NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.auth_lookup_login(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_create_session(text, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_resolve_session(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_revoke_session(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.auth_lookup_login(text, text) TO spectre_auth;
GRANT EXECUTE ON FUNCTION public.auth_create_session(text, text, text, timestamptz) TO spectre_auth;
GRANT EXECUTE ON FUNCTION public.auth_resolve_session(text) TO spectre_auth;
GRANT EXECUTE ON FUNCTION public.auth_revoke_session(text) TO spectre_auth;

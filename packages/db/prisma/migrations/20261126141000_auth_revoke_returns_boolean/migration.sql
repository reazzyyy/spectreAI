-- Prisma cannot deserialize a void column from $queryRaw.
-- The revoke function returns a boolean so the auth role can call it.
-- Return type cannot change via CREATE OR REPLACE, so drop the void function first.

DROP FUNCTION public.auth_revoke_session(text);

CREATE FUNCTION public.auth_revoke_session(p_token_hash text)
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

  UPDATE public.sessions
  SET revoked_at = pg_catalog.now()
  WHERE token_hash = p_token_hash
    AND revoked_at IS NULL;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.auth_revoke_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_revoke_session(text) TO spectre_auth;

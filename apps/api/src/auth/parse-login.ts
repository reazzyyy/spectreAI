const MAX_EMAIL_LENGTH = 320;
const MAX_PASSWORD_LENGTH = 200;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface LoginInput {
  email: string;
  password: string;
  organizationId: string;
}

/**
 * Parses login body. Email is normalized to lowercase trim.
 * Does not authenticate — only shape validation.
 */
export function parseLogin(body: unknown): LoginInput | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }

  const record = body as Record<string, unknown>;
  const { email, password, organizationId } = record;
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    typeof organizationId !== "string"
  ) {
    return null;
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (
    normalizedEmail.length === 0 ||
    normalizedEmail.length > MAX_EMAIL_LENGTH ||
    !normalizedEmail.includes("@") ||
    password.length === 0 ||
    password.length > MAX_PASSWORD_LENGTH ||
    !UUID_RE.test(organizationId)
  ) {
    return null;
  }

  return {
    email: normalizedEmail,
    password,
    organizationId: organizationId.toLowerCase(),
  };
}

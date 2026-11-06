/**
 * Local/CI smoke credentials. Prefer E2E_*; fall back to BOOTSTRAP_OWNER_* for email/password.
 * Organization UUID is never inferred — set E2E_ORGANIZATION_ID (bootstrap prints it).
 */
export type SmokeCredentials = {
  email: string;
  password: string;
  organizationId: string;
};

export function readSmokeCredentials(
  env: NodeJS.ProcessEnv = process.env,
): SmokeCredentials | null {
  const email = (env.E2E_EMAIL ?? env.BOOTSTRAP_OWNER_EMAIL ?? "").trim();
  const password = env.E2E_PASSWORD ?? env.BOOTSTRAP_OWNER_PASSWORD ?? "";
  const organizationId = (env.E2E_ORGANIZATION_ID ?? "").trim();

  if (!email || !password || !organizationId) {
    return null;
  }

  return { email, password, organizationId };
}

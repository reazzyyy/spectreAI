/**
 * Dev-only CLI: first Organization + Owner (W-012).
 *
 * Usage (from repo root, with Docker Postgres + migrate:deploy):
 *   set BOOTSTRAP_DEV=1
 *   set BOOTSTRAP_ORG_NAME=Dev Org
 *   set BOOTSTRAP_OWNER_EMAIL=owner@localhost
 *   set BOOTSTRAP_OWNER_PASSWORD=<your-secret>
 *   pnpm --filter @spectre/api bootstrap:dev
 *
 * Or: node --env-file=.env ./node_modules/tsx/dist/cli.mjs apps/api/src/scripts/run-dev-bootstrap.ts
 *
 * Never prints the password. Idempotent for the same org name + owner email.
 */
import { executeDevBootstrapFromEnv } from "./dev-bootstrap.js";

async function main(): Promise<void> {
  const result = await executeDevBootstrapFromEnv();
  const action = result.created ? "created" : "already-exists";
  console.log(
    JSON.stringify({
      ok: true,
      action,
      organizationId: result.organizationId,
      organizationName: result.organizationName,
      userId: result.userId,
      email: result.email,
      role: result.role,
      loginHint:
        "POST /api/v1/auth/login with email, password (from env), organizationId",
    }),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "bootstrap failed";
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exitCode = 1;
});

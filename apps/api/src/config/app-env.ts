/**
 * Explicit deploy environment (D-042).
 * `NODE_ENV` is a Node/Nest mode and is not the production flag: staging was
 * receiving invite dev tokens because it was not `NODE_ENV=production`.
 */
const TOKEN_DENIED = new Set(["production", "staging", "preview"]);
const DEV_NAMES = new Set(["development", "dev", "local", "test"]);

function appEnvName(env: NodeJS.ProcessEnv): string {
  return (env.APP_ENV ?? "").trim().toLowerCase();
}

/** True only when the operator set `APP_ENV=production`. */
export function isProductionApp(env: NodeJS.ProcessEnv = process.env): boolean {
  return appEnvName(env) === "production";
}

/**
 * Local, test, and an unset `APP_ENV`. Staging, preview, production, and any
 * unknown name are not a dev environment.
 */
export function isDevApp(env: NodeJS.ProcessEnv = process.env): boolean {
  const name = appEnvName(env);
  return name.length === 0 || DEV_NAMES.has(name);
}

/**
 * Whether the raw invitation token may appear in an API response.
 * Staging, preview, and production never include it, even if
 * `INVITE_DEV_TOKEN_ENABLED=1`. A dev environment includes it. Any other name
 * includes it only when that flag is exactly `1`.
 */
export function exposeInviteDevToken(env: NodeJS.ProcessEnv = process.env): boolean {
  if (TOKEN_DENIED.has(appEnvName(env))) {
    return false;
  }
  if (env.INVITE_DEV_TOKEN_ENABLED === "1") {
    return true;
  }
  return isDevApp(env);
}

/** `Secure` cookie attribute. On only for the explicit production flag. */
export function secureCookieEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isProductionApp(env);
}

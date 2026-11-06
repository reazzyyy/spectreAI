import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const repoRoot = path.resolve(__dirname, "../..");
const rootEnv = path.join(repoRoot, ".env");
if (existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

const WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:3001";
const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:3000";

/**
 * F4 smoke (D-024): Chromium only; desktop viewport (≥1280 — AppShell gate).
 * Expects Postgres and a bootstrapped owner.
 * Credentials: E2E_* or BOOTSTRAP_OWNER_* + E2E_ORGANIZATION_ID.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: WEB_ORIGIN,
    trace: "on-first-retry",
    viewport: { width: 1400, height: 900 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1400, height: 900 } },
    },
  ],
  webServer: [
    {
      name: "api",
      command: "pnpm --filter @spectre/api dev",
      cwd: repoRoot,
      url: `${API_ORIGIN}/api/v1/health`,
      // Local IDE often keeps api/web up; CI runners are clean (set PW_NO_REUSE=1 to force).
      reuseExistingServer: process.env.PW_NO_REUSE !== "1",
      timeout: 120_000,
    },
    {
      name: "web",
      command: "pnpm --filter @spectre/web dev",
      cwd: repoRoot,
      url: `${WEB_ORIGIN}/login`,
      reuseExistingServer: process.env.PW_NO_REUSE !== "1",
      timeout: 120_000,
    },
  ],
});

import { expect, test } from "@playwright/test";
import { readSmokeCredentials } from "./credentials";

test.describe("auth smoke", () => {
  test("unauthenticated home redirects to login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel("Email")).toBeVisible();
  });

  test("login reaches home", async ({ page }) => {
    const creds = readSmokeCredentials();
    test.skip(
      !creds,
      "Set E2E_ORGANIZATION_ID and E2E_EMAIL/E2E_PASSWORD (or BOOTSTRAP_OWNER_*).",
    );

    await page.goto("/login");
    await page.getByLabel("Email").fill(creds!.email);
    await page.getByLabel("Пароль").fill(creds!.password);
    await page.getByLabel("ID организации").fill(creds!.organizationId);
    await page.getByRole("button", { name: "Войти" }).click();

    // Surface client validation / API errors instead of only waiting on URL.
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    const local = creds!.email.split("@")[0] ?? creds!.email;
    await expect(page.getByRole("heading", { level: 1 })).toContainText(local);
  });
});

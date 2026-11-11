import { expect, test } from "@playwright/test";
import { displayNameFromEmail } from "../src/shared/lib/display-name";
import { readSmokeCredentials } from "./credentials";

const ORG_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

    expect(
      creds!.organizationId,
      `E2E_ORGANIZATION_ID must be a UUID (got ${JSON.stringify(creds!.organizationId)})`,
    ).toMatch(ORG_UUID_RE);

    await page.goto("/login");
    await page.getByLabel("Email").fill(creds!.email);
    await page.getByLabel("Пароль").fill(creds!.password);
    await page.getByLabel("ID организации").fill(creds!.organizationId);

    const loginResponsePromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/v1/auth/login") &&
        res.request().method() === "POST",
    );

    await page.getByRole("button", { name: "Войти" }).click();

    const loginResponse = await loginResponsePromise;
    const loginBody = await loginResponse.text();
    expect(
      loginResponse.status(),
      `POST /auth/login failed: status=${loginResponse.status()} body=${loginBody.slice(0, 500)}`,
    ).toBe(200);

    // Do not assert getByRole("alert"): Next.js App Router announcer uses role=alert
    // with an empty string and is a false positive. Form errors use .form-error.
    await expect(page.locator(".form-error")).toHaveCount(0);

    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    const greetingName = displayNameFromEmail(creds!.email);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      `Добрый день, ${greetingName}`,
    );
  });
});

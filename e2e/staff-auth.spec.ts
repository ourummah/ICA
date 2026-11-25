import { expect, test } from "@playwright/test";

// Needs the demo tenant: `npm run seed` against the local Supabase stack.
const password = process.env.DEMO_STAFF_PASSWORD ?? "ica-demo-local";

test("QA signs in with email, sees their role, and signs out", async ({ page }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/app\/login/);

  await page.getByLabel("Email").fill("qa@demo.ica.test");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Welcome, Jordan Smith" })).toBeVisible();
  await expect(page.getByText("QA", { exact: true })).toBeVisible();
  await expect(page.getByText("Riverbend Plant (Demo)")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/app\/login/);
});

test("a wrong password shows an error and stays on sign-in", async ({ page }) => {
  await page.goto("/app/login");
  await page.getByLabel("Email").fill("qa@demo.ica.test");
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "incorrect" })).toHaveText(
    "Email or password is incorrect.",
  );
  await expect(page).toHaveURL(/\/app\/login/);
});

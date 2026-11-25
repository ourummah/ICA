import { expect, test } from "@playwright/test";

test("landing page loads and links to the app sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Open the app" }).click();
  await expect(page).toHaveURL(/\/app\/login/);
  await expect(page.getByRole("heading", { name: "Staff sign-in" })).toBeVisible();
});

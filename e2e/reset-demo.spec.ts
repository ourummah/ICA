import { expect, test } from "@playwright/test";

const password = process.env.DEMO_STAFF_PASSWORD ?? "ica-demo-local";

test.skip(({ isMobile }) => isMobile, "Runs once, from the desktop project");

/**
 * SPEC F10: the admin home offers Reset demo for the demo plant, guarded by typing RESET. The
 * reset itself is the seed (covered by the database tests); running it here would wipe the
 * tenant other tests are using.
 */
test("F10: Reset demo is offered to the demo admin and needs RESET typed", async ({ page }) => {
  await page.goto("/app/login?next=/app/admin");
  await page.getByLabel("Email").fill("admin@demo.ica.test");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  const form = page.getByRole("form", { name: "Reset demo" });
  await expect(form).toBeVisible();
  await form.getByLabel("Type RESET to confirm").fill("reset please");
  await form.getByRole("button", { name: "Reset demo" }).click();
  await expect(form.getByRole("alert")).toHaveText("Type RESET to confirm.");
  await expect(page).toHaveURL(/\/app\/admin/);
});

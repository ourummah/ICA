import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const password = process.env.DEMO_STAFF_PASSWORD ?? "ica-demo-local";

// Site setup is a laptop task.
test.skip(({ isMobile }) => isMobile, "Admin screens are tested on desktop");

async function signInAsAdmin(page: Page) {
  await page.goto("/app/login");
  await page.getByLabel("Email").fill("admin@demo.ica.test");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Welcome, Alex Morgan" })).toBeVisible();
}

test("F1: new equipment with an 8-step SSOP, assigned tonight, in under 5 minutes", async ({ page }) => {
  const started = Date.now();
  const name = `Bandsaw ${Date.now() % 100000}`;
  await signInAsAdmin(page);
  await page.getByRole("link", { name: "Site setup" }).click();
  await page
    .getByRole("navigation", { name: "Site setup" })
    .getByRole("link", { name: "Equipment & SSOPs" })
    .click();

  const add = page.getByRole("form", { name: "Add equipment" });
  await add.getByLabel("Name").fill(name);
  await add.getByLabel("Zone").selectOption({ label: "Boning Room" });
  await add.getByRole("button", { name: "Add and build SSOP" }).click();

  await expect(page.getByRole("heading", { name })).toBeVisible();
  await page.getByRole("button", { name: "Start SSOP" }).click();
  await expect(page.getByText("Draft v1")).toBeVisible();

  const importForm = page.getByRole("form", { name: "Import steps from CSV" });
  await importForm
    .getByLabel("CSV file")
    .setInputFiles(path.join(import.meta.dirname, "fixtures/eight-step-ssop.csv"));
  await importForm.getByRole("button", { name: "Import" }).click();
  await expect(page.getByText("Imported 8 steps")).toBeVisible();
  await expect(page.getByText("8. ATP swab")).toBeVisible();

  await page.getByRole("button", { name: "Activate v1" }).click();
  await expect(page.getByText(/SSOP v1\s*Active/)).toBeVisible();

  await page
    .getByRole("navigation", { name: "Site setup" })
    .getByRole("link", { name: "Tonight's tasks" })
    .click();
  const assign = page.getByRole("form", { name: `Assign ${name}` });
  await assign.getByLabel("Cleaner").selectOption({ label: "Maria Santos" });
  await assign.getByRole("button", { name: "Add to tonight" }).click();
  await expect(assign.getByText("Added to tonight's shift.")).toBeVisible();

  expect(Date.now() - started).toBeLessThan(5 * 60 * 1000);
});

test("builder: add, reorder and version steps; the active version is read-only", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto("/app/admin/equipment");
  await page.getByRole("link", { name: /Mincer 1/ }).click();
  await expect(page.getByText(/SSOP v1\s*Active/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Delete/ })).toHaveCount(0);

  await page.getByRole("button", { name: "New draft (copy of v1)" }).click();
  await expect(page.getByText("Draft v2")).toBeVisible();

  const add = page.getByRole("form", { name: "Add step" });
  await add.getByLabel("Step type").selectOption({ label: "Reassemble" });
  await add.getByLabel("Title").fill("Reassemble and guard on");
  await add.getByRole("button", { name: "Add step" }).click();
  await expect(page.getByText("10. Reassemble and guard on")).toBeVisible();

  await page.getByRole("button", { name: "Move step 10 up" }).click();
  await expect(page.getByText("9. Reassemble and guard on")).toBeVisible();

  await page.getByRole("button", { name: "Activate v2" }).click();
  await expect(page.getByText(/SSOP v2\s*Active/)).toBeVisible();
  await expect(page.getByText("v1 · retired")).toBeVisible();
});

test("people: add a cleaner with a PIN; a bad PIN is rejected", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto("/app/admin/people");
  const form = page.getByRole("form", { name: "Add cleaner" });
  await form.getByLabel("Name").fill("Dewi Lestari");
  await form.getByLabel("Language").selectOption({ label: "Bahasa Indonesia" });
  await form.getByLabel("PIN").fill("5678");
  await form.getByRole("button", { name: "Add cleaner" }).click();
  await expect(form.getByText("Dewi Lestari added.")).toBeVisible();
  await expect(page.getByRole("form", { name: "New PIN for Dewi Lestari" })).toBeVisible();
});

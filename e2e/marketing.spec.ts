import { expect, test } from "@playwright/test";

import { query } from "./db";

/** SPEC F9 and demo script step 1: open the landing page, show how it works, submit a demo request. */
test("F9: landing page shows how it works and saves a demo request", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Proof that every clean was done right.");

  await page.getByRole("link", { name: "See how it works" }).click();
  const how = page.getByRole("region", { name: "How it works" });
  await expect(how).toBeInViewport();
  for (const step of ["Capture", "Checks", "Pre-op alerts", "Audit pack"])
    await expect(how.getByRole("heading", { name: step })).toBeVisible();
  await expect(page.locator("[data-pricing]")).toHaveCount(0);

  const email = `pilot-${testInfo.project.name}-${Date.now()}@example.com`;
  const form = page.getByRole("form", { name: "Book a demo" });
  // A missing name is caught by the server and shown next to the field.
  await form.getByLabel("Work email").fill(email);
  await form.getByRole("button", { name: "Book a demo" }).click();
  await expect(form.getByText("Please enter your name")).toBeVisible();

  await form.getByLabel("Name").fill("Jordan Example");
  await form.getByLabel("Company").fill("Example Smallgoods (Test)");
  await form.getByLabel(/What would you like to see/).fill("Offline capture and the audit pack.");
  await form.getByRole("button", { name: "Book a demo" }).click();
  await expect(page.getByRole("status")).toContainText("we've got your request");

  const rows = await query<{ name: string; company: string; message: string }>(
    `select name, company, message from demo_requests where email = $1`,
    [email],
  );
  expect(rows).toEqual([
    {
      name: "Jordan Example",
      company: "Example Smallgoods (Test)",
      message: "Offline capture and the audit pack.",
    },
  ]);
  await query(`delete from demo_requests where email = $1`, [email]);
});

test("F9: the privacy page is marked as a placeholder for legal review", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Privacy" }).click();
  await expect(page.getByRole("heading", { name: "Privacy notice" })).toBeVisible();
  await expect(page.getByRole("note")).toContainText("has not been reviewed by a lawyer");
});

test("F9: the demo request endpoint validates input and ignores bots", async ({ request }) => {
  const bad = await request.post("/api/demo-requests", { data: { name: "A", email: "nope" } });
  expect(bad.status()).toBe(400);
  const email = `bot-${Date.now()}@example.com`;
  const bot = await request.post("/api/demo-requests", {
    data: { name: "Bot", email, website: "http://spam.example" },
  });
  expect(bot.status()).toBe(200);
  expect(await query(`select 1 from demo_requests where email = $1`, [email])).toEqual([]);
});

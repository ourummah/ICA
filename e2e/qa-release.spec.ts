import path from "node:path";

import { expect, test } from "@playwright/test";

import { query } from "./db";

const password = process.env.DEMO_STAFF_PASSWORD ?? "ica-demo-local";
const photo = path.join(import.meta.dirname, "fixtures/test-photo.png");

// QA works on a laptop or tablet; run once, on the desktop project.
test.skip(({ isMobile }) => isMobile, "QA screens are tested on the desktop project");

/**
 * SPEC F6: pre-op checklist (a failure with a photo sends equipment back for re-clean), then
 * Release, which is blocked while a red exception is open until QA overrides with a reason. The
 * release is in the audit chain and shows on the board as "Released HH:MM by J. Smith".
 */
test("F6: pre-op inspection, blocked release, override with reason, shown on the board", async ({ page }) => {
  test.setTimeout(90_000);

  // An open red exception on Chiller 1 (as if a step was skipped).
  await query(
    `insert into exceptions (site_id, task_id, type, severity, detail)
     select t.site_id, t.id, 'missed_step', 'red', '{"reason":"no_access"}'
     from tasks t join equipment e on e.id = t.equipment_id where e.name = 'Chiller 1 — floor and drains'`,
  );

  await page.goto("/app/login?next=/app/supervisor");
  await page.getByLabel("Email").fill("qa@demo.ica.test");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("link", { name: /^Chillers:/ }).click();
  await expect(page.getByRole("heading", { name: "Chillers" })).toBeVisible();
  await expect(page.getByText("No pre-op inspection yet this shift.")).toBeVisible();

  // Pre-op: one failure with a note and photo, re-clean the trolleys.
  await page.getByRole("link", { name: "Start pre-op inspection" }).click();
  await expect(page.getByRole("heading", { name: /Pre-op inspection/ })).toBeVisible();
  await page.getByLabel("No pooled water: Fail").check();
  await page.getByLabel("What's wrong (required)").fill("Water pooled by drain 2");
  await page.getByLabel("Photo for No pooled water").setInputFiles(photo);
  for (const label of [
    "No visible residue",
    "No foreign objects or tools left behind",
    "Equipment reassembled and guards on",
    "No condensation over product zones",
    "Sanitiser drained",
    "ATP results within limits",
  ]) {
    await page.getByLabel(`${label}: Pass`).check();
  }
  await page.getByLabel("Hanging rail trolleys").check();
  await page.getByRole("button", { name: "Save inspection" }).click();

  await expect(page.getByRole("heading", { name: "Chillers" })).toBeVisible();
  await expect(page.getByText("Pre-op failed")).toBeVisible();
  await expect(page.getByText("No pooled water: Water pooled by drain 2 (photo)")).toBeVisible();
  const recleans = await query<{ n: string }>(
    `select count(*) as n from tasks t join equipment e on e.id = t.equipment_id
     where e.name = 'Hanging rail trolleys' and t.reclean_of_task_id is not null`,
  );
  expect(Number(recleans[0].n)).toBe(1);

  // Second inspection passes.
  await page.getByRole("link", { name: "Inspect again" }).click();
  for (const label of [
    "No visible residue",
    "No foreign objects or tools left behind",
    "Equipment reassembled and guards on",
    "No pooled water",
    "No condensation over product zones",
    "Sanitiser drained",
    "ATP results within limits",
  ]) {
    await page.getByLabel(`${label}: Pass`).check();
  }
  await page.getByRole("button", { name: "Save inspection" }).click();
  await expect(page.getByText("Pre-op passed")).toBeVisible();

  // Release is blocked by the open red exception.
  const form = page.getByRole("form", { name: "Release or hold zone" });
  await expect(form.getByText("Release is blocked: 1 red exception is open")).toBeVisible();
  await form.getByRole("button", { name: "Release zone" }).click();
  await expect(form.getByRole("alert")).toContainText("Release is blocked");

  // Override needs a reason.
  await form.getByLabel(/Override and release anyway/).check();
  await form.getByRole("button", { name: "Release zone" }).click();
  await expect(form.getByRole("alert")).toContainText("An override needs a reason.");
  await form.getByLabel(/Reason/).fill("Floor re-checked; drain area roped off");
  await form.getByRole("button", { name: "Release zone" }).click();
  await expect(form.getByRole("status")).toContainText("Zone released.");
  await expect(page.locator('[data-release="released"]').first()).toContainText(
    /Released \d\d:\d\d by J\. Smith \(override\): Floor re-checked/,
  );

  // On the board.
  await page.getByRole("link", { name: "Zone board" }).first().click();
  const tile = page.getByRole("link", { name: /^Chillers:/ });
  await expect(tile).toContainText(/Released \d\d:\d\d by J\. Smith/);
  await expect(tile).toContainText("Pre-op: passed");

  // Logged in the audit chain, which still verifies.
  const [row] = await query<{ site_id: string; n: string }>(
    `select r.site_id, count(a.*) as n from releases r
     join zones z on z.id = r.zone_id
     left join audit_events a on a.entity = 'releases' and a.entity_id = r.id
     where z.name = 'Chillers' and r.override_open_exceptions group by r.site_id`,
  );
  expect(Number(row.n)).toBe(1);
  const [chain] = await query<{ verified: boolean }>(`select verified from verify_chain($1)`, [row.site_id]);
  expect(chain.verified).toBe(true);
});

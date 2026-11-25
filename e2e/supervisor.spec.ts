import path from "node:path";

import { devices, expect, test, type Page } from "@playwright/test";

import { query } from "./db";

const password = process.env.DEMO_STAFF_PASSWORD ?? "ica-demo-local";
const photo = path.join(import.meta.dirname, "fixtures/test-photo.png");

// One run, driven from the desktop project: a supervisor on a laptop and a cleaner on a phone.
test.skip(({ isMobile }) => isMobile, "Runs once, from the desktop project");

async function pressDigits(page: Page, digits: string) {
  for (const d of digits) await page.getByRole("button", { name: d, exact: true }).click();
}

/** Mincer 1: 9 steps, photos at 1, 4 and 7, a 10 s dwell at 5 (fast timers), ATP at 9 (limit 150). */
async function cleanMincer(phone: Page, opts: { rushDwell: boolean; atp: string }) {
  for (let n = 1; n <= 8; n++) {
    await expect(phone.getByText(`Step ${n} of 9`)).toBeVisible();
    if (n === 1 || n === 4 || n === 7) {
      await phone.getByLabel("Take photo").setInputFiles(photo);
      await expect(phone.getByRole("button", { name: "Retake photo" })).toBeVisible();
    }
    if (n === 5 && opts.rushDwell) {
      await phone.getByRole("button", { name: "Finish early" }).click();
      await phone.getByRole("button", { name: "Finish early" }).click();
      continue;
    }
    await phone.getByRole("button", { name: "Done" }).click({ timeout: 20_000 });
  }
  await expect(phone.getByText("Step 9 of 9")).toBeVisible();
  await pressDigits(phone, opts.atp);
  await phone.getByRole("button", { name: "Save reading" }).click();
  if (Number(opts.atp) > 150) {
    await expect(phone.getByRole("alert").filter({ hasText: "Fail" })).toBeVisible();
    await phone.getByRole("button", { name: "Next" }).click();
  }
  await expect(phone.getByRole("heading", { name: "Task finished" })).toBeVisible();
}

/**
 * SPEC F4/F5 (demo script steps 6 to 8): the cleaner syncs a rushed dwell and a failed ATP, the
 * supervisor's Mincing tile turns red live, the supervisor requests a re-clean, the cleaner
 * re-does it with a passing ATP, and the tile turns green, all without reloading the dashboard.
 */
test("F4/F5: exceptions turn the zone red live; a re-clean turns it green", async ({ page, browser }) => {
  test.setTimeout(180_000);

  // Setup: Siti cleans Mincer 1; the other Mincing task (Paddle mixer) is already finished.
  await query(
    `update tasks set assigned_profile_id = (select id from profiles where display_name = 'Siti Rahma')
     where equipment_id = (select id from equipment where name = 'Mincer 1')`,
  );
  await query(
    `insert into step_records (site_id, task_id, ssop_step_id, profile_id, client_record_id, result, payload_hash)
     select t.site_id, t.id, s.id, t.assigned_profile_id, gen_random_uuid(), 'done', repeat('a', 64)
     from tasks t join equipment e on e.id = t.equipment_id join ssop_steps s on s.ssop_id = t.ssop_id
     where e.name = 'Paddle mixer'`,
  );

  // Supervisor on the laptop: Mincing is in progress, nothing red yet.
  await page.goto("/app/login?next=/app/supervisor");
  await page.getByLabel("Email").fill("supervisor@demo.ica.test");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Zone board" })).toBeVisible();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  const mincing = page.getByRole("link", { name: /^Mincing:/ });
  await expect(mincing).toHaveAttribute("data-colour", "amber");
  await expect(mincing).toContainText("1 of 2 tasks done");

  // Cleaner on a phone: register the device, sign in as Siti, rush the dwell and fail the ATP.
  const phoneContext = await browser.newContext({ ...devices["Pixel 7"] });
  const phone = await phoneContext.newPage();
  await phone.goto("/app/login?next=/app/device");
  await phone.getByLabel("Email").fill("admin@demo.ica.test");
  await phone.getByLabel("Password").fill(password);
  await phone.getByRole("button", { name: "Sign in" }).click();
  await phone.getByLabel("Device name").fill(`Supervisor test phone ${Date.now() % 10000}`);
  await phone.getByRole("button", { name: "Register device" }).click();
  await expect(phone).toHaveURL(/\/app\/cleaner/);
  await phone.getByRole("button", { name: "Siti Rahma" }).click();
  await pressDigits(phone, "4444");
  await phone.getByRole("button", { name: /English/ }).click();
  await phone.getByRole("button", { name: "I understand" }).click();
  await phone.getByRole("button", { name: /^Mincer 1/ }).click();
  await cleanMincer(phone, { rushDwell: true, atp: "200" });

  // The phone syncs; the tile turns red with no reload (SPEC F4: within 10 s of sync).
  await expect(phone.getByRole("status")).toContainText("All saved", { timeout: 20_000 });
  await expect(mincing).toHaveAttribute("data-colour", "red", { timeout: 10_000 });
  await expect(mincing).toContainText("Needs attention");

  // Drill down: zone, then the task, which shows both exceptions on their step records.
  await mincing.click();
  await expect(page.getByRole("heading", { name: "Mincing" })).toBeVisible();
  await page.getByRole("link", { name: "Clean", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Mincer 1" })).toBeVisible();
  await expect(page.locator('[data-exception-type="dwell_short"]')).toContainText("red");
  await expect(page.locator('[data-exception-type="atp_fail"]')).toContainText("ATP 200 RLU, limit 150");
  await expect(page.getByRole("img", { name: "Photo for step 1" })).toBeVisible({ timeout: 15_000 });

  // Request a re-clean.
  await page.getByLabel("Reason for re-clean").fill("ATP over limit, dwell cut short");
  await page.getByRole("button", { name: "Request re-clean" }).click();
  await expect(page.getByText("Sent back for re-clean").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Re-clean task" })).toBeVisible();
  await expect(page.locator('[data-exception-type="atp_fail"]')).toContainText("resolved");

  // The cleaner sees the re-clean at the top of the list and does it properly.
  await page.goto("/app/supervisor");
  await phone.getByRole("button", { name: "Back to tasks" }).click();
  await phone.getByRole("button", { name: /^Re-clean\s*Mincer 1/ }).click({ timeout: 20_000 });
  await cleanMincer(phone, { rushDwell: false, atp: "90" });
  await expect(phone.getByRole("status")).toContainText("All saved", { timeout: 20_000 });

  // Back on the board (no reload since opening it): Mincing is green.
  await expect(mincing).toHaveAttribute("data-colour", "green", { timeout: 10_000 });
  await expect(mincing).toContainText("All clean");

  const [exceptions] = await query<{ open: string }>(
    `select count(*) filter (where x.status = 'open') as open
     from exceptions x join tasks t on t.id = x.task_id join equipment e on e.id = t.equipment_id
     where e.name = 'Mincer 1'`,
  );
  expect(Number(exceptions.open)).toBe(0);
  await phoneContext.close();

  // SPEC F7: the audit pack for the demo night, as PDF (under 15 s) and CSV.
  await page.getByRole("link", { name: "Audit pack" }).click();
  await expect(page.getByRole("heading", { name: "Audit pack" })).toBeVisible();
  const started = Date.now();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download PDF" }).click(),
  ]);
  const pdfPath = test.info().outputPath("audit-pack.pdf");
  await download.saveAs(pdfPath);
  expect(Date.now() - started).toBeLessThan(15_000);
  expect(download.suggestedFilename()).toMatch(/^audit-pack-riverbend-plant-demo-\d{4}-\d{2}-\d{2}\.pdf$/);
  const { readFileSync } = await import("node:fs");
  expect(readFileSync(pdfPath).subarray(0, 5).toString()).toBe("%PDF-");

  const [csvDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download CSV" }).click(),
  ]);
  const csv = readFileSync(await csvDownload.path(), "utf8");
  const mincerRows = csv.split("\r\n").filter((l) => l.includes("Mincer 1"));
  expect(mincerRows).toHaveLength(18); // two cleans of 9 steps
  expect(mincerRows.some((l) => l.includes(",failed,") && l.includes(",200,150,"))).toBe(true);

  // Both Mincer 1 cleans are sealed after they sync (docs/AUDIT_TRAIL.md), with photo hashes.
  const sealedMincer = () =>
    query<{ id: string; canonical_text: string }>(
      `select r.id, r.canonical_text from sealed_records r join tasks t on t.id = r.task_id
       join equipment e on e.id = t.equipment_id where e.name = 'Mincer 1' order by r.site_seq`,
    );
  await expect.poll(async () => (await sealedMincer()).length, { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
  const [firstSeal] = await sealedMincer();
  expect(
    JSON.parse(firstSeal.canonical_text).items.some((i: { photo_hashes: string[] }) => i.photo_hashes.length),
  ).toBe(true);
  await page.goto("/app/supervisor");
  await expect(page.locator('[data-seal-chain="ok"]')).toBeVisible();
  await page.goto(`/verify/${firstSeal.id}`);
  await expect(page.getByRole("status")).toContainText("Sealed, pending anchoring");
  await expect(page.getByText(firstSeal.id)).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("Mincer");
});

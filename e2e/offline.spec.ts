import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { query } from "./db";

const password = process.env.DEMO_STAFF_PASSWORD ?? "ica-demo-local";
const photo = path.join(import.meta.dirname, "fixtures/test-photo.png");

test.skip(({ isMobile }) => !isMobile, "Cleaner app is tested on the phone profile");

async function pressDigits(page: Page, digits: string) {
  for (const d of digits) await page.getByRole("button", { name: d, exact: true }).click();
}

async function step(page: Page, n: number, total: number) {
  await expect(page.getByText(`Step ${n} of ${total}`)).toBeVisible();
}

/**
 * SPEC M4 acceptance: a full SSOP completed entirely offline, the browser closed and reopened
 * with progress intact, and everything synced with no duplicates once back online.
 */
test("M4: complete an SSOP in airplane mode, reload offline, then sync with no duplicates", async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);

  // Online: register the device and let the service worker take control and cache the app.
  await page.goto("/app/login?next=/app/device");
  await page.getByLabel("Email").fill("admin@demo.ica.test");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByLabel("Device name").fill(`Offline phone ${Date.now() % 10000}`);
  await page.getByRole("button", { name: "Register device" }).click();
  await expect(page).toHaveURL(/\/app\/cleaner/);
  await expect
    .poll(() =>
      page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).some((r) => !!r.active)),
    )
    .toBe(true);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  // Online sign-in once (caches PIN hashes and tonight's tasks), then sign out.
  await page.getByRole("button", { name: "Ramon Dela Cruz" }).click();
  await pressDigits(page, "3333");
  await page.getByRole("button", { name: /English/ }).click();
  await page.getByRole("button", { name: "I understand" }).click();
  await expect(page.getByRole("button", { name: /Slicer 2/ })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();

  // Airplane mode on. Sign in again with no signal.
  await context.setOffline(true);
  await page.getByRole("button", { name: "Ramon Dela Cruz" }).click();
  await pressDigits(page, "3333");
  await expect(page.getByRole("heading", { name: "Tonight's cleaning" })).toBeVisible();
  await page.getByRole("button", { name: /Slicer 2/ }).click();

  // Slicer 2: 9 steps, photos at 1, 4 and 7, a 10 s dwell at 5, ATP at 9.
  const total = 9;
  for (let n = 1; n <= 8; n++) {
    await step(page, n, total);
    if (n === 1 || n === 4 || n === 7) {
      await page.getByLabel("Take photo").setInputFiles(photo);
      await expect(page.getByRole("button", { name: "Retake photo" })).toBeVisible();
    }
    if (n === 5) {
      await page.getByRole("button", { name: "Finish early" }).click();
      await page.getByRole("button", { name: "Finish early" }).click();
      continue;
    }
    if (n === 3) {
      await page.getByRole("button", { name: "Add note" }).click();
      await page.getByLabel("Add note").fill("Walang tubig sa hose 2, ginamit ang hose 3");
    }
    await page.getByRole("button", { name: "Done" }).click();
  }
  await step(page, 9, total);
  await pressDigits(page, "95");
  await page.getByRole("button", { name: "Save reading" }).click();
  await expect(page.getByRole("heading", { name: "Task finished" })).toBeVisible();

  // Everything is waiting on the device: 9 records + 3 photos.
  await expect(page.getByRole("status")).toContainText("Saved on device — 12 items waiting to sync");
  const [{ count: before }] = await query<{ count: string }>(
    `select count(*) from step_records r join tasks t on t.id = r.task_id join equipment e on e.id = t.equipment_id
     where e.name = 'Slicer 2'`,
  );
  expect(Number(before)).toBe(0);

  // Close and reopen while still offline: the app loads from the service worker, progress intact.
  await page.reload();
  await expect(page.getByRole("banner")).toContainText("Ramon Dela Cruz");
  await expect(page.getByRole("status")).toContainText("12 items waiting to sync");
  await expect(page.getByRole("button", { name: /Slicer 2/ })).toContainText("9 of 9 steps");

  // Signal back: everything syncs.
  await context.setOffline(false);
  await expect(page.getByRole("status")).toContainText("All saved", { timeout: 45_000 });

  const records = await query<{
    client_record_id: string;
    note_original: string | null;
    atp_value: number | null;
  }>(
    `select r.client_record_id, r.note_original, r.atp_value
     from step_records r join tasks t on t.id = r.task_id join equipment e on e.id = t.equipment_id
     where e.name = 'Slicer 2'`,
  );
  expect(records).toHaveLength(9);
  expect(new Set(records.map((r) => r.client_record_id)).size).toBe(9);
  expect(records.some((r) => r.note_original?.startsWith("Walang tubig"))).toBe(true);
  expect(records.some((r) => r.atp_value === 95)).toBe(true);

  const [{ photos }] = await query<{ photos: string }>(
    `select count(*) as photos from photos p join step_records r on r.id = p.step_record_id
     join tasks t on t.id = r.task_id join equipment e on e.id = t.equipment_id where e.name = 'Slicer 2'`,
  );
  expect(Number(photos)).toBe(3);

  const [task] = await query<{ status: string; site_id: string }>(
    `select t.status, t.site_id from tasks t join equipment e on e.id = t.equipment_id where e.name = 'Slicer 2'`,
  );
  expect(task.status).toBe("completed");
  const [chain] = await query<{ verified: boolean }>(`select verified from verify_chain($1)`, [task.site_id]);
  expect(chain.verified).toBe(true);
});

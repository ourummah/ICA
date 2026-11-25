import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { query } from "./db";

const password = process.env.DEMO_STAFF_PASSWORD ?? "ica-demo-local";
const photo = path.join(import.meta.dirname, "fixtures/test-photo.png");

// The cleaner app is a phone app; run it once, on the phone profile.
test.skip(({ isMobile }) => !isMobile, "Cleaner app is tested on the phone profile");

async function registerDevice(page: Page) {
  await page.goto("/app/login?next=/app/device");
  await page.getByLabel("Email").fill("admin@demo.ica.test");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Register this device" })).toBeVisible();
  await page.getByLabel("Device name").fill(`Test phone ${Date.now() % 10000}`);
  await page.getByRole("button", { name: "Register device" }).click();
  await expect(page).toHaveURL(/\/app\/cleaner/);
}

async function takePhoto(page: Page) {
  await page.getByLabel("Take photo").setInputFiles(photo);
  await expect(page.getByRole("button", { name: "Retake photo" })).toBeVisible();
}

test("F2/F3: cleaner signs in with PIN and completes the conveyor SSOP with photos, timers and ATP", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await registerDevice(page);

  // Sign-in: name tile, then PIN. A wrong PIN is refused.
  await expect(page.getByRole("heading", { name: "Who is cleaning?" })).toBeVisible();
  await page.getByRole("button", { name: "Maria Santos" }).click();
  for (const d of "9999") await page.getByRole("button", { name: d, exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Wrong PIN" })).toBeVisible();
  for (const d of "1111") await page.getByRole("button", { name: d, exact: true }).click();

  // First sign-in: language, then consent. The picker opens in Maria's preferred language (Tagalog).
  await expect(page.getByRole("heading", { name: "Piliin ang wika mo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tagalog" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /English/ }).click();
  await expect(page.getByRole("heading", { name: "Before you start" })).toBeVisible();
  await page.getByRole("button", { name: "I understand" }).click();

  // Task list: Maria's conveyor task. The header shows her name and save status.
  await expect(page.getByRole("heading", { name: "Tonight's cleaning" })).toBeVisible();
  await expect(page.getByRole("banner")).toContainText("Maria Santos");
  await expect(page.getByRole("status")).toContainText("All saved");
  await page.getByRole("button", { name: /Conveyor belt/ }).click();

  // 1. Isolate: photo required before Done.
  await expect(page.getByText("Step 1 of 10")).toBeVisible();
  await expect(page.getByRole("button", { name: "Done" })).toBeDisabled();
  await takePhoto(page);
  await page.getByRole("button", { name: "Done" }).click();

  // 2-3. Dry clean, pre-rinse.
  await expect(page.getByText("Step 2 of 10")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Step 3 of 10")).toBeVisible();

  // Progress survives a refresh: still signed in, still on step 3.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tonight's cleaning" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Conveyor belt/ })).toContainText("2 of 10 steps");
  await page.getByRole("button", { name: /Conveyor belt/ }).click();
  await expect(page.getByText("Step 3 of 10")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();

  // 4. Foam: chemical shown prominently, photo required.
  await expect(page.getByText("Step 4 of 10")).toBeVisible();
  await expect(page.getByText("Alkaline foam", { exact: true })).toBeVisible();
  await takePhoto(page);
  await page.getByRole("button", { name: "Done" }).click();

  // 5. Dwell 15 (fast timers: seconds). Finish early takes two taps: this will be a dwell_short.
  await expect(page.getByText("Step 5 of 10")).toBeVisible();
  await expect(page.getByRole("timer")).toBeVisible();
  await page.getByRole("button", { name: "Finish early" }).click();
  await expect(page.getByText("Timer not finished")).toBeVisible();
  await page.getByRole("button", { name: "Finish early" }).click();

  // 6-7. Scrub (with a note), rinse.
  await expect(page.getByText("Step 6 of 10")).toBeVisible();
  await page.getByRole("button", { name: "Add note" }).click();
  await page.getByLabel("Add note").fill("Maraming taba sa ilalim ng belt");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Step 7 of 10")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();

  // 8. Inspect: photo.
  await expect(page.getByText("Step 8 of 10")).toBeVisible();
  await takePhoto(page);
  await page.getByRole("button", { name: "Done" }).click();

  // 9. Sanitise: 10 s contact time, wait it out this time.
  await expect(page.getByText("Step 9 of 10")).toBeVisible();
  await expect(page.getByText("Time is up")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Done" }).click();

  // 10. ATP 210 > 150: fail guidance, then record it.
  await expect(page.getByText("Step 10 of 10")).toBeVisible();
  for (const d of "210") await page.getByRole("button", { name: d, exact: true }).click();
  await page.getByRole("button", { name: "Save reading" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Fail — re-clean" })).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByRole("heading", { name: "Task finished" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("All saved", { timeout: 20_000 });

  // Server side: 10 chained records, 3 verified photos, task completed, chain intact.
  const [task] = await query<{ id: string; status: string; site_id: string }>(
    `select t.id, t.status, t.site_id from tasks t join equipment e on e.id = t.equipment_id
     where e.name like 'Conveyor belt%' order by t.created_at desc limit 1`,
  );
  expect(task.status).toBe("completed");
  const records = await query<{
    result: string;
    atp_value: number | null;
    note_original: string | null;
    timer_started_at: string | null;
    timer_ended_at: string | null;
  }>(
    `select r.result, r.atp_value, r.note_original, r.timer_started_at, r.timer_ended_at
     from step_records r join ssop_steps s on s.id = r.ssop_step_id where r.task_id = $1 order by s.step_no`,
    [task.id],
  );
  expect(records).toHaveLength(10);
  expect(records[9]).toMatchObject({ result: "failed", atp_value: 210 });
  expect(records[5].note_original).toBe("Maraming taba sa ilalim ng belt");
  const dwellSeconds =
    (Date.parse(records[4].timer_ended_at!) - Date.parse(records[4].timer_started_at!)) / 1000;
  expect(dwellSeconds).toBeLessThan(15);
  const photos = await query<{ sha256: string }>(
    `select p.sha256 from photos p join step_records r on r.id = p.step_record_id where r.task_id = $1`,
    [task.id],
  );
  expect(photos).toHaveLength(3);
  const [chain] = await query<{ verified: boolean }>(`select verified from verify_chain($1)`, [task.site_id]);
  expect(chain.verified).toBe(true);
});

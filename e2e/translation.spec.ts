import { expect, test } from "@playwright/test";

import { query } from "./db";

const password = process.env.DEMO_STAFF_PASSWORD ?? "ica-demo-local";

test.skip(({ isMobile }) => isMobile, "Runs once, from the desktop project");

/**
 * SPEC F8 (with AI_TRANSLATE_FAKE, so no network): a cleaner's Tagalog note gets an English
 * translation labelled "AI-translated" next to the original. The supervisor confirms it, then
 * corrects it; each review is a new row and the original and AI rows are kept.
 */
test("F8: a Tagalog note is shown with a labelled translation the supervisor can confirm and correct", async ({
  page,
}) => {
  const note = `Kulang ang foam sa ilalim ng mesa ${Date.now() % 10000}`;
  const [rec] = await query<{ id: string; task_id: string }>(
    `insert into step_records (site_id, task_id, ssop_step_id, profile_id, client_record_id, result, payload_hash, note_original, note_language)
     select t.site_id, t.id, s.id, t.assigned_profile_id, gen_random_uuid(), 'done', repeat('a', 64), $1, 'tl'
     from tasks t join equipment e on e.id = t.equipment_id join ssop_steps s on s.ssop_id = t.ssop_id
     where e.name = 'Boning table 3' order by s.step_no limit 1
     returning id, task_id`,
    [note],
  );

  // Opening the zone board runs the translation sweep after the response.
  await page.goto("/app/login?next=/app/supervisor");
  await page.getByLabel("Email").fill("supervisor@demo.ica.test");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Zone board" })).toBeVisible();

  const block = page.locator(`[data-note="${rec.id}"]`);
  await expect(async () => {
    await page.goto(`/app/supervisor/tasks/${rec.task_id}`);
    await expect(block.getByText("AI-translated")).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expect(block).toContainText("Original · Tagalog");
  await expect(block).toContainText(note);
  await expect(block.locator("[data-english]")).toHaveText(`[test translation from tl] ${note}`);
  await expect(block).toContainText("AI translation for reference only");

  // Confirm as is.
  const form = page.getByRole("form", { name: `Review translation ${rec.id}` });
  await form.getByRole("button", { name: "Confirm translation" }).click();
  await expect(block.getByText(/Supervisor-confirmed/)).toBeVisible();

  // Correct it.
  await form.getByLabel("English").fill("Not enough foam under the table");
  await form.getByRole("button", { name: "Save correction" }).click();
  await expect(block.locator("[data-english]")).toHaveText("Not enough foam under the table");

  const rows = await query<{ source: string; text_en: string }>(
    `select source, text_en from note_translations where step_record_id = $1 order by created_at`,
    [rec.id],
  );
  expect(rows.map((r) => r.source)).toEqual(["ai", "human", "human"]);
  expect(rows[2].text_en).toBe("Not enough foam under the table");
  const [orig] = await query<{ note_original: string }>(
    `select note_original from step_records where id = $1`,
    [rec.id],
  );
  expect(orig.note_original).toBe(note);
});

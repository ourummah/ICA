/** M8: the translation sweep writes AI rows only for untranslated non-English notes; supervisors add human rows. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { translatePendingNotes } from "@/lib/ai/notes";
import type { Translator } from "@/lib/ai/translate";

import {
  addMembership,
  createOrg,
  createProfile,
  createSite,
  createStaff,
  deleteTestAuthUsers,
  populateSite,
  sql,
  type Client,
} from "./helpers";

let orgA: string, orgB: string, siteA: string, siteB: string, cleanerA: string;
let taskId: string, stepId: string;
let supervisor: Client, supervisorId: string, siteAdmin: Client, otherSupervisor: Client;
let calls: { note: string; language: string }[] = [];

const stub: Translator = {
  async translate(note, language) {
    calls.push({ note, language });
    if (note.includes("FAIL")) throw new Error("stub failure");
    return `EN(${note})`;
  },
};

beforeAll(async () => {
  orgA = await createOrg("Translate A", "processor");
  orgB = await createOrg("Translate B", "processor");
  siteA = await createSite(orgA, "Translate Site A");
  siteB = await createSite(orgB, "Translate Site B");
  cleanerA = await createProfile("Tr Cleaner A");
  await addMembership(cleanerA, orgA, siteA, "cleaner");
  ({ client: supervisor, profileId: supervisorId } = await createStaff(
    "tr-sup-a",
    orgA,
    siteA,
    "supervisor",
  ));
  siteAdmin = (await createStaff("tr-admin-a", orgA, siteA, "site_admin")).client;
  otherSupervisor = (await createStaff("tr-sup-b", orgB, siteB, "supervisor")).client;
  const fx = await populateSite(siteA, cleanerA, supervisorId);
  taskId = fx.taskId;
  stepId = fx.stepId;
});

afterAll(async () => {
  await sql(`delete from organisations where id = any($1)`, [[orgA, orgB]]).catch(() => undefined);
  await sql(`delete from profiles where id = $1`, [cleanerA]).catch(() => undefined);
  await deleteTestAuthUsers();
});

async function record(note: string | null, language: string | null): Promise<string> {
  const [r] = await sql<{ id: string }>(
    `insert into step_records (site_id, task_id, ssop_step_id, profile_id, client_record_id, result, payload_hash, note_original, note_language)
     values ($1, $2, $3, $4, gen_random_uuid(), 'done', repeat('c', 64), $5, $6) returning id`,
    [siteA, taskId, stepId, cleanerA, note, language],
  );
  return r.id;
}

async function translations(recordId: string) {
  return sql<{ text_en: string; source: string; created_by: string | null }>(
    `select text_en, source, created_by from note_translations where step_record_id = $1 order by created_at`,
    [recordId],
  );
}

describe("translatePendingNotes", () => {
  it("translates only untranslated non-English notes, keeps originals, and retries failures later", async () => {
    const tl = await record("Kulang ang foam sa conveyor", "tl");
    const id = await record("Sabuk masih kotor", "id");
    const en = await record("All good", "en");
    const empty = await record(null, null);
    const failing = await record("FAIL ito", "tl");
    calls = [];

    const result = await translatePendingNotes(siteA, { translator: stub });
    // The fixture's record already has a translation, so it is not sent again.
    expect(calls.map((c) => c.note).sort()).toEqual(
      ["FAIL ito", "Kulang ang foam sa conveyor", "Sabuk masih kotor"].sort(),
    );
    expect(calls.find((c) => c.note.startsWith("Kulang"))?.language).toBe("tl");
    expect(result).toEqual({ translated: 2, failed: 1 });

    expect(await translations(tl)).toEqual([
      { text_en: "EN(Kulang ang foam sa conveyor)", source: "ai", created_by: null },
    ]);
    expect((await translations(id))[0]?.source).toBe("ai");
    expect(await translations(en)).toEqual([]);
    expect(await translations(empty)).toEqual([]);
    expect(await translations(failing)).toEqual([]);
    const [orig] = await sql<{ note_original: string }>(
      `select note_original from step_records where id = $1`,
      [tl],
    );
    expect(orig.note_original).toBe("Kulang ang foam sa conveyor");

    // A second sweep only retries the failure.
    calls = [];
    await translatePendingNotes(siteA, { translator: stub });
    expect(calls.map((c) => c.note)).toEqual(["FAIL ito"]);
  });

  it("can be limited to given records and never crosses sites", async () => {
    const a = await record("Tapos na ang banlaw", "tl");
    const b = await record("Basa pa ang sahig", "tl");
    calls = [];
    await translatePendingNotes(siteA, { translator: stub, recordIds: [a] });
    expect(calls.map((c) => c.note)).toEqual(["Tapos na ang banlaw"]);
    calls = [];
    await translatePendingNotes(siteB, { translator: stub, recordIds: [b] });
    expect(calls).toEqual([]);
  });
});

describe("human review rows", () => {
  it("lets a supervisor add a confirmed translation as a new row, but not an AI row or another site's", async () => {
    const r = await record("Walang sabon", "tl");
    await translatePendingNotes(siteA, { translator: stub, recordIds: [r] });

    const ok = await supervisor.from("note_translations").insert({
      step_record_id: r,
      site_id: siteA,
      text_en: "No soap",
      source: "human",
      created_by: supervisorId,
    });
    expect(ok.error).toBeNull();
    expect((await translations(r)).map((t) => t.source)).toEqual(["ai", "human"]);

    const fakeAi = await supervisor
      .from("note_translations")
      .insert({ step_record_id: r, site_id: siteA, text_en: "x", source: "ai", created_by: supervisorId });
    expect(fakeAi.error).not.toBeNull();

    const admin = await siteAdmin
      .from("note_translations")
      .insert({ step_record_id: r, site_id: siteA, text_en: "x", source: "human", created_by: supervisorId });
    expect(admin.error).not.toBeNull();

    const other = await otherSupervisor
      .from("note_translations")
      .insert({ step_record_id: r, site_id: siteA, text_en: "x", source: "human", created_by: supervisorId });
    expect(other.error).not.toBeNull();
    const { data: seen } = await otherSupervisor
      .from("note_translations")
      .select("id")
      .eq("step_record_id", r);
    expect(seen).toEqual([]);
  });
});

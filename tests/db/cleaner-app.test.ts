/** Device-side cleaner preferences, my_device(), and task status derived from step records. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  addMembership,
  createDevice,
  createOrg,
  createProfile,
  createSite,
  createStaff,
  deleteTestAuthUsers,
  sql,
  type Client,
} from "./helpers";

let orgA: string, orgB: string, siteA: string, cleanerA: string, cleanerB: string;
let deviceA: Client, deviceAId: string, staff: Client;
let taskId: string, steps: string[];

beforeAll(async () => {
  orgA = await createOrg("Cleaner App A", "processor");
  orgB = await createOrg("Cleaner App B", "processor");
  siteA = await createSite(orgA, "Cleaner Site A");
  const siteB = await createSite(orgB, "Cleaner Site B");
  cleanerA = await createProfile("App Cleaner A");
  cleanerB = await createProfile("App Cleaner B");
  await addMembership(cleanerA, orgA, siteA, "cleaner");
  await addMembership(cleanerB, orgB, siteB, "cleaner");
  const d = await createDevice("app-device-a", siteA);
  deviceA = d.client;
  deviceAId = d.deviceId;
  staff = (await createStaff("app-staff-a", orgA, siteA, "supervisor")).client;

  const [zone] = await sql<{ id: string }>(
    `insert into zones (site_id, name) values ($1, 'Z') returning id`,
    [siteA],
  );
  const [eq] = await sql<{ id: string }>(
    `insert into equipment (site_id, zone_id, name) values ($1, $2, 'E') returning id`,
    [siteA, zone.id],
  );
  const [ssop] = await sql<{ id: string }>(
    `insert into ssops (site_id, equipment_id, version) values ($1, $2, 1) returning id`,
    [siteA, eq.id],
  );
  const rows = await sql<{ id: string }>(
    `insert into ssop_steps (site_id, ssop_id, step_no, step_type, title_en)
     values ($1, $2, 1, 'pre_rinse', 'One'), ($1, $2, 2, 'rinse', 'Two') returning id`,
    [siteA, ssop.id],
  );
  steps = rows.map((r) => r.id);
  await sql(`update ssops set status = 'active' where id = $1`, [ssop.id]);
  const [shift] = await sql<{ id: string }>(
    `insert into shifts (site_id, shift_date, starts_at, ends_at) values ($1, current_date, now(), now() + interval '8 hours') returning id`,
    [siteA],
  );
  const [task] = await sql<{ id: string }>(
    `insert into tasks (site_id, shift_id, equipment_id, ssop_id, assigned_profile_id) values ($1, $2, $3, $4, $5) returning id`,
    [siteA, shift.id, eq.id, ssop.id, cleanerA],
  );
  taskId = task.id;
});

afterAll(async () => {
  await sql(`delete from organisations where id = any($1)`, [[orgA, orgB]]).catch(() => undefined);
  await sql(`delete from profiles where id = any($1)`, [[cleanerA, cleanerB]]).catch(() => undefined);
  await deleteTestAuthUsers();
});

async function record(stepId: string) {
  return deviceA.from("step_records").insert({
    site_id: siteA,
    task_id: taskId,
    ssop_step_id: stepId,
    profile_id: cleanerA,
    device_id: deviceAId,
    client_record_id: crypto.randomUUID(),
    result: "done",
    payload_hash: "a".repeat(64),
  });
}

describe("my_device", () => {
  it("returns the device's own site, and nothing for staff", async () => {
    const { data } = await deviceA.rpc("my_device");
    expect(data?.[0]).toMatchObject({ device_id: deviceAId, site_id: siteA, site_name: "Cleaner Site A" });
    const { data: none } = await staff.rpc("my_device");
    expect(none).toEqual([]);
  });

  it("returns nothing once the device is revoked", async () => {
    await sql(`update devices set revoked_at = now() where id = $1`, [deviceAId]);
    const { data } = await deviceA.rpc("my_device");
    expect(data).toEqual([]);
    await sql(`update devices set revoked_at = null where id = $1`, [deviceAId]);
  });
});

describe("set_cleaner_preferences", () => {
  it("saves language and consent for a cleaner on the device's site", async () => {
    const { error } = await deviceA.rpc("set_cleaner_preferences", {
      p_profile_id: cleanerA,
      p_language: "tl",
      p_accept_consent: true,
    });
    expect(error).toBeNull();
    const [row] = await sql<{ preferred_language: string; consent_accepted_at: string | null }>(
      `select preferred_language, consent_accepted_at from profiles where id = $1`,
      [cleanerA],
    );
    expect(row.preferred_language).toBe("tl");
    expect(row.consent_accepted_at).not.toBeNull();
  });

  it("refuses a cleaner from another organisation's site", async () => {
    const { error } = await deviceA.rpc("set_cleaner_preferences", {
      p_profile_id: cleanerB,
      p_language: "id",
    });
    expect(error).not.toBeNull();
  });
});

describe("task status follows step records", () => {
  it("goes pending → in_progress → completed and marks the device as seen", async () => {
    const status = async () =>
      (await sql<{ status: string }>(`select status from tasks where id = $1`, [taskId]))[0].status;
    expect(await status()).toBe("pending");
    expect((await record(steps[0])).error).toBeNull();
    expect(await status()).toBe("in_progress");
    expect((await record(steps[1])).error).toBeNull();
    expect(await status()).toBe("completed");
    const [device] = await sql<{ last_seen_at: string | null }>(
      `select last_seen_at from devices where id = $1`,
      [deviceAId],
    );
    expect(device.last_seen_at).not.toBeNull();
  });
});

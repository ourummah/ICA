/** Cleaner PINs on shared devices, and the demo seed. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { demoCleaners, demoStaff, seedDemo } from "@/lib/demo/seed";

import {
  addMembership,
  admin,
  anonClient,
  createDevice,
  createOrg,
  createProfile,
  createSite,
  createStaff,
  deleteTestAuthUsers,
  sql,
  type Client,
} from "./helpers";

let orgA: string, orgB: string;
let cleanerA: string, cleanerB: string;
let deviceA: Client, deviceB: Client, staffA: Client;

beforeAll(async () => {
  orgA = await createOrg("PIN Processor A", "processor");
  orgB = await createOrg("PIN Processor B", "processor");
  const siteA = await createSite(orgA, "PIN Site A");
  const siteB = await createSite(orgB, "PIN Site B");
  cleanerA = await createProfile("Pin Cleaner A");
  cleanerB = await createProfile("Pin Cleaner B");
  await addMembership(cleanerA, orgA, siteA, "cleaner");
  await addMembership(cleanerB, orgB, siteB, "cleaner");
  await sql(`select set_cleaner_pin($1, '4821')`, [cleanerA]);
  await sql(`select set_cleaner_pin($1, '1357')`, [cleanerB]);
  deviceA = (await createDevice("pin-device-a", siteA)).client;
  deviceB = (await createDevice("pin-device-b", siteB)).client;
  staffA = (await createStaff("pin-staff-a", orgA, siteA, "supervisor")).client;
});

afterAll(async () => {
  await sql(`delete from organisations where id = any($1)`, [[orgA, orgB]]).catch(() => undefined);
  await sql(`delete from profiles where id = any($1)`, [[cleanerA, cleanerB]]).catch(() => undefined);
  await deleteTestAuthUsers();
});

describe("cleaner PIN sign-in", () => {
  it("stores PINs as bcrypt hashes, never in plain text", async () => {
    const [row] = await sql<{ pin_hash: string }>(`select pin_hash from cleaner_pins where profile_id = $1`, [
      cleanerA,
    ]);
    expect(row.pin_hash).toMatch(/^\$2[aby]\$/);
    expect(row.pin_hash).not.toContain("4821");
  });

  it("accepts the right PIN on the cleaner's site device", async () => {
    const { data, error } = await deviceA.rpc("verify_cleaner_pin", {
      p_profile_id: cleanerA,
      p_pin: "4821",
    });
    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  it("rejects a wrong PIN", async () => {
    const { data } = await deviceA.rpc("verify_cleaner_pin", { p_profile_id: cleanerA, p_pin: "0000" });
    expect(data).toBe(false);
  });

  it("rejects a cleaner from another organisation's site, even with the right PIN", async () => {
    const { data } = await deviceA.rpc("verify_cleaner_pin", { p_profile_id: cleanerB, p_pin: "1357" });
    expect(data).toBe(false);
  });

  it("is only callable from a registered device", async () => {
    const { error } = await staffA.rpc("verify_cleaner_pin", { p_profile_id: cleanerA, p_pin: "4821" });
    expect(error).not.toBeNull();
    const anon = await anonClient().rpc("verify_cleaner_pin", { p_profile_id: cleanerA, p_pin: "4821" });
    expect(anon.error).not.toBeNull();
  });

  it("lists only the device's own site cleaners on the sign-in screen", async () => {
    const { data: a } = await deviceA.rpc("device_cleaners");
    expect((a ?? []).map((c) => c.display_name)).toEqual(["Pin Cleaner A"]);
    const { data: b } = await deviceB.rpc("device_cleaners");
    expect((b ?? []).map((c) => c.display_name)).toEqual(["Pin Cleaner B"]);
  });

  it("does not let app users set PINs directly", async () => {
    const { error } = await staffA.rpc("set_cleaner_pin", { p_profile_id: cleanerA, p_pin: "9999" });
    expect(error).not.toBeNull();
  });

  it("rejects PINs that are not exactly 4 digits", async () => {
    const { error } = await admin.rpc("set_cleaner_pin", { p_profile_id: cleanerA, p_pin: "12a4" });
    expect(error?.message).toMatch(/4 digits/);
  });
});

describe("demo seed", () => {
  it("creates the demo tenant from scratch, idempotently, with a verified chain", async () => {
    await seedDemo(admin, { staffPassword: "ica-demo-local" });
    const result = await seedDemo(admin, { staffPassword: "ica-demo-local" });
    expect(result.taskCount).toBe(8);

    const orgs = await sql(`select 1 from organisations where name = 'Southern Cross Meats (Demo)'`);
    expect(orgs.length).toBe(1);
    const zones = await sql<{ name: string; risk_level: string }>(
      `select name, risk_level from zones where site_id = $1 order by sort_order`,
      [result.siteId],
    );
    expect(zones.map((z) => z.name)).toEqual([
      "Boning Room",
      "Slicing & Packing (RTE)",
      "Mincing",
      "Chillers",
    ]);

    const [conveyor] = await sql<{ steps: string; atp_max: number }>(
      `select count(st.*) as steps, max(st.atp_pass_max) as atp_max
       from equipment e join ssops s on s.equipment_id = e.id and s.status = 'active'
       join ssop_steps st on st.ssop_id = s.id
       where e.site_id = $1 and e.name like 'Conveyor belt%'`,
      [result.siteId],
    );
    expect(Number(conveyor.steps)).toBe(10);
    expect(conveyor.atp_max).toBe(150);

    const [chain] = await sql<{ verified: boolean }>(`select verified from verify_chain($1)`, [
      result.siteId,
    ]);
    expect(chain.verified).toBe(true);

    // Staff can sign in and see their site; PINs work for cleaners.
    const qa = demoStaff.find((s) => s.key === "qa")!;
    const client = anonClient();
    const signIn = await client.auth.signInWithPassword({ email: qa.email, password: "ica-demo-local" });
    expect(signIn.error).toBeNull();
    const { data: sites } = await client.from("sites").select("id");
    expect((sites ?? []).map((s) => s.id)).toEqual([result.siteId]);

    const cleaners = await sql<{ id: string; display_name: string }>(
      `select p.id, p.display_name from profiles p join memberships m on m.profile_id = p.id
       where m.site_id = $1 and m.role = 'cleaner' order by p.display_name`,
      [result.siteId],
    );
    expect(cleaners.length).toBe(demoCleaners.length);
    const [pinOk] = await sql<{ ok: boolean }>(
      `select pin_hash = extensions.crypt($2, pin_hash) as ok from cleaner_pins where profile_id = $1`,
      [cleaners.find((c) => c.display_name === "Maria Santos")!.id, "1111"],
    );
    expect(pinOk.ok).toBe(true);
  });
});

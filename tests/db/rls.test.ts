/**
 * Row Level Security: users must never read other sites' or other organisations' data.
 *
 * Fixture:
 *   Processor A owns sites A1 and A2. Processor B owns site B1.
 *   Contractor C has access to A1 only. Contractor D has access to B1 only.
 * Every site-scoped table gets one row per site, then each user's view is checked.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  addMembership,
  anonClient,
  createDevice,
  createOrg,
  createProfile,
  createSite,
  createStaff,
  deleteTestAuthUsers,
  populateSite,
  sql,
  type Client,
  type SiteFixture,
} from "./helpers";

/** Every table that carries site_id. A new site-scoped table must be added here. */
const SITE_SCOPED_TABLES = [
  "zones",
  "equipment",
  "chemicals",
  "ssops",
  "ssop_steps",
  "shifts",
  "tasks",
  "devices",
  "step_records",
  "note_translations",
  "photos",
  "exceptions",
  "preop_inspections",
  "preop_items",
  "releases",
  "audit_events",
  "site_access",
] as const;

/** Tables without site_id, each covered by its own test below. */
const OTHER_TABLES = [
  "organisations",
  "sites",
  "profiles",
  "memberships",
  "cleaner_pins",
  "demo_requests",
] as const;

let orgA: string, orgB: string, orgC: string, orgD: string;
let siteA1: SiteFixture, siteA2: SiteFixture, siteB1: SiteFixture;

const users = {} as Record<
  "adminA1" | "supervisorA" | "qaB" | "contractorC" | "contractorD" | "deviceA1",
  { client: Client; profileId?: string }
>;

async function siteIdsVisible(
  client: Client,
  table: (typeof SITE_SCOPED_TABLES)[number],
): Promise<Set<string>> {
  const { data, error } = await client.from(table).select("site_id");
  expect(error, `${table}: ${error?.message}`).toBeNull();
  return new Set((data ?? []).map((r: { site_id: string }) => r.site_id));
}

beforeAll(async () => {
  orgA = await createOrg("Processor A", "processor");
  orgB = await createOrg("Processor B", "processor");
  orgC = await createOrg("Contractor C", "contractor");
  orgD = await createOrg("Contractor D", "contractor");
  const a1 = await createSite(orgA, "A1");
  const a2 = await createSite(orgA, "A2");
  const b1 = await createSite(orgB, "B1");
  await sql(`insert into site_access (site_id, org_id) values ($1, $2), ($3, $4)`, [a1, orgC, b1, orgD]);

  const cleanerA = await createProfile("Cleaner A");
  const cleanerB = await createProfile("Cleaner B");
  await addMembership(cleanerA, orgA, null, "cleaner");
  await addMembership(cleanerB, orgB, null, "cleaner");
  await sql(`select set_cleaner_pin($1, '1234')`, [cleanerA]);

  users.adminA1 = await createStaff("admin-a1", orgA, a1, "site_admin");
  users.supervisorA = await createStaff("supervisor-a", orgA, null, "supervisor");
  users.qaB = await createStaff("qa-b", orgB, b1, "qa");
  users.contractorC = await createStaff("contractor-c", orgC, null, "contractor_admin");
  users.contractorD = await createStaff("contractor-d", orgD, null, "contractor_admin");
  users.deviceA1 = await createDevice("device-a1", a1);

  const qaA = users.supervisorA.profileId!;
  siteA1 = await populateSite(a1, cleanerA, qaA);
  siteA2 = await populateSite(a2, cleanerA, qaA);
  siteB1 = await populateSite(b1, cleanerB, users.qaB.profileId!);
});

afterAll(async () => {
  await sql(`delete from organisations where id = any($1)`, [[orgA, orgB, orgC, orgD]]).catch(
    () => undefined,
  );
  await deleteTestAuthUsers();
});

describe("RLS is enabled everywhere", () => {
  it("has RLS on every table in the public schema", async () => {
    const rows = await sql<{ tablename: string; rowsecurity: boolean }>(
      `select tablename, rowsecurity from pg_tables where schemaname = 'public'`,
    );
    const missing = rows.filter((r) => !r.rowsecurity).map((r) => r.tablename);
    expect(missing).toEqual([]);
  });

  it("covers every public table in these tests", async () => {
    const rows = await sql<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public'`,
    );
    const covered = new Set<string>([...SITE_SCOPED_TABLES, ...OTHER_TABLES]);
    expect(rows.map((r) => r.tablename).filter((t) => !covered.has(t))).toEqual([]);
  });
});

describe.each(SITE_SCOPED_TABLES)("%s", (table) => {
  it("site admin of A1 sees A1 only (not sister site A2, not processor B)", async () => {
    const seen = await siteIdsVisible(users.adminA1.client, table);
    expect(seen.has(siteA1.siteId)).toBe(true);
    expect(seen.has(siteA2.siteId)).toBe(false);
    expect(seen.has(siteB1.siteId)).toBe(false);
  });

  it("org-wide supervisor of A sees A1 and A2 but not B1", async () => {
    const seen = await siteIdsVisible(users.supervisorA.client, table);
    expect(seen.has(siteA1.siteId)).toBe(true);
    // A2 has no contractor, so it has no site_access rows to see.
    if (table !== "site_access") expect(seen.has(siteA2.siteId)).toBe(true);
    expect(seen.has(siteB1.siteId)).toBe(false);
  });

  it("contractor C sees only the site it was granted (A1)", async () => {
    const seen = await siteIdsVisible(users.contractorC.client, table);
    expect([...seen]).toEqual([siteA1.siteId]);
  });

  it("contractor D cannot read contractor C's site", async () => {
    const seen = await siteIdsVisible(users.contractorD.client, table);
    expect([...seen]).toEqual([siteB1.siteId]);
  });

  it("a registered device sees only its own site", async () => {
    const seen = await siteIdsVisible(users.deviceA1.client, table);
    expect([...seen]).toEqual([siteA1.siteId]);
  });

  it("anonymous users see nothing", async () => {
    const { data } = await anonClient().from(table).select("site_id");
    expect(data ?? []).toEqual([]);
  });
});

describe("tables without site_id", () => {
  it("sites: contractors see only granted sites", async () => {
    const { data } = await users.contractorC.client.from("sites").select("id");
    expect((data ?? []).map((s) => s.id)).toEqual([siteA1.siteId]);
    const { data: d } = await users.contractorD.client.from("sites").select("id");
    expect((d ?? []).map((s) => s.id)).toEqual([siteB1.siteId]);
  });

  it("organisations: contractor C sees itself and its client A, never B or D", async () => {
    const { data } = await users.contractorC.client.from("organisations").select("id");
    const ids = new Set((data ?? []).map((o) => o.id));
    expect(ids).toEqual(new Set([orgC, orgA]));
  });

  it("profiles: processor B's QA cannot see processor A's people", async () => {
    const { data } = await users.qaB.client.from("profiles").select("display_name");
    const names = (data ?? []).map((p) => p.display_name);
    expect(names).toContain("Cleaner B");
    expect(names).not.toContain("Cleaner A");
    expect(names.some((n) => n.startsWith("admin-a1") || n.startsWith("supervisor-a"))).toBe(false);
  });

  it("memberships: contractor D sees none of A's memberships", async () => {
    const { data } = await users.contractorD.client.from("memberships").select("org_id");
    expect((data ?? []).some((m) => m.org_id === orgA)).toBe(false);
  });

  it("cleaner_pins: no app user can read PIN hashes, not even the site's device", async () => {
    for (const u of Object.values(users)) {
      const { data } = await u.client.from("cleaner_pins").select("*");
      expect(data ?? []).toEqual([]);
    }
  });

  it("demo_requests: closed to app users and anonymous visitors", async () => {
    await sql(`insert into demo_requests (name, email) values ('Test', 'test@example.com')`);
    const { data } = await users.supervisorA.client.from("demo_requests").select("*");
    expect(data ?? []).toEqual([]);
    const { error } = await anonClient().from("demo_requests").insert({ name: "x", email: "x@example.com" });
    expect(error).not.toBeNull();
    await sql(`delete from demo_requests where email = 'test@example.com'`);
  });
});

describe("writes are limited by role and site", () => {
  it("contractor C can assign a task on its granted site", async () => {
    const { error } = await users.contractorC.client.from("tasks").insert({
      site_id: siteA1.siteId,
      shift_id: siteA1.shiftId,
      equipment_id: siteA1.equipmentId,
      ssop_id: siteA1.ssopId,
    });
    expect(error).toBeNull();
  });

  it("contractor C cannot create tasks on a site it has no access to", async () => {
    const { error } = await users.contractorC.client.from("tasks").insert({
      site_id: siteB1.siteId,
      shift_id: siteB1.shiftId,
      equipment_id: siteB1.equipmentId,
      ssop_id: siteB1.ssopId,
    });
    expect(error).not.toBeNull();
  });

  it("contractor C cannot change site setup (zones are site-admin only)", async () => {
    const { error } = await users.contractorC.client
      .from("zones")
      .insert({ site_id: siteA1.siteId, name: "Sneaky" });
    expect(error).not.toBeNull();
  });

  it("site admin cannot point a row at another site's parent (composite keys)", async () => {
    const { error } = await users.adminA1.client
      .from("equipment")
      .insert({ site_id: siteA1.siteId, zone_id: siteB1.zoneId, name: "Cross-site" });
    expect(error).not.toBeNull();
  });

  it("a device can write step records for its site only", async () => {
    const ok = await users.deviceA1.client.from("step_records").insert({
      site_id: siteA1.siteId,
      task_id: siteA1.taskId,
      ssop_step_id: siteA1.stepId,
      profile_id: (
        await sql<{ profile_id: string }>(`select profile_id from step_records where id = $1`, [
          siteA1.stepRecordId,
        ])
      )[0].profile_id,
      client_record_id: crypto.randomUUID(),
      result: "done",
      payload_hash: "c".repeat(64),
    });
    expect(ok.error).toBeNull();

    const bad = await users.deviceA1.client.from("step_records").insert({
      site_id: siteB1.siteId,
      task_id: siteB1.taskId,
      ssop_step_id: siteB1.stepId,
      profile_id: (
        await sql<{ profile_id: string }>(`select profile_id from step_records where id = $1`, [
          siteB1.stepRecordId,
        ])
      )[0].profile_id,
      client_record_id: crypto.randomUUID(),
      result: "done",
      payload_hash: "c".repeat(64),
    });
    expect(bad.error).not.toBeNull();
  });

  it("only QA can release a zone", async () => {
    const asSupervisor = await users.supervisorA.client.from("releases").insert({
      site_id: siteA1.siteId,
      zone_id: siteA1.zoneId,
      shift_id: siteA1.shiftId,
      qa_profile_id: users.supervisorA.profileId!,
      decision: "released",
    });
    expect(asSupervisor.error).not.toBeNull();
  });

  it("nobody can insert audit events directly", async () => {
    const { error } = await users.supervisorA.client.from("audit_events").insert({
      seq: 1,
      site_id: siteA1.siteId,
      entity: "x",
      action: "forged",
      prev_hash: "0",
      hash: "0",
    });
    expect(error).not.toBeNull();
  });

  it("a staff member cannot re-point their profile at another auth user", async () => {
    const { error } = await users.adminA1.client
      .from("profiles")
      .update({ auth_user_id: crypto.randomUUID() } as never)
      .eq("id", users.adminA1.profileId!);
    expect(error).not.toBeNull();
  });
});

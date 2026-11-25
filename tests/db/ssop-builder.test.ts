/** SSOP drafts, activation and versioning, step reordering, CSV replace and shift creation. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createOrg, createSite, createStaff, deleteTestAuthUsers, sql, type Client } from "./helpers";

let orgId: string, otherOrg: string, siteId: string, equipmentId: string;
let admin: Client, supervisor: Client, otherAdmin: Client;

async function steps(ssopId: string) {
  return sql<{ step_no: number; title_en: string }>(
    `select step_no, title_en from ssop_steps where ssop_id = $1 order by step_no`,
    [ssopId],
  );
}

const stepJson = (titles: string[]) =>
  titles.map((t) => ({
    step_type: "rinse",
    title_en: t,
    instructions_en: "",
    photo_required: false,
    atp_required: false,
  }));

beforeAll(async () => {
  orgId = await createOrg("Builder Processor", "processor");
  otherOrg = await createOrg("Other Processor", "processor");
  siteId = await createSite(orgId, "Builder Site");
  const otherSite = await createSite(otherOrg, "Other Site");
  const [zone] = await sql<{ id: string }>(
    `insert into zones (site_id, name) values ($1, 'Z') returning id`,
    [siteId],
  );
  const [eq] = await sql<{ id: string }>(
    `insert into equipment (site_id, zone_id, name) values ($1, $2, 'Slicer') returning id`,
    [siteId, zone.id],
  );
  equipmentId = eq.id;
  admin = (await createStaff("builder-admin", orgId, siteId, "site_admin")).client;
  supervisor = (await createStaff("builder-supervisor", orgId, siteId, "supervisor")).client;
  otherAdmin = (await createStaff("builder-other-admin", otherOrg, otherSite, "site_admin")).client;
});

afterAll(async () => {
  await sql(`delete from organisations where id = any($1)`, [[orgId, otherOrg]]).catch(() => undefined);
  await deleteTestAuthUsers();
});

describe("SSOP versioning", () => {
  let v1: string;

  it("only a site admin of the site can start a draft", async () => {
    expect((await supervisor.rpc("create_ssop_draft", { p_equipment_id: equipmentId })).error).not.toBeNull();
    expect((await otherAdmin.rpc("create_ssop_draft", { p_equipment_id: equipmentId })).error).not.toBeNull();
  });

  it("creates v1 as an empty draft, and returns the same draft if asked again", async () => {
    const first = await admin.rpc("create_ssop_draft", { p_equipment_id: equipmentId });
    expect(first.error).toBeNull();
    v1 = first.data!;
    const again = await admin.rpc("create_ssop_draft", { p_equipment_id: equipmentId });
    expect(again.data).toBe(v1);
    expect(await steps(v1)).toEqual([]);
  });

  it("refuses to activate a draft with no steps", async () => {
    expect((await admin.rpc("activate_ssop", { p_ssop_id: v1 })).error?.message).toMatch(/at least one step/);
  });

  it("imports steps from CSV data, replacing what was there", async () => {
    await admin.rpc("replace_ssop_steps", { p_ssop_id: v1, p_steps: stepJson(["Old"]) });
    const { data, error } = await admin.rpc("replace_ssop_steps", {
      p_ssop_id: v1,
      p_steps: stepJson(["A", "B", "C"]),
    });
    expect(error).toBeNull();
    expect(data).toBe(3);
    expect((await steps(v1)).map((s) => s.title_en)).toEqual(["A", "B", "C"]);
  });

  it("moves steps up and down and renumbers after a delete", async () => {
    const [, b] = await sql<{ id: string }>(`select id from ssop_steps where ssop_id = $1 order by step_no`, [
      v1,
    ]);
    await admin.rpc("move_ssop_step", { p_step_id: b.id, p_direction: -1 });
    expect((await steps(v1)).map((s) => s.title_en)).toEqual(["B", "A", "C"]);
    await admin.rpc("delete_ssop_step", { p_step_id: b.id });
    expect(await steps(v1)).toEqual([
      { step_no: 1, title_en: "A" },
      { step_no: 2, title_en: "C" },
    ]);
  });

  it("activates v1 and records who approved it", async () => {
    expect((await admin.rpc("activate_ssop", { p_ssop_id: v1 })).error).toBeNull();
    const [row] = await sql<{ status: string; approved_by: string | null }>(
      `select status, approved_by from ssops where id = $1`,
      [v1],
    );
    expect(row.status).toBe("active");
    expect(row.approved_by).not.toBeNull();
  });

  it("v2 starts as a copy of v1; activating it retires v1 and leaves v1's steps untouched", async () => {
    const { data: v2 } = await admin.rpc("create_ssop_draft", { p_equipment_id: equipmentId });
    expect(v2).not.toBe(v1);
    expect((await steps(v2!)).map((s) => s.title_en)).toEqual(["A", "C"]);
    await admin.rpc("replace_ssop_steps", { p_ssop_id: v2!, p_steps: stepJson(["New 1", "New 2"]) });
    expect((await admin.rpc("activate_ssop", { p_ssop_id: v2! })).error).toBeNull();

    const versions = await sql<{ version: number; status: string }>(
      `select version, status from ssops where equipment_id = $1 order by version`,
      [equipmentId],
    );
    expect(versions).toEqual([
      { version: 1, status: "retired" },
      { version: 2, status: "active" },
    ]);
    expect((await steps(v1)).map((s) => s.title_en)).toEqual(["A", "C"]);
  });

  it("cannot import into an active version", async () => {
    expect(
      (await admin.rpc("replace_ssop_steps", { p_ssop_id: v1, p_steps: stepJson(["X"]) })).error,
    ).not.toBeNull();
  });
});

describe("ensure_shift", () => {
  it("creates tonight's shift 22:00 to 06:00 site time, once", async () => {
    const first = await admin.rpc("ensure_shift", { p_site_id: siteId, p_shift_date: "2026-11-25" });
    expect(first.error).toBeNull();
    const second = await supervisor.rpc("ensure_shift", { p_site_id: siteId, p_shift_date: "2026-11-25" });
    expect(second.data).toBe(first.data);
    const [row] = await sql<{ starts: string; ends: string }>(
      `select to_char(starts_at at time zone 'Australia/Sydney', 'YYYY-MM-DD HH24:MI') as starts,
              to_char(ends_at at time zone 'Australia/Sydney', 'YYYY-MM-DD HH24:MI') as ends
       from shifts where id = $1`,
      [first.data],
    );
    expect(row).toEqual({ starts: "2026-11-25 22:00", ends: "2026-11-26 06:00" });
  });

  it("is refused for another organisation's site", async () => {
    expect(
      (await otherAdmin.rpc("ensure_shift", { p_site_id: siteId, p_shift_date: "2026-11-25" })).error,
    ).not.toBeNull();
  });
});

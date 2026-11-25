/** M6: pre-op checklist items, inspections, and the QA release rules. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  addMembership,
  createOrg,
  createProfile,
  createSite,
  createStaff,
  deleteTestAuthUsers,
  sql,
  type Client,
} from "./helpers";

let orgA: string, orgB: string, siteA: string, cleanerA: string;
let qa: Client, qaId: string, supervisor: Client, supervisorId: string, admin: Client, otherQa: Client;
let zoneId: string, otherZoneId: string, shiftId: string, taskId: string, otherTaskId: string;

beforeAll(async () => {
  orgA = await createOrg("Release A", "processor");
  orgB = await createOrg("Release B", "processor");
  siteA = await createSite(orgA, "Release Site A");
  const siteB = await createSite(orgB, "Release Site B");
  cleanerA = await createProfile("Rel Cleaner A");
  await addMembership(cleanerA, orgA, siteA, "cleaner");
  ({ client: qa, profileId: qaId } = await createStaff("rel-qa-a", orgA, siteA, "qa"));
  ({ client: supervisor, profileId: supervisorId } = await createStaff(
    "rel-sup-a",
    orgA,
    siteA,
    "supervisor",
  ));
  admin = (await createStaff("rel-admin-a", orgA, siteA, "site_admin")).client;
  otherQa = (await createStaff("rel-qa-b", orgB, siteB, "qa")).client;

  const zones = await sql<{ id: string }>(
    `insert into zones (site_id, name, sort_order) values ($1, 'Boning', 1), ($1, 'Chillers', 2) returning id`,
    [siteA],
  );
  [zoneId, otherZoneId] = zones.map((z) => z.id);
  const eqs = await sql<{ id: string }>(
    `insert into equipment (site_id, zone_id, name) values ($1, $2, 'Conveyor'), ($1, $3, 'Floor') returning id`,
    [siteA, zoneId, otherZoneId],
  );
  const ssops = await sql<{ id: string }>(
    `insert into ssops (site_id, equipment_id, version) values ($1, $2, 1), ($1, $3, 1) returning id`,
    [siteA, eqs[0].id, eqs[1].id],
  );
  for (const s of ssops) {
    await sql(
      `insert into ssop_steps (site_id, ssop_id, step_no, step_type, title_en) values ($1, $2, 1, 'rinse', 'Rinse')`,
      [siteA, s.id],
    );
    await sql(`update ssops set status = 'active' where id = $1`, [s.id]);
  }
  const [shift] = await sql<{ id: string }>(
    `insert into shifts (site_id, shift_date, starts_at, ends_at)
     values ($1, current_date, now() - interval '1 hour', now() + interval '7 hours') returning id`,
    [siteA],
  );
  shiftId = shift.id;
  const tasks = await sql<{ id: string }>(
    `insert into tasks (site_id, shift_id, equipment_id, ssop_id, assigned_profile_id)
     values ($1, $2, $3, $4, $6), ($1, $2, $5, $7, $6) returning id`,
    [siteA, shiftId, eqs[0].id, ssops[0].id, eqs[1].id, cleanerA, ssops[1].id],
  );
  [taskId, otherTaskId] = tasks.map((t) => t.id);
});

afterAll(async () => {
  await sql(`delete from organisations where id = any($1)`, [[orgA, orgB]]).catch(() => undefined);
  await sql(`delete from profiles where id = $1`, [cleanerA]).catch(() => undefined);
  await deleteTestAuthUsers();
});

function release(client: Client, profileId: string, extra: Record<string, unknown> = {}) {
  return client
    .from("releases")
    .insert({
      site_id: siteA,
      zone_id: zoneId,
      shift_id: shiftId,
      qa_profile_id: profileId,
      decision: "released" as const,
      ...extra,
    })
    .select("id, decided_at, override_open_exceptions, reason")
    .single();
}

async function openRedException(task: string): Promise<string> {
  const [x] = await sql<{ id: string }>(
    `insert into exceptions (site_id, task_id, type, severity, detail)
     values ($1, $2, 'atp_fail', 'red', '{}') returning id`,
    [siteA, task],
  );
  return x.id;
}

describe("preop_items", () => {
  it("QA and site admins manage the checklist; supervisors and other orgs cannot", async () => {
    const ok = await qa
      .from("preop_items")
      .insert({ site_id: siteA, label: "No pooled water", sort_order: 1 });
    expect(ok.error).toBeNull();
    expect((await admin.from("preop_items").insert({ site_id: siteA, label: "Guards on" })).error).toBeNull();
    expect(
      (await supervisor.from("preop_items").insert({ site_id: siteA, label: "x" })).error,
    ).not.toBeNull();
    expect((await otherQa.from("preop_items").insert({ site_id: siteA, label: "x" })).error).not.toBeNull();
    expect((await qa.from("preop_items").insert({ site_id: siteA, label: "   " })).error).not.toBeNull();

    const { data } = await supervisor.from("preop_items").select("label").eq("site_id", siteA);
    expect(data?.map((d) => d.label).sort()).toEqual(["Guards on", "No pooled water"]);
  });
});

describe("preop_inspections", () => {
  it("QA records an inspection as themselves, never as someone else", async () => {
    const ok = await qa.from("preop_inspections").insert({
      site_id: siteA,
      zone_id: zoneId,
      shift_id: shiftId,
      inspector_profile_id: qaId,
      result: "fail",
      items: [{ label: "No pooled water", pass: false, note: "Water under conveyor" }],
    });
    expect(ok.error).toBeNull();
    const forged = await qa.from("preop_inspections").insert({
      site_id: siteA,
      zone_id: zoneId,
      shift_id: shiftId,
      inspector_profile_id: supervisorId,
      result: "pass",
    });
    expect(forged.error).not.toBeNull();
  });
});

describe("releases", () => {
  it("is blocked while a red exception is open in the zone, and allowed with an override reason", async () => {
    const ex = await openRedException(taskId);
    const blocked = await release(qa, qaId);
    expect(blocked.error?.message).toMatch(/blocked while red exceptions are open/);

    const noReason = await release(qa, qaId, { override_open_exceptions: true });
    expect(noReason.error).not.toBeNull();
    const blank = await release(qa, qaId, { override_open_exceptions: true, reason: "  " });
    expect(blank.error).not.toBeNull();

    const overridden = await release(qa, qaId, {
      override_open_exceptions: true,
      reason: "Re-swab passed at 05:30",
    });
    expect(overridden.error).toBeNull();
    expect(overridden.data?.override_open_exceptions).toBe(true);

    await sql(
      `update exceptions set status = 'resolved', resolved_by = $2, resolved_at = now() where id = $1`,
      [ex, qaId],
    );
  });

  it("ignores exceptions in other zones and amber ones", async () => {
    const red = await openRedException(otherTaskId);
    await sql(
      `insert into exceptions (site_id, task_id, type, severity, detail) values ($1, $2, 'clock_skew', 'amber', '{}')`,
      [siteA, taskId],
    );
    const ok = await release(qa, qaId);
    expect(ok.error).toBeNull();
    await sql(
      `update exceptions set status = 'resolved', resolved_by = $2, resolved_at = now() where id = $1`,
      [red, qaId],
    );
  });

  it("uses the server's time, and a hold needs a reason", async () => {
    const res = await release(qa, qaId, {
      decision: "held",
      reason: "Condensation over line",
      decided_at: "2000-01-01T00:00:00Z",
    });
    expect(res.error).toBeNull();
    expect(new Date(res.data!.decided_at).getFullYear()).toBeGreaterThan(2000);
    expect((await release(qa, qaId, { decision: "held" })).error).not.toBeNull();
  });

  it("writes an audit event into the chain", async () => {
    const res = await release(qa, qaId, { decision: "held", reason: "Waiting on ATP" });
    const [audit] = await sql<{ n: string }>(
      `select count(*) as n from audit_events where entity = 'releases' and entity_id = $1 and actor_profile_id = $2`,
      [res.data!.id, qaId],
    );
    expect(Number(audit.n)).toBe(1);
    const [chain] = await sql<{ verified: boolean }>(`select verified from verify_chain($1)`, [siteA]);
    expect(chain.verified).toBe(true);
  });

  it("QA can request a re-clean from a failed pre-op", async () => {
    const { error } = await qa.rpc("request_reclean", {
      p_task_id: otherTaskId,
      p_note: "Pre-op fail: residue",
    });
    expect(error).toBeNull();
  });
});

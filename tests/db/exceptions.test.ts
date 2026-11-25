/** M5: exception uniqueness, resolve_exception, request_reclean, flag_overdue_tasks, realtime. */
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

let orgA: string, orgB: string, siteA: string, siteB: string, cleanerA: string;
let device: Client, deviceId: string;
let supervisor: Client, supervisorId: string, qa: Client, otherSupervisor: Client;
let equipmentId: string, ssopId: string, shiftId: string, stepId: string;

beforeAll(async () => {
  orgA = await createOrg("Exceptions A", "processor");
  orgB = await createOrg("Exceptions B", "processor");
  siteA = await createSite(orgA, "Exceptions Site A");
  siteB = await createSite(orgB, "Exceptions Site B");
  cleanerA = await createProfile("Ex Cleaner A");
  await addMembership(cleanerA, orgA, siteA, "cleaner");
  ({ client: device, deviceId } = await createDevice("ex-device-a", siteA));
  ({ client: supervisor, profileId: supervisorId } = await createStaff(
    "ex-sup-a",
    orgA,
    siteA,
    "supervisor",
  ));
  qa = (await createStaff("ex-qa-a", orgA, siteA, "qa")).client;
  otherSupervisor = (await createStaff("ex-sup-b", orgB, siteB, "supervisor")).client;

  const [zone] = await sql<{ id: string }>(
    `insert into zones (site_id, name) values ($1, 'Z') returning id`,
    [siteA],
  );
  const [eq] = await sql<{ id: string }>(
    `insert into equipment (site_id, zone_id, name) values ($1, $2, 'E') returning id`,
    [siteA, zone.id],
  );
  equipmentId = eq.id;
  const [ssop] = await sql<{ id: string }>(
    `insert into ssops (site_id, equipment_id, version) values ($1, $2, 1) returning id`,
    [siteA, eq.id],
  );
  ssopId = ssop.id;
  const [step] = await sql<{ id: string }>(
    `insert into ssop_steps (site_id, ssop_id, step_no, step_type, title_en, atp_required, atp_pass_max)
     values ($1, $2, 1, 'atp_check', 'ATP', true, 150) returning id`,
    [siteA, ssop.id],
  );
  stepId = step.id;
  await sql(`update ssops set status = 'active' where id = $1`, [ssop.id]);
  const [shift] = await sql<{ id: string }>(
    `insert into shifts (site_id, shift_date, starts_at, ends_at)
     values ($1, current_date, now() - interval '1 hour', now() + interval '7 hours') returning id`,
    [siteA],
  );
  shiftId = shift.id;
});

afterAll(async () => {
  await sql(`delete from organisations where id = any($1)`, [[orgA, orgB]]).catch(() => undefined);
  await sql(`delete from profiles where id = $1`, [cleanerA]).catch(() => undefined);
  await deleteTestAuthUsers();
});

async function newTask(shift = shiftId): Promise<string> {
  const [t] = await sql<{ id: string }>(
    `insert into tasks (site_id, shift_id, equipment_id, ssop_id, assigned_profile_id)
     values ($1, $2, $3, $4, $5) returning id`,
    [siteA, shift, equipmentId, ssopId, cleanerA],
  );
  return t.id;
}

async function failedRecordWithException(taskId: string): Promise<{ recordId: string; exceptionId: string }> {
  const { data, error } = await device
    .from("step_records")
    .insert({
      site_id: siteA,
      task_id: taskId,
      ssop_step_id: stepId,
      profile_id: cleanerA,
      device_id: deviceId,
      client_record_id: crypto.randomUUID(),
      result: "failed",
      atp_value: 300,
      payload_hash: "a".repeat(64),
    })
    .select("id")
    .single();
  if (error) throw error;
  // The sync route inserts exceptions with the service role; do the same here.
  const [ex] = await sql<{ id: string }>(
    `insert into exceptions (site_id, task_id, step_record_id, type, severity)
     values ($1, $2, $3, 'atp_fail', 'red') returning id`,
    [siteA, taskId, data.id],
  );
  return { recordId: data.id, exceptionId: ex.id };
}

describe("exception uniqueness", () => {
  it("allows one exception of each type per step record", async () => {
    const taskId = await newTask();
    const { recordId } = await failedRecordWithException(taskId);
    await expect(
      sql(
        `insert into exceptions (site_id, task_id, step_record_id, type, severity) values ($1, $2, $3, 'atp_fail', 'red')`,
        [siteA, taskId, recordId],
      ),
    ).rejects.toThrow(/duplicate key/);
    await sql(
      `insert into exceptions (site_id, task_id, step_record_id, type, severity) values ($1, $2, $3, 'clock_skew', 'amber')`,
      [siteA, taskId, recordId],
    );
  });

  it("app users cannot insert or update exceptions directly", async () => {
    const taskId = await newTask();
    const { exceptionId } = await failedRecordWithException(taskId);
    const ins = await device
      .from("exceptions")
      .insert({ site_id: siteA, task_id: taskId, type: "atp_fail", severity: "red" });
    expect(ins.error).not.toBeNull();
    await supervisor
      .from("exceptions")
      .update({ status: "resolved", resolved_by: supervisorId, resolved_at: new Date().toISOString() })
      .eq("id", exceptionId);
    const [row] = await sql<{ status: string }>(`select status from exceptions where id = $1`, [exceptionId]);
    expect(row.status).toBe("open");
  });
});

describe("resolve_exception", () => {
  it("lets a site supervisor or QA resolve with a note, recording who did it", async () => {
    const taskId = await newTask();
    const { exceptionId } = await failedRecordWithException(taskId);
    const { error } = await supervisor.rpc("resolve_exception", {
      p_exception_id: exceptionId,
      p_note: "Re-swabbed, 80 RLU",
    });
    expect(error).toBeNull();
    const [row] = await sql<{ status: string; resolved_by: string; resolution_note: string }>(
      `select status, resolved_by, resolution_note from exceptions where id = $1`,
      [exceptionId],
    );
    expect(row).toMatchObject({
      status: "resolved",
      resolved_by: supervisorId,
      resolution_note: "Re-swabbed, 80 RLU",
    });

    const again = await qa.rpc("resolve_exception", { p_exception_id: exceptionId, p_note: "x" });
    expect(again.error?.message).toMatch(/already resolved/);

    const [audit] = await sql<{ n: string }>(
      `select count(*) as n from audit_events where entity = 'exceptions' and entity_id = $1 and action = 'update'`,
      [exceptionId],
    );
    expect(Number(audit.n)).toBe(1);
  });

  it("requires a note, and refuses devices and other organisations", async () => {
    const taskId = await newTask();
    const { exceptionId } = await failedRecordWithException(taskId);
    expect(
      (await qa.rpc("resolve_exception", { p_exception_id: exceptionId, p_note: "  " })).error?.message,
    ).toMatch(/note is required/);
    expect(
      (await device.rpc("resolve_exception", { p_exception_id: exceptionId, p_note: "ok" })).error,
    ).not.toBeNull();
    expect(
      (await otherSupervisor.rpc("resolve_exception", { p_exception_id: exceptionId, p_note: "ok" })).error,
    ).not.toBeNull();
  });
});

describe("request_reclean", () => {
  it("creates a re-clean task, marks the old one, and resolves its open exceptions", async () => {
    const taskId = await newTask();
    const { exceptionId } = await failedRecordWithException(taskId);
    const { data: newId, error } = await supervisor.rpc("request_reclean", {
      p_task_id: taskId,
      p_note: "ATP over limit",
    });
    expect(error).toBeNull();

    const [old] = await sql<{ status: string }>(`select status from tasks where id = $1`, [taskId]);
    expect(old.status).toBe("reclean_required");
    const [fresh] = await sql<{
      status: string;
      reclean_of_task_id: string;
      assigned_profile_id: string;
      shift_id: string;
    }>(`select status, reclean_of_task_id, assigned_profile_id, shift_id from tasks where id = $1`, [newId]);
    expect(fresh).toMatchObject({
      status: "pending",
      reclean_of_task_id: taskId,
      assigned_profile_id: cleanerA,
      shift_id: shiftId,
    });
    const [ex] = await sql<{ status: string; resolution_note: string; resolved_by: string }>(
      `select status, resolution_note, resolved_by from exceptions where id = $1`,
      [exceptionId],
    );
    expect(ex).toMatchObject({
      status: "resolved",
      resolution_note: "Re-clean requested: ATP over limit",
      resolved_by: supervisorId,
    });

    // A late record for the old task doesn't flip it back to completed.
    await failedRecordWithException(taskId).catch(() => undefined);
    const [still] = await sql<{ status: string }>(`select status from tasks where id = $1`, [taskId]);
    expect(still.status).toBe("reclean_required");

    const twice = await supervisor.rpc("request_reclean", { p_task_id: taskId, p_note: "again" });
    expect(twice.error?.message).toMatch(/already requested/);
  });

  it("is for supervisors, QA and site admins of the site only", async () => {
    const taskId = await newTask();
    expect((await device.rpc("request_reclean", { p_task_id: taskId, p_note: "x" })).error).not.toBeNull();
    expect(
      (await otherSupervisor.rpc("request_reclean", { p_task_id: taskId, p_note: "x" })).error,
    ).not.toBeNull();
    expect(
      (await supervisor.rpc("request_reclean", { p_task_id: taskId, p_note: "" })).error?.message,
    ).toMatch(/why/);
  });
});

describe("flag_overdue_tasks", () => {
  it("raises one red missed_step per unfinished task after shift end, once", async () => {
    const [past] = await sql<{ id: string }>(
      `insert into shifts (site_id, shift_date, starts_at, ends_at)
       values ($1, current_date - 1, now() - interval '10 hours', now() - interval '2 hours') returning id`,
      [siteA],
    );
    const overdue = await newTask(past.id);
    const current = await newTask();

    const { data: first, error } = await supervisor.rpc("flag_overdue_tasks", { p_site_id: siteA });
    expect(error).toBeNull();
    expect(first).toBeGreaterThanOrEqual(1);
    const { data: second } = await supervisor.rpc("flag_overdue_tasks", { p_site_id: siteA });
    expect(second).toBe(0);

    const rows = await sql<{
      task_id: string;
      type: string;
      severity: string;
      step_record_id: string | null;
    }>(`select task_id, type, severity, step_record_id from exceptions where task_id = any($1)`, [
      [overdue, current],
    ]);
    expect(rows).toEqual([{ task_id: overdue, type: "missed_step", severity: "red", step_record_id: null }]);
  });

  it("refuses other organisations and devices", async () => {
    expect((await otherSupervisor.rpc("flag_overdue_tasks", { p_site_id: siteA })).error).not.toBeNull();
    expect((await device.rpc("flag_overdue_tasks", { p_site_id: siteA })).error).not.toBeNull();
  });
});

describe("realtime", () => {
  it("publishes the tables the dashboard listens to", async () => {
    const rows = await sql<{ tablename: string }>(
      `select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'`,
    );
    expect(rows.map((r) => r.tablename)).toEqual(
      expect.arrayContaining(["tasks", "exceptions", "step_records", "photos"]),
    );
  });
});

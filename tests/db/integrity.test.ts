/** Append-only records, the server-side hash chain and SSOP version immutability. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  addMembership,
  admin,
  createOrg,
  createProfile,
  createSite,
  createStaff,
  deleteTestAuthUsers,
  pool,
  populateSite,
  sql,
  type Client,
  type SiteFixture,
} from "./helpers";

let orgId: string;
let site: SiteFixture;
let cleanerId: string;
let supervisor: { client: Client; profileId: string };

async function verify(siteId: string) {
  const [row] = await sql<{
    records: string;
    breaks: string;
    first_break_seq: string | null;
    verified: boolean;
  }>(`select * from verify_chain($1)`, [siteId]);
  return {
    records: Number(row.records),
    breaks: Number(row.breaks),
    firstBreak: row.first_break_seq,
    verified: row.verified,
  };
}

/** Runs statements as postgres inside a transaction that is always rolled back. */
async function inRolledBackTx<T>(
  fn: (q: (text: string, params?: unknown[]) => Promise<unknown[]>) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    return await fn(async (text, params = []) => (await client.query(text, params)).rows);
  } finally {
    await client.query("rollback");
    client.release();
  }
}

beforeAll(async () => {
  orgId = await createOrg("Integrity Processor", "processor");
  const siteId = await createSite(orgId, "Integrity Site");
  cleanerId = await createProfile("Integrity Cleaner");
  await addMembership(cleanerId, orgId, siteId, "cleaner");
  const s = await createStaff("integrity-supervisor", orgId, siteId, "supervisor");
  supervisor = { client: s.client, profileId: s.profileId };
  site = await populateSite(siteId, cleanerId, s.profileId);
});

afterAll(async () => {
  await sql(`delete from organisations where id = $1`, [orgId]).catch(() => undefined);
  await deleteTestAuthUsers();
});

describe("append-only records", () => {
  it.each(["step_records", "audit_events", "note_translations"] as const)(
    "%s rejects UPDATE and DELETE even with the service role",
    async (table) => {
      const upd = await admin
        .from(table)
        .update({ created_at: new Date().toISOString() })
        .eq("site_id", site.siteId);
      expect(upd.error?.message).toMatch(/append-only/);
      const del = await admin.from(table).delete().eq("site_id", site.siteId);
      expect(del.error?.message).toMatch(/append-only/);
    },
  );

  it("rejects UPDATE from app users before the trigger is even reached", async () => {
    const { error } = await supervisor.client
      .from("step_records")
      .update({ atp_value: 1 })
      .eq("id", site.stepRecordId);
    expect(error).not.toBeNull();
  });

  it("allows a correction as a new row that supersedes the old one", async () => {
    const { error } = await supervisor.client.from("step_records").insert({
      site_id: site.siteId,
      task_id: site.taskId,
      ssop_step_id: site.stepId,
      profile_id: cleanerId,
      client_record_id: crypto.randomUUID(),
      result: "done",
      atp_value: 80,
      payload_hash: "d".repeat(64),
      supersedes_id: site.stepRecordId,
    });
    expect(error).toBeNull();
    const [original] = await sql<{ atp_value: number }>(`select atp_value from step_records where id = $1`, [
      site.stepRecordId,
    ]);
    expect(original.atp_value).toBe(90);
  });

  it("stamps server_received_at on the server, ignoring a client-supplied value", async () => {
    const fake = "2000-01-01T00:00:00.000Z";
    const { data, error } = await supervisor.client
      .from("step_records")
      .insert({
        site_id: site.siteId,
        task_id: site.taskId,
        ssop_step_id: site.stepId,
        profile_id: cleanerId,
        client_record_id: crypto.randomUUID(),
        result: "done",
        payload_hash: "e".repeat(64),
        server_received_at: fake,
        device_completed_at: fake,
      })
      .select("server_received_at, device_completed_at")
      .single();
    expect(error).toBeNull();
    expect(new Date(data!.server_received_at).getFullYear()).toBeGreaterThan(2020);
    expect(new Date(data!.device_completed_at!).toISOString()).toBe(fake);
  });

  it("rejects a duplicate client_record_id so device retries cannot double-insert", async () => {
    const [row] = await sql<{ client_record_id: string }>(
      `select client_record_id from step_records where id = $1`,
      [site.stepRecordId],
    );
    const { error } = await supervisor.client.from("step_records").insert({
      site_id: site.siteId,
      task_id: site.taskId,
      ssop_step_id: site.stepId,
      profile_id: cleanerId,
      client_record_id: row.client_record_id,
      result: "done",
      payload_hash: "f".repeat(64),
    });
    expect(error?.code).toBe("23505");
  });
});

describe("hash chain", () => {
  it("links every audit event to the previous one and verifies cleanly", async () => {
    const result = await verify(site.siteId);
    expect(result.records).toBeGreaterThan(10);
    expect(result.breaks).toBe(0);
    expect(result.verified).toBe(true);
  });

  it("puts each step record in the chain with a matching chain_hash", async () => {
    const rows = await sql<{ ok: boolean }>(
      `select exists (select 1 from audit_events a where a.entity = 'step_records' and a.entity_id = r.id and a.hash = r.chain_hash) as ok
       from step_records r where r.site_id = $1`,
      [site.siteId],
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.ok)).toBe(true);
  });

  it("stays valid under concurrent writes", async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        sql(`insert into zones (site_id, name) values ($1, $2)`, [site.siteId, `Z${i}`]),
      ),
    );
    expect((await verify(site.siteId)).verified).toBe(true);
  });

  it("detects an edited audit event", async () => {
    await inRolledBackTx(async (q) => {
      await q(`alter table audit_events disable trigger append_only`);
      await q(
        `update audit_events set data = jsonb_set(data, '{tampered}', 'true')
         where seq = (select min(seq) + 2 from audit_events where site_id = $1)`,
        [site.siteId],
      );
      const [row] = (await q(`select * from verify_chain($1)`, [site.siteId])) as {
        verified: boolean;
        breaks: string;
      }[];
      expect(row.verified).toBe(false);
      expect(Number(row.breaks)).toBeGreaterThan(0);
    });
  });

  it("detects a deleted audit event", async () => {
    await inRolledBackTx(async (q) => {
      await q(`alter table audit_events disable trigger append_only`);
      await q(
        `delete from audit_events where seq = (select min(seq) + 1 from audit_events where site_id = $1)`,
        [site.siteId],
      );
      const [row] = (await q(`select * from verify_chain($1)`, [site.siteId])) as { verified: boolean }[];
      expect(row.verified).toBe(false);
    });
  });

  it("detects a step record edited after it was chained", async () => {
    await inRolledBackTx(async (q) => {
      await q(`alter table step_records disable trigger append_only`);
      await q(`update step_records set atp_value = 10 where id = $1`, [site.stepRecordId]);
      const [row] = (await q(`select * from verify_chain($1)`, [site.siteId])) as { verified: boolean }[];
      expect(row.verified).toBe(false);
    });
  });

  it("detects a step record inserted around the chain trigger", async () => {
    await inRolledBackTx(async (q) => {
      await q(`alter table step_records disable trigger chain_step_record`);
      await q(
        `insert into step_records (site_id, task_id, ssop_step_id, profile_id, client_record_id, result, payload_hash)
         values ($1, $2, $3, $4, gen_random_uuid(), 'done', repeat('0', 64))`,
        [site.siteId, site.taskId, site.stepId, cleanerId],
      );
      const [row] = (await q(`select * from verify_chain($1)`, [site.siteId])) as { verified: boolean }[];
      expect(row.verified).toBe(false);
    });
  });
});

describe("SSOP versions", () => {
  it("cannot edit the steps of an active SSOP", async () => {
    await expect(
      sql(`update ssop_steps set title_en = 'Changed' where id = $1`, [site.stepId]),
    ).rejects.toThrow(/draft/);
  });

  it("cannot move an active SSOP back to draft", async () => {
    await expect(sql(`update ssops set status = 'draft' where id = $1`, [site.ssopId])).rejects.toThrow(
      /new version/,
    );
  });

  it("records SSOP activation in the audit trail", async () => {
    const rows = await sql(
      `select 1 from audit_events where entity = 'ssops' and entity_id = $1 and action = 'update'`,
      [site.ssopId],
    );
    expect(rows.length).toBe(1);
  });
});

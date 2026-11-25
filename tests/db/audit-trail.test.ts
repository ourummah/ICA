/**
 * Blockchain-verified audit trail (docs/AUDIT_TRAIL.md): sealing, immutability, the site seal
 * chain, amendments, daily Merkle batches, anchoring on a local Anvil chain with retries, and the
 * server and standalone verifiers.
 */
import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { createPublicClient, decodeFunctionData, http, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildBundle } from "@/lib/anchor/bundle";
import { publicReceiptReader, viemAnchorChain, type AnchorChain } from "@/lib/anchor/chain";
import { ANCHOR_CONTRACT } from "@/lib/anchor/contract-artifact";
import { rootFromProof } from "@/lib/anchor/merkle";
import { loadPublicVerification } from "@/lib/anchor/public";
import { runAnchorJob, type AnchorJobOptions } from "@/lib/anchor/service";
import { verifyBundle } from "@/lib/anchor/verify";
import { jcs, sha256Hex } from "@/lib/seal/canonical";
import { sealPendingRecords } from "@/lib/seal/seal";

import { verifyBundle as standaloneVerify } from "../../verifier/verify-ica.mjs";

import { ANVIL_CHAIN_ID, ANVIL_KEY, anvilChain, deployAnchor, fund, startAnvil, type Anvil } from "./anvil";
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

const run = promisify(execFile);

let orgId: string;
let otherOrgId: string;
let site: SiteFixture;
let cleanerId: string;
let siteAdmin: { client: Client; profileId: string };
let otherAdmin: { client: Client; profileId: string };
let anvil: Anvil;
let contract: Hex;

async function newCompletedTask(fx: SiteFixture = site): Promise<string> {
  const [task] = await sql<{ id: string }>(
    `insert into tasks (site_id, shift_id, equipment_id, ssop_id, assigned_profile_id)
     values ($1, $2, $3, $4, $5) returning id`,
    [fx.siteId, fx.shiftId, fx.equipmentId, fx.ssopId, cleanerId],
  );
  await sql(
    `insert into step_records (site_id, task_id, ssop_step_id, profile_id, client_record_id, result, atp_value, payload_hash, photo_sha256)
     values ($1, $2, $3, $4, gen_random_uuid(), 'done', 80, repeat('a', 64), $5)`,
    [fx.siteId, task.id, fx.stepId, cleanerId, sha256Hex(`photo of ${task.id}`)],
  );
  return task.id;
}

async function seals(taskId: string) {
  return sql<{
    id: string;
    record_type: string;
    record_hash: string;
    canonical_text: string;
    prev_site_record_hash: string | null;
    amends_record_id: string | null;
    site_seq: number;
    batch_id: string | null;
    merkle_proof: string[] | null;
  }>(`select * from sealed_records where task_id = $1 order by site_seq`, [taskId]);
}

async function verifySeals(
  q: (text: string, params?: unknown[]) => Promise<unknown[]> = (t, p) => sql(t, p),
) {
  const [row] = (await q(`select * from verify_seal_chain($1)`, [site.siteId])) as {
    records: string;
    breaks: string;
    first_break_seq: number | null;
    verified: boolean;
  }[];
  return {
    records: Number(row.records),
    breaks: Number(row.breaks),
    first: row.first_break_seq,
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

function chain(key: Hex = ANVIL_KEY, overrides: Partial<AnchorChain> = {}): AnchorChain {
  const base = viemAnchorChain({
    chain: "base-sepolia",
    chainId: ANVIL_CHAIN_ID,
    rpcUrl: anvil.rpcUrl,
    privateKey: key,
    contractAddress: contract,
  });
  return { ...base, ...overrides };
}

const fast = {
  waitMs: 2_000,
  pollMs: 50,
  sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
};

function job(opts: Partial<AnchorJobOptions> = {}) {
  return runAnchorJob({ db: admin, chain: chain(), ...fast, ...opts });
}

const anvilReader = () => (_chain: string, contractAddress: Hex, txHash: Hex) =>
  publicReceiptReader({ chainId: ANVIL_CHAIN_ID, rpcUrl: anvil.rpcUrl, contractAddress })(txHash);

async function bundleFor(recordId: string) {
  const { data } = await admin
    .from("sealed_records")
    .select(
      "canonical_text, record_hash, merkle_proof, anchor_batches(id, merkle_root, chain, contract_address, tx_hash, status, block_number, block_timestamp)",
    )
    .eq("id", recordId)
    .single();
  return buildBundle({
    canonical_text: data!.canonical_text,
    record_hash: data!.record_hash,
    merkle_proof: data!.merkle_proof,
    batch: data!.anchor_batches,
  });
}

async function standalone(bundle: unknown) {
  const dir = mkdtempSync(path.join(tmpdir(), "ica-bundle-"));
  const file = path.join(dir, "bundle.json");
  writeFileSync(file, JSON.stringify(bundle));
  const script = path.resolve(import.meta.dirname, "../../verifier/verify-ica.mjs");
  return run(process.execPath, [script, file, "--rpc", anvil.rpcUrl]).then(
    (r) => ({ code: 0, out: r.stdout }),
    (e: { code: number; stdout: string }) => ({ code: e.code, out: e.stdout }),
  );
}

beforeAll(async () => {
  anvil = await startAnvil();
  contract = await deployAnchor(anvil.rpcUrl);

  orgId = await createOrg("Seal Processor", "processor");
  otherOrgId = await createOrg("Other Processor", "processor");
  const siteId = await createSite(orgId, "Seal Site");
  const otherSite = await createSite(otherOrgId, "Other Site");
  cleanerId = await createProfile("Seal Cleaner");
  await addMembership(cleanerId, orgId, siteId, "cleaner");
  siteAdmin = await createStaff("seal-admin", orgId, siteId, "site_admin");
  otherAdmin = await createStaff("other-admin", otherOrgId, otherSite, "site_admin");
  site = await populateSite(siteId, cleanerId, siteAdmin.profileId);
}, 120_000);

afterAll(async () => {
  anvil?.stop();
  await sql(
    `do $$ begin perform set_config('app.demo_reset', 'on', true);
     delete from organisations where id in ('${orgId}', '${otherOrgId}'); end $$`,
  ).catch(() => undefined);
  await deleteTestAuthUsers();
});

describe("sealing a finished clean", () => {
  it("seals a completed task once, hashing the exact canonical bytes in the database", async () => {
    const out = await sealPendingRecords(admin, { siteId: site.siteId });
    expect(out.sealed).toBeGreaterThanOrEqual(1);
    const [s] = await seals(site.taskId);
    expect(s.record_type).toBe("audit");
    expect(s.record_hash).toBe(sha256Hex(s.canonical_text));
    // Stored text is already RFC 8785 canonical, so re-canonicalising changes nothing.
    expect(jcs(JSON.parse(s.canonical_text))).toBe(s.canonical_text);
    const doc = JSON.parse(s.canonical_text);
    expect(doc.schema).toBe("ica.audit.v1");
    expect(doc.task.task_id).toBe(site.taskId);
    expect(doc.items[0].photo_hashes).toEqual(["b".repeat(64)]);
    expect(doc.nonce).toMatch(/^[0-9a-f]{64}$/);

    const again = await sealPendingRecords(admin, { siteId: site.siteId });
    expect(again).toEqual({ sealed: 0, amended: 0, failed: 0 });
    expect(await seals(site.taskId)).toHaveLength(1);
  });

  it("holds ids and hashes, never people's names", async () => {
    const [s] = await seals(site.taskId);
    expect(s.canonical_text).not.toContain("Seal Cleaner");
    expect(s.canonical_text).not.toContain("seal-admin");
  });

  it("writes each seal into the site's audit hash chain too", async () => {
    const [s] = await seals(site.taskId);
    const events = await sql<{ data: { record_hash: string } }>(
      `select data from audit_events where entity = 'sealed_records' and entity_id = $1`,
      [s.id],
    );
    expect(events.map((e) => e.data.record_hash)).toEqual([s.record_hash]);
    const [chain] = await sql<{ verified: boolean }>(`select * from verify_chain($1)`, [site.siteId]);
    expect(chain.verified).toBe(true);
  });

  it("only the server (service role) can seal", async () => {
    const { error } = await siteAdmin.client.rpc("seal_record", {
      p_canonical: "{}",
      p_content_hash: "a".repeat(64),
    });
    expect(error).not.toBeNull();
  });

  it("refuses a record built against an old chain head", async () => {
    const taskId = await newCompletedTask();
    const doc = {
      schema: "ica.audit.v1",
      record_id: crypto.randomUUID(),
      record_type: "audit",
      amends_record_hash: null,
      site_id: site.siteId,
      prev_site_record_hash: null,
      task: { task_id: taskId },
    };
    const { error } = await admin.rpc("seal_record", {
      p_canonical: jcs(doc),
      p_content_hash: "a".repeat(64),
    });
    expect(error?.code).toBe("40001");
  });
});

describe("sealed records can't be edited", () => {
  it("rejects updates and deletes through the API, even with the service role", async () => {
    const [s] = await seals(site.taskId);
    const upd = await admin.from("sealed_records").update({ canonical_text: "{}" }).eq("id", s.id);
    expect(upd.error?.message).toMatch(/immutable/);
    const del = await admin.from("sealed_records").delete().eq("id", s.id);
    expect(del.error?.message).toMatch(/immutable/);
  });

  it("rejects updates and deletes in direct SQL", async () => {
    const [s] = await seals(site.taskId);
    await expect(
      sql(`update sealed_records set record_hash = repeat('0', 64) where id = $1`, [s.id]),
    ).rejects.toThrow(/immutable/);
    await expect(sql(`delete from sealed_records where id = $1`, [s.id])).rejects.toThrow(/immutable/);
    await expect(sql(`truncate sealed_records`)).rejects.toThrow(/append-only/);
  });

  it("app users can't write sealed records at all", async () => {
    const [s] = await seals(site.taskId);
    const upd = await siteAdmin.client
      .from("sealed_records")
      .update({ canonical_text: "{}" })
      .eq("id", s.id)
      .select();
    expect(upd.data ?? []).toEqual([]);
    const [after] = await seals(site.taskId);
    expect(after.canonical_text).toBe(s.canonical_text);
  });

  it("a batch can be set once, from empty, and never changed", async () => {
    const [s] = await seals(site.taskId);
    await inRolledBackTx(async (q) => {
      const [b] = (await q(
        `insert into anchor_batches (merkle_root, record_count, chain) values ($1, 1, 'base-sepolia') returning id`,
        [s.record_hash],
      )) as { id: string }[];
      await q(`update sealed_records set batch_id = $1, merkle_proof = '[]' where id = $2`, [b.id, s.id]);
      await expect(
        q(`update sealed_records set merkle_proof = '["x"]' where id = $1`, [s.id]),
      ).rejects.toThrow(/immutable/);
    });
  });
});

describe("corrections are amendments", () => {
  it("a superseding step record seals an amendment that references the original", async () => {
    const [original] = await seals(site.taskId);
    await sql(
      `insert into step_records (site_id, task_id, ssop_step_id, profile_id, client_record_id, result, atp_value, payload_hash, supersedes_id)
       values ($1, $2, $3, $4, gen_random_uuid(), 'done', 40, repeat('c', 64), $5)`,
      [site.siteId, site.taskId, site.stepId, cleanerId, site.stepRecordId],
    );
    const out = await sealPendingRecords(admin, { siteId: site.siteId });
    expect(out.amended).toBe(1);
    const all = await seals(site.taskId);
    expect(all).toHaveLength(2);
    expect(all[0]).toEqual(original);
    expect(all[1].record_type).toBe("amendment");
    expect(all[1].amends_record_id).toBe(original.id);
    expect(JSON.parse(all[1].canonical_text).amends_record_hash).toBe(original.record_hash);
  });

  it("a photo that arrives after sealing leads to an amendment", async () => {
    await sql(
      `insert into photos (site_id, step_record_id, client_photo_id, storage_path, sha256)
       values ($1::uuid, $2, gen_random_uuid(), $1::text || '/late.jpg', repeat('e', 64))`,
      [site.siteId, site.stepRecordId],
    );
    expect((await sealPendingRecords(admin, { siteId: site.siteId })).amended).toBe(1);
    const all = await seals(site.taskId);
    expect(all[all.length - 1].canonical_text).toContain("e".repeat(64));
  });
});

describe("site seal chain", () => {
  it("links every seal to the one before and verifies", async () => {
    await newCompletedTask();
    await newCompletedTask();
    await sealPendingRecords(admin, { siteId: site.siteId });
    const rows = await sql<{ site_seq: number; record_hash: string; prev_site_record_hash: string | null }>(
      `select site_seq, record_hash, prev_site_record_hash from sealed_records where site_id = $1 order by site_seq`,
      [site.siteId],
    );
    expect(rows.length).toBeGreaterThanOrEqual(4);
    rows.forEach((r, i) => {
      expect(r.site_seq).toBe(i + 1);
      expect(r.prev_site_record_hash).toBe(i ? rows[i - 1].record_hash : null);
    });
    expect(await verifySeals()).toMatchObject({ verified: true, breaks: 0, records: rows.length });
    const { data } = await siteAdmin.client.rpc("verify_seal_chain", { p_site_id: site.siteId });
    expect(data?.[0].verified).toBe(true);
  });

  it("deleting a seal in the middle breaks the chain", async () => {
    await inRolledBackTx(async (q) => {
      await q(`select set_config('app.demo_reset', 'on', true)`);
      // Seals 2 and 3 are amendments of seal 1; seal 4 is another task's record.
      await q(`delete from sealed_records where site_id = $1 and site_seq = 4`, [site.siteId]);
      const v = await verifySeals(q);
      expect(v.verified).toBe(false);
      expect(v.first).toBe(4);
    });
  });

  it("deleting the latest seal is caught through the audit chain", async () => {
    await inRolledBackTx(async (q) => {
      await q(`select set_config('app.demo_reset', 'on', true)`);
      await q(
        `delete from sealed_records where id = (select id from sealed_records where site_id = $1 order by site_seq desc limit 1)`,
        [site.siteId],
      );
      expect((await verifySeals(q)).verified).toBe(false);
    });
  });

  it("changing a stored record's bytes is caught", async () => {
    await inRolledBackTx(async (q) => {
      await q(`alter table sealed_records disable trigger guard_sealed_record`);
      await q(
        `update sealed_records set canonical_text = replace(canonical_text, '"done"', '"dune"') where site_id = $1 and site_seq = 1`,
        [site.siteId],
      );
      expect((await verifySeals(q)).verified).toBe(false);
    });
  });

  it("security events go into the audit chain", async () => {
    const { error } = await admin.rpc("log_security_event", {
      p_site_id: site.siteId,
      p_kind: "photo_hash_mismatch",
      p_detail: { expected_sha256: "a".repeat(64), actual_sha256: "b".repeat(64) },
    });
    expect(error).toBeNull();
    const [e] = await sql<{ entity: string }>(
      `select entity from audit_events where site_id = $1 and action = 'photo_hash_mismatch'`,
      [site.siteId],
    );
    expect(e.entity).toBe("security");
    const { error: appError } = await siteAdmin.client.rpc("log_security_event", {
      p_site_id: site.siteId,
      p_kind: "x",
      p_detail: {},
    });
    expect(appError).not.toBeNull();
  });
});

describe("daily batches anchored on-chain", () => {
  it("anchors every pending record in one Merkle batch", async () => {
    const report = await job();
    expect(report.configured).toBe(true);
    expect(report.batchCreated).not.toBeNull();
    const batchId = report.batchCreated!;
    const [b] = await sql<{
      status: string;
      merkle_root: string;
      record_count: number;
      tx_hash: string;
      attempts: number;
    }>(`select * from anchor_batches where id = $1`, [batchId]);
    expect(b.status).toBe("anchored");
    expect(b.attempts).toBe(1);
    const records = await sql<{ record_hash: string; merkle_proof: string[] }>(
      `select record_hash, merkle_proof from sealed_records where batch_id = $1`,
      [batchId],
    );
    expect(records).toHaveLength(b.record_count);
    for (const r of records) expect(rootFromProof(r.record_hash, r.merkle_proof)).toBe(b.merkle_root);
    const [unbatched] = await sql<{ n: string }>(
      `select count(*) n from sealed_records where site_id = $1 and batch_id is null`,
      [site.siteId],
    );
    expect(Number(unbatched.n)).toBe(0);
  });

  it("skips the day when nothing new was sealed", async () => {
    const report = await job();
    expect(report.batchCreated).toBeNull();
  });

  it("the record shows as Verified with its transaction", async () => {
    const [s] = await seals(site.taskId);
    const v = await loadPublicVerification(admin, s.id);
    expect(v?.status).toBe("verified");
    expect(v?.batch?.tx_hash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(v?.superseded_by.length).toBe(2);
    expect(JSON.stringify(v)).not.toContain("Seal Site");
  });

  it("the transaction holds only the batch id, root and record count", async () => {
    const [s] = await seals(site.taskId);
    const [b] = await sql<{ id: string; tx_hash: Hex; merkle_root: string; record_count: number }>(
      `select b.* from anchor_batches b join sealed_records r on r.batch_id = b.id where r.id = $1`,
      [s.id],
    );
    const client = createPublicClient({ chain: anvilChain(anvil.rpcUrl), transport: http(anvil.rpcUrl) });
    const tx = await client.getTransaction({ hash: b.tx_hash });
    const decoded = decodeFunctionData({ abi: ANCHOR_CONTRACT.abi, data: tx.input });
    expect(decoded.args).toEqual([BigInt(b.id), `0x${b.merkle_root}`, BigInt(b.record_count)]);
    expect((tx.input.length - 2) / 2).toBe(100);
  });

  it("server and standalone verifiers pass a real bundle, and fail a changed one", async () => {
    const [s] = await seals(site.taskId);
    const bundle = await bundleFor(s.id);
    expect(bundle.tx_hash).toMatch(/^0x/);

    const server = await verifyBundle(bundle, anvilReader());
    expect(server.result).toBe("pass");
    const local = await standaloneVerify(bundle, { rpcUrl: anvil.rpcUrl });
    expect(local.result).toBe("PASS");
    const cli = await standalone(bundle);
    expect(cli.code).toBe(0);
    expect(cli.out).toMatch(/PASS: record existed no later than/);

    // One character of the record changed.
    const text = JSON.stringify(bundle.canonical_record);
    const changed = { ...bundle, canonical_record: JSON.parse(text.replace('"done"', '"dunE"')) };
    expect((await verifyBundle(changed, anvilReader())).result).toBe("fail");
    expect((await standalone(changed)).code).toBe(1);

    // A proof that doesn't belong to this record, and a root that was never anchored.
    expect(
      (await standaloneVerify({ ...bundle, merkle_proof: ["0".repeat(64)] }, { rpcUrl: anvil.rpcUrl }))
        .result,
    ).toBe("FAIL");
    const otherRoot = { ...bundle, merkle_root: "1".repeat(64), merkle_proof: [] };
    expect((await verifyBundle(otherRoot, anvilReader())).result).toBe("fail");
  });

  it("never counts a record in two batches", async () => {
    const [s] = await seals(site.taskId);
    const { error } = await admin.rpc("create_anchor_batch", {
      p_root: s.record_hash,
      p_chain: "base-sepolia",
      p_items: [{ record_id: s.id, proof: [] }],
    });
    expect(error?.code).toBe("40001");
  });

  it("only one job runs at a time", async () => {
    await admin.rpc("acquire_anchor_lease", { p_holder: "other-run", p_seconds: 60 });
    try {
      expect((await job()).skipped).toBe("busy");
    } finally {
      await admin.rpc("release_anchor_lease", { p_holder: "other-run" });
    }
  });

  it("replaces a transaction that isn't confirmed in 10 minutes with a higher fee", async () => {
    await newCompletedTask();
    let dropped = 0;
    const real = chain();
    const lossy = chain(ANVIL_KEY, {
      broadcast: async (raw) => {
        if (dropped++ === 0) return; // the first send never reaches the network
        await real.broadcast(raw);
      },
    });
    const first = await runAnchorJob({ db: admin, chain: lossy, ...fast, waitMs: 200 });
    const batchId = first.batchCreated!;
    let [b] = await sql<{
      status: string;
      attempts: number;
      tx_hashes: string[];
      nonce: string;
      max_fee_per_gas: string;
    }>(`select * from anchor_batches where id = $1`, [batchId]);
    expect(b.status).toBe("submitted");
    const firstFee = BigInt(b.max_fee_per_gas);

    // Eleven minutes later: replaced with the same nonce and a higher fee.
    const later = new Date(Date.now() + 11 * 60_000);
    await runAnchorJob({ db: admin, chain: lossy, ...fast, now: () => later });
    [b] = await sql(`select * from anchor_batches where id = $1`, [batchId]);
    expect(b.status).toBe("anchored");
    expect(b.attempts).toBe(2);
    expect(b.tx_hashes).toHaveLength(2);
    expect(BigInt(b.max_fee_per_gas)).toBeGreaterThan(firstFee);
  });

  it("gives up after 5 attempts with an alert, and a retry anchors it without losing it", async () => {
    await newCompletedTask();
    const intruder = generatePrivateKey();
    await fund(anvil.rpcUrl, privateKeyToAccount(intruder).address);
    const notOwner = chain(intruder); // the contract rejects anyone but its owner
    const alerts: string[] = [];
    const alert = async (subject: string) => void alerts.push(subject);

    const first = await runAnchorJob({ db: admin, chain: notOwner, ...fast, alert });
    const batchId = first.batchCreated!;
    for (let i = 0; i < 5; i++) await runAnchorJob({ db: admin, chain: notOwner, ...fast, alert });
    const [b] = await sql<{ status: string; attempts: number; last_error: string }>(
      `select * from anchor_batches where id = $1`,
      [batchId],
    );
    expect(b.status).toBe("failed");
    expect(b.attempts).toBe(5);
    expect(alerts.some((a) => a.includes(`batch ${batchId}`))).toBe(true);

    const { count } = await admin
      .from("sealed_records")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", batchId);
    expect(count).toBeGreaterThan(0);

    await admin.rpc("retry_anchor_batch", { p_batch_id: batchId });
    await job();
    const [after] = await sql<{ status: string }>(`select status from anchor_batches where id = $1`, [
      batchId,
    ]);
    expect(after.status).toBe("anchored");
  });

  it("alerts when the wallet runs low or a batch is stuck", async () => {
    await newCompletedTask();
    const alerts: string[] = [];
    const report = await runAnchorJob({
      db: admin,
      chain: null,
      alert: async (s) => void alerts.push(s),
      now: () => new Date(Date.now() + 3 * 60 * 60_000),
    });
    expect(report.configured).toBe(false);
    expect(alerts.some((a) => a.includes("stuck"))).toBe(true);
    const low = await job({ minBalanceWei: 10n ** 30n, alert: async (s) => void alerts.push(s) });
    expect(low.alerts.some((a) => a.includes("low"))).toBe(true);
  });
});

describe("who can see seals and batches", () => {
  it("another organisation's admin sees none of this site's seals or batches", async () => {
    const { data: seen } = await otherAdmin.client.from("sealed_records").select("site_id");
    expect((seen ?? []).some((r) => r.site_id === site.siteId)).toBe(false);
    const { data: mine } = await siteAdmin.client.from("anchor_batches").select("id");
    expect((mine ?? []).length).toBeGreaterThan(0);
    const { data: theirs } = await otherAdmin.client.from("anchor_batches").select("id");
    expect(theirs ?? []).toEqual([]);
  });
});

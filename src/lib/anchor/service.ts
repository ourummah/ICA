import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Hex } from "viem";

import type { Database } from "@/lib/database.types";
import { sealPendingRecords } from "@/lib/seal/seal";

import type { AnchorChain, AnchorReceipt, Fees } from "./chain";
import { DEFAULT_ANCHOR_CHAIN } from "./config";
import { buildMerkleTree } from "./merkle";

type Db = SupabaseClient<Database>;
type Batch = Database["public"]["Tables"]["anchor_batches"]["Row"];

export interface AnchorJobOptions {
  db: Db;
  /** Null when no wallet or contract is configured: records are still sealed and batched. */
  chain: AnchorChain | null;
  alert?: (subject: string, text: string) => Promise<void>;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  /** How long to wait for a confirmation within this run. */
  waitMs?: number;
  pollMs?: number;
  /** Replace an unconfirmed transaction with a higher fee after this long. */
  replaceAfterMs?: number;
  maxAttempts?: number;
  /** Alert when a batch has not been anchored this long after it was created. */
  stuckAfterMs?: number;
  /** Alert when the wallet holds less than this. */
  minBalanceWei?: bigint;
}

export interface AnchorJobReport {
  skipped?: "busy";
  configured: boolean;
  sealed: number;
  amended: number;
  batchCreated: number | null;
  batches: { id: number; status: string; detail?: string }[];
  alerts: string[];
  balanceWei?: string;
}

export const MAX_ATTEMPTS = 5;
export const REPLACE_AFTER_MS = 10 * 60_000;
export const STUCK_AFTER_MS = 2 * 60 * 60_000;
const FEE_BUMP_PERCENT = 125n;

/** Puts every sealed, unbatched record into one Merkle tree and saves the root and proofs. */
export async function createBatch(db: Db, chain: string, contract: string | null): Promise<number | null> {
  const { data, error } = await db
    .from("sealed_records")
    .select("id, record_hash")
    .is("batch_id", null)
    .order("record_hash")
    .limit(50_000);
  if (error) throw new Error(`unbatched records: ${error.message}`);
  if (!data?.length) return null; // nothing sealed since the last batch: no transaction today

  const tree = buildMerkleTree(data.map((r) => r.record_hash));
  const items = data.map((r) => ({ record_id: r.id, proof: tree.proofs.get(r.record_hash) ?? [] }));
  const { data: batchId, error: rpcError } = await db.rpc("create_anchor_batch", {
    p_root: tree.root,
    p_chain: chain,
    p_items: items,
    ...(contract ? { p_contract: contract } : {}),
  });
  if (rpcError) throw new Error(`create_anchor_batch: ${rpcError.message}`);
  return batchId;
}

function matches(b: Batch, r: AnchorReceipt): boolean {
  return (
    r.status === "success" &&
    r.events.some(
      (e) =>
        e.batchId === BigInt(b.id) && e.root === b.merkle_root && e.recordCount === BigInt(b.record_count),
    )
  );
}

function bump(prev: bigint, current: bigint): bigint {
  const bumped = (prev * FEE_BUMP_PERCENT) / 100n + 1n;
  return bumped > current ? bumped : current;
}

class BatchProcessor {
  constructor(
    private readonly o: Required<Omit<AnchorJobOptions, "chain" | "minBalanceWei">> & {
      chain: AnchorChain;
    },
    private readonly report: AnchorJobReport,
  ) {}

  private async update(id: number, patch: Database["public"]["Tables"]["anchor_batches"]["Update"]) {
    const { data, error } = await this.o.db
      .from("anchor_batches")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(`update batch ${id}: ${error.message}`);
    return data;
  }

  private async findConfirmed(
    b: Batch,
  ): Promise<{ hash: string; receipt: AnchorReceipt } | "all_reverted" | null> {
    let reverted = 0;
    for (const hash of b.tx_hashes) {
      const receipt = await this.o.chain.getReceipt(hash as Hex);
      if (!receipt) continue;
      if (matches(b, receipt)) return { hash, receipt };
      reverted++;
    }
    return b.tx_hashes.length && reverted === b.tx_hashes.length ? "all_reverted" : null;
  }

  private async markAnchored(b: Batch, hash: string, r: AnchorReceipt) {
    await this.update(b.id, {
      status: "anchored",
      tx_hash: hash,
      block_number: Number(r.blockNumber),
      block_timestamp: r.blockTimestamp.toISOString(),
      anchored_at: this.o.now().toISOString(),
      last_error: null,
    });
    this.report.batches.push({ id: b.id, status: "anchored", detail: hash });
  }

  private async fail(b: Batch, reason: string) {
    await this.update(b.id, { status: "failed", last_error: reason, alerted_at: this.o.now().toISOString() });
    const msg = `Anchor batch ${b.id} failed: ${reason}`;
    this.report.alerts.push(msg);
    await this.o.alert(`ICA anchoring failed (batch ${b.id})`, msg);
    this.report.batches.push({ id: b.id, status: "failed", detail: reason });
  }

  private async send(b: Batch, replace: boolean): Promise<Batch> {
    const chain = this.o.chain;
    const nonce = replace && b.nonce !== null ? b.nonce : await chain.getNonce();
    let fees: Fees = await chain.getFees();
    if (replace && b.max_fee_per_gas !== null && b.max_priority_fee_per_gas !== null) {
      fees = {
        maxFeePerGas: bump(BigInt(b.max_fee_per_gas), fees.maxFeePerGas),
        maxPriorityFeePerGas: bump(BigInt(b.max_priority_fee_per_gas), fees.maxPriorityFeePerGas),
      };
    }
    const signed = await chain.signAnchor({
      batchId: BigInt(b.id),
      root: b.merkle_root,
      recordCount: b.record_count,
      nonce,
      fees,
    });
    // Saved before broadcasting, so a crash after sending can never lose track of the transaction.
    const saved = await this.update(b.id, {
      status: "submitted",
      chain: chain.chain,
      contract_address: chain.contractAddress,
      tx_hash: signed.hash,
      tx_hashes: [...b.tx_hashes, signed.hash],
      raw_tx: signed.raw,
      nonce,
      max_fee_per_gas: Number(fees.maxFeePerGas),
      max_priority_fee_per_gas: Number(fees.maxPriorityFeePerGas),
      submitted_at: this.o.now().toISOString(),
      attempts: b.attempts + 1,
      last_error: null,
    });
    try {
      await chain.broadcast(signed.raw);
    } catch (e) {
      const message = e instanceof Error ? e.message.slice(0, 500) : String(e);
      return this.update(b.id, { last_error: `broadcast: ${message}` });
    }
    return saved;
  }

  private async waitForConfirmation(b: Batch): Promise<boolean> {
    const polls = Math.max(1, Math.ceil(this.o.waitMs / this.o.pollMs));
    for (let i = 0; ; i++) {
      const found = await this.findConfirmed(b);
      if (found && found !== "all_reverted") {
        await this.markAnchored(b, found.hash, found.receipt);
        return true;
      }
      if (found === "all_reverted" || i >= polls) return false;
      await this.o.sleep(this.o.pollMs);
    }
  }

  async process(batch: Batch): Promise<void> {
    let b = batch;
    const found = await this.findConfirmed(b);
    if (found && found !== "all_reverted") return this.markAnchored(b, found.hash, found.receipt);

    if (b.status === "submitted" && found !== "all_reverted") {
      const age = this.o.now().getTime() - new Date(b.submitted_at ?? 0).getTime();
      if (age < this.o.replaceAfterMs) {
        if (b.raw_tx) await this.o.chain.broadcast(b.raw_tx as Hex).catch(() => undefined);
      } else if (b.attempts >= this.o.maxAttempts) {
        return this.fail(b, `not confirmed after ${b.attempts} attempts`);
      } else {
        b = await this.send(b, true);
      }
    } else {
      if (b.attempts >= this.o.maxAttempts) {
        return this.fail(
          b,
          found === "all_reverted" ? "every transaction reverted" : `gave up after ${b.attempts} attempts`,
        );
      }
      b = await this.send(b, false);
    }

    if (!(await this.waitForConfirmation(b))) {
      this.report.batches.push({
        id: b.id,
        status: "submitted",
        detail: b.last_error ?? "waiting for confirmation",
      });
    }
  }
}

/**
 * The daily anchoring job (and the admin "anchor now" button):
 *   1. seal finished cleans that aren't sealed yet;
 *   2. put every unbatched record into one Merkle tree (one batch per run, across all sites);
 *   3. send each pending batch's root to the contract, wait for confirmation, retry with a higher
 *      fee if it isn't confirmed within 10 minutes, and give up with an alert after 5 attempts;
 *   4. alert on a low wallet balance or a batch stuck for more than 2 hours.
 * Only one run at a time holds the lease.
 */
export async function runAnchorJob(opts: AnchorJobOptions): Promise<AnchorJobReport> {
  const o = {
    alert: async () => undefined,
    now: () => new Date(),
    sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
    waitMs: 40_000,
    pollMs: 3_000,
    replaceAfterMs: REPLACE_AFTER_MS,
    maxAttempts: MAX_ATTEMPTS,
    stuckAfterMs: STUCK_AFTER_MS,
    ...opts,
  };
  const report: AnchorJobReport = {
    configured: !!o.chain,
    sealed: 0,
    amended: 0,
    batchCreated: null,
    batches: [],
    alerts: [],
  };

  const holder = randomUUID();
  const { data: leased, error: leaseError } = await o.db.rpc("acquire_anchor_lease", {
    p_holder: holder,
    p_seconds: 300,
  });
  if (leaseError) throw new Error(`lease: ${leaseError.message}`);
  if (!leased) return { ...report, skipped: "busy" };

  try {
    const sealed = await sealPendingRecords(o.db, { limit: 5_000 });
    report.sealed = sealed.sealed;
    report.amended = sealed.amended;
    report.batchCreated = await createBatch(
      o.db,
      o.chain?.chain ?? DEFAULT_ANCHOR_CHAIN,
      o.chain?.contractAddress ?? null,
    );

    if (o.chain) {
      const processor = new BatchProcessor({ ...o, chain: o.chain }, report);
      const { data: open, error } = await o.db
        .from("anchor_batches")
        .select("*")
        .in("status", ["pending", "submitted"])
        .order("id");
      if (error) throw new Error(`open batches: ${error.message}`);
      for (const b of open ?? []) {
        try {
          await processor.process(b);
        } catch (e) {
          const message = e instanceof Error ? e.message.slice(0, 500) : String(e);
          await o.db.from("anchor_batches").update({ last_error: message }).eq("id", b.id);
          report.batches.push({ id: b.id, status: b.status, detail: message });
        }
      }

      const balance = await o.chain.getBalance().catch(() => null);
      if (balance !== null) {
        report.balanceWei = balance.toString();
        if (o.minBalanceWei !== undefined && balance < o.minBalanceWei) {
          const msg = `Anchor wallet ${o.chain.walletAddress} is low: ${balance} wei left. Top it up on ${o.chain.chain}.`;
          report.alerts.push(msg);
          await o.alert("ICA anchor wallet balance is low", msg);
        }
      }
    }

    // Batches waiting too long (also covers anchoring not being configured at all).
    const cutoff = new Date(o.now().getTime() - o.stuckAfterMs).toISOString();
    const { data: stuck } = await o.db
      .from("anchor_batches")
      .select("id, status, created_at")
      .in("status", ["pending", "submitted"])
      .is("alerted_at", null)
      .lt("created_at", cutoff);
    for (const s of stuck ?? []) {
      const msg = `Anchor batch ${s.id} is still ${s.status} more than 2 hours after it was created${
        o.chain ? "" : " (anchoring is not configured)"
      }.`;
      report.alerts.push(msg);
      await o.alert(`ICA anchor batch ${s.id} is stuck`, msg);
      await o.db.from("anchor_batches").update({ alerted_at: o.now().toISOString() }).eq("id", s.id);
    }
  } finally {
    await o.db.rpc("release_anchor_lease", { p_holder: holder });
  }
  return report;
}

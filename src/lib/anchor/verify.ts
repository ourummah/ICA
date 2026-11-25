import { jcs, sha256Hex } from "@/lib/seal/canonical";

import type { VerificationBundle } from "./bundle";
import type { AnchorReceipt } from "./chain";
import { ANCHOR_CHAINS, type AnchorChainName } from "./config";
import { rootFromProof } from "./merkle";

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export interface BundleResult {
  result: "pass" | "fail" | "pending";
  checks: Check[];
  block_timestamp: string | null;
}

export type ReceiptReader = (
  chain: AnchorChainName,
  contractAddress: `0x${string}`,
  txHash: `0x${string}`,
) => Promise<AnchorReceipt | null>;

/**
 * Re-checks a verification bundle from scratch: the record hash, the Merkle proof and the Anchored
 * event on-chain. Same steps as the standalone verifier (verifier/verify-ica.mjs).
 */
export async function verifyBundle(b: VerificationBundle, readReceipt: ReceiptReader): Promise<BundleResult> {
  const checks: Check[] = [];
  const recomputed = sha256Hex(jcs(b.canonical_record));
  checks.push({
    name: "record_hash",
    ok: recomputed === b.record_hash,
    detail:
      recomputed === b.record_hash
        ? "sha256(JCS(canonical_record)) matches record_hash"
        : `record changed: recomputed ${recomputed}`,
  });

  if (!b.merkle_root || !b.merkle_proof || !b.tx_hash || !b.contract_address || !b.batch_id) {
    return {
      result: checks.every((c) => c.ok) ? "pending" : "fail",
      checks: [...checks, { name: "anchor", ok: false, detail: "not anchored yet (batches run daily)" }],
      block_timestamp: null,
    };
  }

  const root = rootFromProof(b.record_hash, b.merkle_proof);
  checks.push({
    name: "merkle_proof",
    ok: root === b.merkle_root,
    detail: root === b.merkle_root ? "proof leads to merkle_root" : `proof leads to ${root}, not merkle_root`,
  });

  let blockTimestamp: string | null = null;
  if (!(b.chain in ANCHOR_CHAINS)) {
    checks.push({ name: "chain", ok: false, detail: `unknown chain ${b.chain}` });
  } else {
    try {
      const receipt = await readReceipt(
        b.chain as AnchorChainName,
        b.contract_address as `0x${string}`,
        b.tx_hash as `0x${string}`,
      );
      const event = receipt?.events.find((e) => e.batchId === BigInt(b.batch_id ?? 0));
      const ok = !!receipt && receipt.status === "success" && !!event && event.root === b.merkle_root;
      if (receipt) blockTimestamp = receipt.blockTimestamp.toISOString();
      checks.push({
        name: "on_chain",
        ok,
        detail: !receipt
          ? "transaction not found on chain"
          : !event
            ? "transaction has no Anchored event for this batch from this contract"
            : event.root !== b.merkle_root
              ? `on-chain root ${event.root} differs from merkle_root`
              : `Anchored(batch ${b.batch_id}) found in block ${receipt.blockNumber}`,
      });
    } catch (e) {
      checks.push({
        name: "on_chain",
        ok: false,
        detail: `could not read the chain: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`,
      });
    }
  }
  return { result: checks.every((c) => c.ok) ? "pass" : "fail", checks, block_timestamp: blockTimestamp };
}

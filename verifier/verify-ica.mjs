#!/usr/bin/env node
/**
 * verify-ica.mjs: independent verifier for Intelligent Cleaning Audit (ICA) records.
 *
 * Checks a verification bundle without using any ICA server:
 *   1. recompute sha256(JCS(canonical_record)) and compare it with record_hash (RFC 8785 JCS);
 *   2. walk the Merkle proof and compare the result with merkle_root;
 *   3. fetch the transaction receipt from a public Base node, find the contract's Anchored event
 *      for the batch and compare its root;
 *   4. print PASS or FAIL with the block timestamp.
 *
 * Usage:  node verify-ica.mjs <bundle.json> [--rpc <url>]
 * Needs Node.js 18 or later. No dependencies. Exit code 0 = PASS, 1 = FAIL, 2 = pending/usage.
 *
 * MIT licence. Read it: it is short on purpose.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const PUBLIC_RPC = {
  "base-sepolia": "https://sepolia.base.org",
  base: "https://mainnet.base.org",
};
const CHAIN_IDS = { "base-sepolia": 84532, base: 8453 };

// keccak256("Anchored(uint256,bytes32,uint256)"), the event's first topic. Check it with any
// Ethereum tool, for example: cast sig-event "Anchored(uint256,bytes32,uint256)".
export const ANCHORED_TOPIC = "0x770041f1a960bfc5b73fb4938dd18b041e2e22692a6230c82927bf60734173ed";

// --- RFC 8785 JSON Canonicalization Scheme -----------------------------------------------------
// Keys sorted by UTF-16 code units, no whitespace, strings and numbers serialised as ECMAScript
// JSON.stringify does (which is what RFC 8785 specifies).
export function jcs(value) {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("non-finite number");
    if (typeof value === "string" && !value.isWellFormed()) throw new Error("lone surrogate");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? "null" : jcs(v))).join(",")}]`;
  const keys = Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${jcs(value[k])}`).join(",")}}`;
}

export const sha256 = (data) => createHash("sha256").update(data).digest("hex");

// --- Merkle rule ----------------------------------------------------------------------------
// parent = sha256(min(a, b) || max(a, b)) over the raw 32-byte values; odd nodes are promoted
// unchanged, so the proof only lists real siblings.
export function rootFromProof(leaf, proof) {
  return proof.reduce((acc, sib) => {
    const [x, y] = acc < sib ? [acc, sib] : [sib, acc];
    return sha256(Buffer.from(x + y, "hex"));
  }, leaf);
}

// --- Chain ----------------------------------------------------------------------------------
async function rpc(url, method, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

/** Finds the Anchored event for batchId emitted by contract in the transaction. */
export async function readAnchor(rpcUrl, contract, txHash, batchId) {
  const receipt = await rpc(rpcUrl, "eth_getTransactionReceipt", [txHash]);
  if (!receipt) return { found: false, reason: "transaction not found" };
  if (receipt.status !== "0x1") return { found: false, reason: "transaction reverted" };
  const wantBatch = `0x${BigInt(batchId).toString(16).padStart(64, "0")}`;
  const log = receipt.logs.find(
    (l) =>
      l.address.toLowerCase() === contract.toLowerCase() &&
      l.topics[0]?.toLowerCase() === ANCHORED_TOPIC &&
      l.topics[1]?.toLowerCase() === wantBatch,
  );
  if (!log) return { found: false, reason: "no Anchored event for this batch from this contract" };
  const data = log.data.slice(2);
  const root = data.slice(0, 64).toLowerCase();
  const recordCount = BigInt(`0x${data.slice(64, 128)}`);
  const block = await rpc(rpcUrl, "eth_getBlockByNumber", [receipt.blockNumber, false]);
  return {
    found: true,
    root,
    recordCount,
    blockNumber: BigInt(receipt.blockNumber),
    blockTimestamp: new Date(Number(BigInt(block.timestamp)) * 1000).toISOString(),
  };
}

/** Runs every check. Returns { result: "PASS" | "FAIL" | "PENDING", checks, blockTimestamp }. */
export async function verifyBundle(bundle, { rpcUrl } = {}) {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok, detail });

  if (bundle?.schema !== "ica.verify.v1") throw new Error("not an ICA verification bundle (ica.verify.v1)");
  const recomputed = sha256(jcs(bundle.canonical_record));
  add("record hash", recomputed === bundle.record_hash, `sha256(JCS(record)) = ${recomputed}`);

  if (!bundle.merkle_root || !bundle.tx_hash || !bundle.contract_address || !bundle.batch_id) {
    add("anchor", false, "record not anchored yet");
    return { result: checks.every((c) => c.ok) ? "PENDING" : "FAIL", checks, blockTimestamp: null };
  }

  const root = rootFromProof(bundle.record_hash, bundle.merkle_proof ?? []);
  add("merkle proof", root === bundle.merkle_root, `proof leads to ${root}`);

  const url = rpcUrl ?? PUBLIC_RPC[bundle.chain];
  if (!url) {
    add("chain", false, `unknown chain "${bundle.chain}"; pass --rpc`);
    return { result: "FAIL", checks, blockTimestamp: null };
  }
  if (!rpcUrl) {
    const chainId = Number(BigInt(await rpc(url, "eth_chainId", [])));
    if (chainId !== CHAIN_IDS[bundle.chain])
      add("chain", false, `RPC is chain ${chainId}, expected ${bundle.chain}`);
  }
  const anchor = await readAnchor(url, bundle.contract_address, bundle.tx_hash, bundle.batch_id);
  if (!anchor.found) add("on-chain anchor", false, anchor.reason);
  else
    add(
      "on-chain anchor",
      anchor.root === bundle.merkle_root,
      `contract ${bundle.contract_address} emitted Anchored(batch ${bundle.batch_id}, root ${anchor.root}) in block ${anchor.blockNumber}`,
    );
  return {
    result: checks.every((c) => c.ok) ? "PASS" : "FAIL",
    checks,
    blockTimestamp: anchor.found ? anchor.blockTimestamp : null,
  };
}

async function main(argv) {
  const rpcIndex = argv.indexOf("--rpc");
  const rpcUrl = rpcIndex >= 0 ? argv[rpcIndex + 1] : undefined;
  const file = argv.find((a, i) => !a.startsWith("--") && (rpcIndex < 0 || i !== rpcIndex + 1));
  if (!file || (rpcIndex >= 0 && !rpcUrl)) {
    console.error("Usage: node verify-ica.mjs <bundle.json> [--rpc <url>]");
    return 2;
  }
  const bundle = JSON.parse(readFileSync(file, "utf8"));
  const out = await verifyBundle(bundle, { rpcUrl });
  for (const c of out.checks) console.log(`${c.ok ? "ok  " : "FAIL"}  ${c.name}: ${c.detail}`);
  console.log("");
  if (out.result === "PASS")
    console.log(`PASS: record existed no later than ${out.blockTimestamp} (block time)`);
  else if (out.result === "PENDING") console.log("PENDING: the record hash is correct but not anchored yet");
  else console.log("FAIL: this record does not match its anchor");
  return out.result === "PASS" ? 0 : out.result === "PENDING" ? 2 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e) => {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    },
  );
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { jcs, sha256Hex } from "@/lib/seal/canonical";
import { currentItems, type CanonicalRecord } from "@/lib/seal/record";

import { explorerTxUrl } from "./config";
import { rootFromProof } from "./merkle";

type Db = SupabaseClient<Database>;

export type VerifyStatus = "verified" | "pending" | "mismatch";

/** What anyone with the link may see (docs/AUDIT_TRAIL.md): no names, notes or photos. */
export interface PublicVerification {
  record_id: string;
  record_type: "audit" | "amendment";
  status: VerifyStatus;
  record_hash: string;
  sealed_at: string;
  site_alias: string;
  shift_date: string;
  outcome: { steps: number; done: number; failed: number; skipped: number; task_status: string };
  merkle_proof: string[] | null;
  batch: {
    id: number;
    status: string;
    merkle_root: string;
    chain: string;
    contract_address: string | null;
    tx_hash: string | null;
    tx_url: string | null;
    anchored_at: string | null;
    block_number: number | null;
  } | null;
  amends_record_id: string | null;
  superseded_by: { record_id: string; sealed_at: string }[];
  checks: { record_hash: boolean; merkle_proof: boolean | null };
}

/** A stable, non-identifying label for a site. */
export function siteAlias(siteId: string): string {
  return `Site ${sha256Hex(siteId).slice(0, 6).toUpperCase()}`;
}

export const RECORD_COLUMNS = `id, site_id, task_id, record_type, amends_record_id, site_seq, record_hash,
  canonical_text, sealed_at, merkle_proof,
  anchor_batches(id, status, merkle_root, chain, contract_address, tx_hash, block_number, block_timestamp)`;

/** Loads a record for the public verify page and API. Service-role client; returns only safe fields. */
export async function loadPublicVerification(db: Db, recordId: string): Promise<PublicVerification | null> {
  const { data: r } = await db.from("sealed_records").select(RECORD_COLUMNS).eq("id", recordId).maybeSingle();
  if (!r) return null;

  const record = JSON.parse(r.canonical_text) as CanonicalRecord;
  const hashOk = sha256Hex(jcs(record)) === r.record_hash && sha256Hex(r.canonical_text) === r.record_hash;
  const batch = r.anchor_batches;
  const proof = (r.merkle_proof as string[] | null) ?? null;
  const proofOk = batch && proof ? rootFromProof(r.record_hash, proof) === batch.merkle_root : null;
  const status: VerifyStatus =
    !hashOk || proofOk === false
      ? "mismatch"
      : batch?.status === "anchored" && proofOk
        ? "verified"
        : "pending";

  const items = currentItems(record.items ?? []);
  const { data: later } = await db
    .from("sealed_records")
    .select("id, sealed_at")
    .eq("task_id", r.task_id)
    .gt("site_seq", r.site_seq)
    .order("site_seq");

  return {
    record_id: r.id,
    record_type: r.record_type as "audit" | "amendment",
    status,
    record_hash: r.record_hash,
    sealed_at: r.sealed_at,
    site_alias: siteAlias(r.site_id),
    shift_date: record.task?.shift_date ?? "",
    outcome: {
      steps: items.length,
      done: items.filter((i) => i.result === "done").length,
      failed: items.filter((i) => i.result === "failed").length,
      skipped: items.filter((i) => i.result === "skipped").length,
      task_status: record.task?.status ?? "",
    },
    merkle_proof: proof,
    batch: batch
      ? {
          id: batch.id,
          status: batch.status,
          merkle_root: batch.merkle_root,
          chain: batch.chain,
          contract_address: batch.status === "anchored" ? batch.contract_address : null,
          tx_hash: batch.status === "anchored" ? batch.tx_hash : null,
          tx_url:
            batch.status === "anchored" && batch.tx_hash ? explorerTxUrl(batch.chain, batch.tx_hash) : null,
          anchored_at: batch.status === "anchored" ? batch.block_timestamp : null,
          block_number: batch.status === "anchored" ? batch.block_number : null,
        }
      : null,
    amends_record_id: r.amends_record_id,
    superseded_by: (later ?? []).map((l) => ({ record_id: l.id, sealed_at: l.sealed_at })),
    checks: { record_hash: hashOk, merkle_proof: proofOk },
  };
}

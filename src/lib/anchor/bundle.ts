import { z } from "zod";

import { ANCHOR_CHAINS, type AnchorChainName } from "./config";

export const BUNDLE_SCHEMA = "ica.verify.v1";
export const MERKLE_RULE = "sha256-sorted-pairs, odd-node-promoted, leaves sorted ascending";

const hex64 = z.string().regex(/^[0-9a-f]{64}$/);

/** The downloadable verification bundle (docs/AUDIT_TRAIL.md). */
export const verificationBundleSchema = z.object({
  schema: z.literal(BUNDLE_SCHEMA),
  canonical_record: z.record(z.string(), z.unknown()),
  record_hash: hex64,
  merkle_proof: z.array(hex64).max(64).nullable(),
  merkle_root: hex64.nullable(),
  merkle_rule: z.string().optional(),
  chain: z.string().max(40),
  chain_id: z.number().int().positive().nullable().optional(),
  contract_address: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .nullable(),
  tx_hash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/)
    .nullable(),
  batch_id: z.number().int().positive().nullable(),
  block_number: z.number().int().nullable().optional(),
  block_timestamp: z.string().nullable().optional(),
});
export type VerificationBundle = z.infer<typeof verificationBundleSchema>;

export interface BundleSource {
  canonical_text: string;
  record_hash: string;
  merkle_proof: unknown;
  batch: {
    id: number;
    merkle_root: string;
    chain: string;
    contract_address: string | null;
    tx_hash: string | null;
    status: string;
    block_number: number | null;
    block_timestamp: string | null;
  } | null;
}

export function buildBundle(src: BundleSource): VerificationBundle {
  const anchored = src.batch?.status === "anchored" ? src.batch : null;
  const chain = src.batch?.chain ?? "base-sepolia";
  return {
    schema: BUNDLE_SCHEMA,
    canonical_record: JSON.parse(src.canonical_text) as Record<string, unknown>,
    record_hash: src.record_hash,
    merkle_proof: src.batch ? (src.merkle_proof as string[]) : null,
    merkle_root: src.batch?.merkle_root ?? null,
    merkle_rule: MERKLE_RULE,
    chain,
    chain_id: ANCHOR_CHAINS[chain as AnchorChainName]?.id ?? null,
    contract_address: anchored?.contract_address ?? null,
    tx_hash: anchored?.tx_hash ?? null,
    batch_id: src.batch?.id ?? null,
    block_number: anchored?.block_number ?? null,
    block_timestamp: anchored?.block_timestamp ? new Date(anchored.block_timestamp).toISOString() : null,
  };
}

import { NextResponse } from "next/server";

import { verificationBundleSchema } from "@/lib/anchor/bundle";
import { publicReceiptReader } from "@/lib/anchor/chain";
import { ANCHOR_CHAINS } from "@/lib/anchor/config";
import { verifyBundle } from "@/lib/anchor/verify";
import { clientIp } from "@/lib/marketing/demo-request";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_BYTES = 1_000_000;

/**
 * Checks an uploaded verification bundle: recomputes the record hash and Merkle proof, and reads
 * the Anchored event from a public RPC. Also says whether ICA still holds a record with that hash.
 */
export async function POST(request: Request) {
  if (!rateLimit(`verify-bundle:${clientIp(request.headers)}`, 10, 60_000))
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const text = await request.text().catch(() => "");
  if (text.length > MAX_BYTES) return NextResponse.json({ error: "Bundle too large" }, { status: 413 });
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // reported below
  }
  const parsed = verificationBundleSchema.safeParse(json);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Not a verification bundle", issues: parsed.error.issues },
      { status: 400 },
    );

  const result = await verifyBundle(parsed.data, (chain, contractAddress, txHash) =>
    publicReceiptReader({
      chainId: ANCHOR_CHAINS[chain].id,
      rpcUrl: process.env.ANCHOR_RPC_URL || ANCHOR_CHAINS[chain].defaultRpc,
      contractAddress,
    })(txHash),
  );

  const { data: held } = await createAdminClient()
    .from("sealed_records")
    .select("id")
    .eq("record_hash", parsed.data.record_hash)
    .maybeSingle();
  const configured = process.env.ANCHOR_CONTRACT_ADDRESS?.toLowerCase();
  return NextResponse.json({
    ...result,
    ica_holds_record: !!held,
    ica_contract: configured
      ? parsed.data.contract_address?.toLowerCase() === configured
        ? "matches ICA's contract"
        : "differs from ICA's current contract"
      : "ICA contract not configured",
  });
}

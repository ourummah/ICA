import { NextResponse } from "next/server";
import { z } from "zod";

import { buildBundle } from "@/lib/anchor/bundle";
import { RECORD_COLUMNS } from "@/lib/anchor/public";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * The full verification bundle (canonical record, proof, transaction). The record holds notes and
 * people's ids, so it needs a staff sign-in with access to the site (RLS applies).
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/verify/[recordId]/bundle">) {
  const id = z.uuid().safeParse((await ctx.params).recordId);
  if (!id.success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in to download the bundle" }, { status: 401 });

  const { data: r } = await supabase
    .from("sealed_records")
    .select(RECORD_COLUMNS)
    .eq("id", id.data)
    .maybeSingle();
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const bundle = buildBundle({
    canonical_text: r.canonical_text,
    record_hash: r.record_hash,
    merkle_proof: r.merkle_proof,
    batch: r.anchor_batches,
  });
  return new NextResponse(JSON.stringify(bundle, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="ica-verification-${r.id}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

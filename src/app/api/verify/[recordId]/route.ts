import { NextResponse } from "next/server";
import { z } from "zod";

import { loadPublicVerification } from "@/lib/anchor/public";
import { clientIp } from "@/lib/marketing/demo-request";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Public verification status for one sealed record: hashes, proof and transaction, no details. */
export async function GET(request: Request, ctx: RouteContext<"/api/verify/[recordId]">) {
  if (!rateLimit(`verify:${clientIp(request.headers)}`, 60, 60_000))
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const id = z.uuid().safeParse((await ctx.params).recordId);
  if (!id.success) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const v = await loadPublicVerification(createAdminClient(), id.data);
  if (!v) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(v, { headers: { "Cache-Control": "no-store" } });
}

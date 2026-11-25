import { NextResponse } from "next/server";

import { runConfiguredAnchorJob } from "@/lib/anchor/run";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Daily anchoring job, called by Vercel Cron (vercel.json) at 00:15 AEST. Vercel sends
 * CRON_SECRET as a bearer token; anything else is refused.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const report = await runConfiguredAnchorJob({ waitMs: 40_000 });
  return NextResponse.json(report);
}

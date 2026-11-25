import { after, NextResponse } from "next/server";

import { clientIp, demoRequestSchema } from "@/lib/marketing/demo-request";
import { notifyDemoRequest } from "@/lib/marketing/notify";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Public "Book a demo" endpoint (SPEC F9). Validated with Zod, rate limited per IP (SPEC 11), and
 * saved with the service role: demo_requests has no RLS policies, so nobody can read it via the API.
 */
export async function POST(request: Request) {
  const parsed = demoRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    return NextResponse.json({ error: "Please check the form", fieldErrors }, { status: 400 });
  }
  const { website, ...req } = parsed.data;
  // Bots fill the hidden field. Pretend it worked so they don't retry.
  if (website) return NextResponse.json({ ok: true });
  // Counted only for valid requests, so fixing a typo never locks a person out.
  if (!rateLimit(`demo:${clientIp(request.headers)}`, 5, 10 * 60_000))
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });

  const { error } = await createAdminClient()
    .from("demo_requests")
    .insert({
      name: req.name,
      company: req.company ?? null,
      email: req.email,
      phone: req.phone ?? null,
      message: req.message ?? null,
    });
  if (error) {
    console.error("demo request insert failed", error.message);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  after(() => notifyDemoRequest(req));
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSiteRole } from "@/lib/admin/context";
import { translatePendingNotes } from "@/lib/ai/notes";
import { TranslationUnavailable } from "@/lib/ai/translate";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const bodySchema = z.object({ step_record_id: z.uuid() });

/**
 * Translate one cleaner note now (SPEC F8), e.g. when a supervisor retries. Takes a step record
 * id rather than free text, so the route can't be used as a general translation service. The
 * note's English is stored as a new 'ai' row; the original is never changed.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { supabase, site, profileId } = await requireSiteRole(["supervisor", "qa", "site_admin"]);
  if (!rateLimit(`translate:${profileId}`, 30, 60_000))
    return NextResponse.json({ error: "Too many requests, try again in a minute" }, { status: 429 });

  const { data: record } = await supabase
    .from("step_records")
    .select("id, site_id")
    .eq("id", parsed.data.step_record_id)
    .maybeSingle();
  if (!record || record.site_id !== site.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const result = await translatePendingNotes(site.id, { recordIds: [record.id] });
    if (result.failed)
      return NextResponse.json({ error: "Translation failed; it will be retried" }, { status: 502 });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof TranslationUnavailable)
      return NextResponse.json({ error: "Translation is not configured" }, { status: 503 });
    throw e;
  }
}

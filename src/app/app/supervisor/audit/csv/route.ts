import { requireSiteRole } from "@/lib/admin/context";
import { packToCsv } from "@/lib/audit/csv";
import { packFileName, parsePackFilter } from "@/lib/audit/filter";
import { loadAuditPack } from "@/lib/audit/pack";

export const runtime = "nodejs";

/** Every step record in the period as CSV (SPEC F7). */
export async function GET(request: Request) {
  const parsed = parsePackFilter(new URL(request.url).searchParams);
  if (!parsed.ok) return new Response(parsed.error, { status: 400 });
  const ctx = await requireSiteRole(["qa", "supervisor", "site_admin"]);
  const pack = await loadAuditPack(ctx, parsed.filter, { withPhotos: false });
  // A byte-order mark so Excel opens UTF-8 notes (Tagalog, Bahasa) correctly.
  return new Response("﻿" + packToCsv(pack), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${packFileName(ctx.site.name, parsed.filter, "csv")}"`,
      "cache-control": "private, no-store",
    },
  });
}

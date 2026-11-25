import { renderToBuffer } from "@react-pdf/renderer";

import { requireSiteRole } from "@/lib/admin/context";
import { packFileName, parsePackFilter } from "@/lib/audit/filter";
import { loadAuditPack } from "@/lib/audit/pack";
import { AuditPackDocument } from "@/lib/audit/pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

/** The audit pack PDF for a date range and zones (SPEC F7). */
export async function GET(request: Request) {
  const parsed = parsePackFilter(new URL(request.url).searchParams);
  if (!parsed.ok) return new Response(parsed.error, { status: 400 });
  const ctx = await requireSiteRole(["qa", "supervisor", "site_admin"]);
  const pack = await loadAuditPack(ctx, parsed.filter, {
    withPhotos: true,
    verifyBaseUrl: process.env.PUBLIC_SITE_URL || new URL(request.url).origin,
  });
  const pdf = await renderToBuffer(<AuditPackDocument pack={pack} />);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${packFileName(ctx.site.name, parsed.filter, "pdf")}"`,
      "cache-control": "private, no-store",
    },
  });
}

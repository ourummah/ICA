import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PreopForm } from "@/components/supervisor/qa-forms";
import { requireSiteRole } from "@/lib/admin/context";
import { currentShift, loadShiftTasks } from "@/lib/supervisor/data";

import { submitPreop } from "../../../actions";

async function Preop({ zoneId }: { zoneId: string }) {
  const { supabase, site } = await requireSiteRole(["qa", "supervisor"]);
  const { data: zone } = await supabase
    .from("zones")
    .select("id, name")
    .eq("id", zoneId)
    .eq("site_id", site.id)
    .maybeSingle();
  if (!zone) notFound();
  const shift = await currentShift(supabase, site.id);
  const { data: items } = await supabase
    .from("preop_items")
    .select("label")
    .eq("site_id", site.id)
    .order("sort_order")
    .order("label");
  const tasks = shift
    ? (await loadShiftTasks(supabase, shift.id)).filter(
        (t) => t.zoneId === zone.id && t.status !== "reclean_required",
      )
    : [];

  return (
    <>
      <div>
        <Link href={`/app/supervisor/zones/${zone.id}`} className="text-sm text-accent underline">
          {zone.name}
        </Link>
        <h1 className="text-2xl font-bold text-primary">Pre-op inspection: {zone.name}</h1>
        <p className="text-muted-foreground">
          Mark each item. A failed item needs a note; add a photo if you can.
        </p>
      </div>
      {!shift ? (
        <p>There is no shift to inspect.</p>
      ) : !items?.length ? (
        <p>
          This site has no pre-op checklist yet. A site admin can set it up under{" "}
          <Link href="/app/admin/preop" className="text-accent underline">
            Pre-op checklist
          </Link>
          .
        </p>
      ) : (
        <PreopForm
          action={submitPreop}
          zoneId={zone.id}
          shiftId={shift.id}
          items={items.map((i) => i.label)}
          tasks={tasks.map((t) => ({
            id: t.id,
            label: `${t.equipmentName}${t.recleanOfTaskId ? " (re-clean)" : ""}`,
          }))}
        />
      )}
    </>
  );
}

export default async function PreopPage({ params }: PageProps<"/app/supervisor/zones/[zoneId]/preop">) {
  const { zoneId } = await params;
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <Preop zoneId={zoneId} />
    </Suspense>
  );
}

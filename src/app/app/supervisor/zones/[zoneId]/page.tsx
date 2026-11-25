import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { LiveRefresh } from "@/components/supervisor/live-refresh";
import { ReleaseForm } from "@/components/supervisor/qa-forms";
import { BoardLabel, colourStyles, ReleaseLine, TaskStatusBadge } from "@/components/supervisor/status";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatSiteTime, requireSiteRole } from "@/lib/admin/context";
import { boardState, shortName } from "@/lib/supervisor/board";
import { currentShift, loadExceptions, loadShiftTasks, loadZoneQa } from "@/lib/supervisor/data";

import { decideRelease } from "../../actions";
import { cn } from "@/lib/utils";

async function Zone({ zoneId }: { zoneId: string }) {
  const { supabase, site, roles } = await requireSiteRole(["supervisor", "qa", "site_admin"]);
  const { data: zone } = await supabase
    .from("zones")
    .select("id, name, risk_level")
    .eq("id", zoneId)
    .eq("site_id", site.id)
    .maybeSingle();
  if (!zone) notFound();

  const shift = await currentShift(supabase, site.id);
  const tasks = (shift ? await loadShiftTasks(supabase, shift.id) : []).filter((t) => t.zoneId === zone.id);
  const open = await loadExceptions(supabase, {
    siteId: site.id,
    taskIds: tasks.map((t) => t.id),
    status: "open",
  });
  const zoneState = boardState(tasks, open, shift?.endsAt ?? null);
  const qa = shift ? await loadZoneQa(supabase, shift.id) : null;
  const preop = qa?.preops.get(zone.id);
  const release = qa?.releases.get(zone.id);
  const isQa = roles.includes("qa");
  const canInspect = isQa || roles.includes("supervisor");

  // One row per piece of equipment; its tasks newest first (a re-clean sits above the original).
  const byEquipment = new Map<string, typeof tasks>();
  for (const t of tasks) byEquipment.set(t.equipmentId, [t, ...(byEquipment.get(t.equipmentId) ?? [])]);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link href="/app/supervisor" className="text-sm text-accent underline">
            Zone board
          </Link>
          <h1 className="text-2xl font-bold text-primary">{zone.name}</h1>
          <BoardLabel colour={zoneState.colour} label={zoneState.label} />
        </div>
        <LiveRefresh siteId={site.id} />
      </div>
      {shift ? (
        <Card className="flex flex-col gap-4" aria-label="Pre-op and release">
          <h2 className="text-lg font-semibold">Pre-op and release</h2>
          <div className="flex flex-col gap-1 text-sm">
            {preop ? (
              <>
                <p data-preop={preop.result}>
                  <strong className={preop.result === "pass" ? "text-status-green" : "text-status-red"}>
                    Pre-op {preop.result === "pass" ? "passed" : "failed"}
                  </strong>{" "}
                  {formatSiteTime(preop.completedAt, site.timezone)} by {shortName(preop.byName)}
                </p>
                {preop.items.filter((i) => !i.pass).length ? (
                  <ul className="list-disc pl-5">
                    {preop.items
                      .filter((i) => !i.pass)
                      .map((i, n) => (
                        <li key={n}>
                          {i.label}: {i.note}
                          {i.photo_path ? " (photo)" : ""}
                        </li>
                      ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground">No pre-op inspection yet this shift.</p>
            )}
            {canInspect ? (
              <Button asChild variant="outline" size="sm" className="mt-1 self-start">
                <Link href={`/app/supervisor/zones/${zone.id}/preop`}>
                  {preop ? "Inspect again" : "Start pre-op inspection"}
                </Link>
              </Button>
            ) : null}
          </div>
          <ReleaseLine release={release} timezone={site.timezone} />
          {isQa ? (
            <ReleaseForm
              action={decideRelease}
              zoneId={zone.id}
              shiftId={shift.id}
              openRed={zoneState.openRed}
            />
          ) : !release ? (
            <p className="text-sm text-muted-foreground">QA releases or holds the zone.</p>
          ) : null}
        </Card>
      ) : null}
      {byEquipment.size === 0 ? (
        <p className="text-muted-foreground">No tasks in this zone tonight.</p>
      ) : null}
      <ul className="flex flex-col gap-3" aria-label="Equipment">
        {[...byEquipment.values()].map((eqTasks) => {
          const state = boardState(eqTasks, open, shift?.endsAt ?? null);
          return (
            <li
              key={eqTasks[0].equipmentId}
              className={cn("rounded-xl border-4 p-4", colourStyles[state.colour].tile)}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold">{eqTasks[0].equipmentName}</h2>
                <BoardLabel colour={state.colour} label={state.label} />
              </div>
              <ul className="mt-2 flex flex-col gap-1">
                {eqTasks.map((t) => {
                  const ex = open.filter((e) => e.taskId === t.id).length;
                  return (
                    <li key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <Link
                        href={`/app/supervisor/tasks/${t.id}`}
                        className="font-semibold text-accent underline"
                      >
                        {t.recleanOfTaskId ? "Re-clean" : "Clean"}
                      </Link>
                      <TaskStatusBadge status={t.status} />
                      <span className="text-muted-foreground">{t.assignedName ?? "Unassigned"}</span>
                      {ex ? (
                        <span className="font-semibold text-status-red">
                          {ex} open exception{ex === 1 ? "" : "s"}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export default async function ZonePage({ params }: PageProps<"/app/supervisor/zones/[zoneId]">) {
  const { zoneId } = await params;
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <Zone zoneId={zoneId} />
    </Suspense>
  );
}

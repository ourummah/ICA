import Link from "next/link";
import { Suspense } from "react";

import { LiveRefresh } from "@/components/supervisor/live-refresh";
import { BoardLabel, colourStyles, ReleaseLine } from "@/components/supervisor/status";
import { formatSiteTime, requireSiteRole } from "@/lib/admin/context";
import { boardState } from "@/lib/supervisor/board";
import { currentShift, loadExceptions, loadShiftTasks, loadZoneQa } from "@/lib/supervisor/data";
import { cn } from "@/lib/utils";

async function Board() {
  const { supabase, site } = await requireSiteRole(["supervisor", "qa", "site_admin"]);
  // Raise "not finished by shift end" exceptions before reading (idempotent).
  await supabase.rpc("flag_overdue_tasks", { p_site_id: site.id });

  const shift = await currentShift(supabase, site.id);
  const { data: zones } = await supabase
    .from("zones")
    .select("id, name, risk_level")
    .eq("site_id", site.id)
    .order("sort_order");
  const tasks = shift ? await loadShiftTasks(supabase, shift.id) : [];
  const open = await loadExceptions(supabase, {
    siteId: site.id,
    taskIds: tasks.map((t) => t.id),
    status: "open",
  });
  const reds = open.filter((e) => e.severity === "red").length;
  const qa = shift ? await loadZoneQa(supabase, shift.id) : null;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-primary">Zone board</h1>
          <p className="text-muted-foreground">
            {site.name}
            {shift
              ? ` · shift ${formatSiteTime(shift.startsAt, site.timezone)} to ${formatSiteTime(shift.endsAt, site.timezone)}`
              : " · no shift planned"}
          </p>
        </div>
        <LiveRefresh siteId={site.id} />
      </div>
      <p className="rounded-md border border-border bg-muted px-4 py-3 text-sm">
        Cleaner phones save to the device first. Records and alerts appear here as each device syncs, so a
        phone with no signal shows no new activity until it reconnects.
      </p>
      {open.length ? (
        <Link
          href="/app/supervisor/exceptions"
          className="self-start font-semibold text-status-red underline"
        >
          {open.length} open exception{open.length === 1 ? "" : "s"} ({reds} red)
        </Link>
      ) : null}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Zones">
        {(zones ?? []).map((z) => {
          const zoneTasks = tasks.filter((t) => t.zoneId === z.id);
          const state = boardState(zoneTasks, open, shift?.endsAt ?? null);
          return (
            <li key={z.id}>
              <Link
                href={`/app/supervisor/zones/${z.id}`}
                data-colour={state.colour}
                aria-label={`${z.name}: ${state.label}`}
                className={cn(
                  "flex min-h-36 flex-col gap-2 rounded-xl border-4 p-4 hover:shadow-md",
                  colourStyles[state.colour].tile,
                )}
              >
                <span className="text-lg font-bold text-primary">{z.name}</span>
                <BoardLabel colour={state.colour} label={state.label} className="text-lg" />
                <span className="text-sm text-muted-foreground">
                  {state.done} of {state.total} tasks done
                  {state.openRed + state.openAmber > 0
                    ? ` · ${state.openRed + state.openAmber} open exception${state.openRed + state.openAmber === 1 ? "" : "s"}`
                    : ""}
                </span>
                {qa?.preops.get(z.id) ? (
                  <span className="text-sm">
                    Pre-op: {qa.preops.get(z.id)!.result === "pass" ? "passed" : "failed"}
                  </span>
                ) : null}
                <ReleaseLine release={qa?.releases.get(z.id)} timezone={site.timezone} />
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export default function SupervisorHome() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <Board />
    </Suspense>
  );
}

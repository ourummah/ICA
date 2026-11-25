import Link from "next/link";
import { Suspense } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { RecleanForm, ResolveForm } from "@/components/supervisor/exception-actions";
import { LiveRefresh } from "@/components/supervisor/live-refresh";
import { ExceptionBadge, TaskStatusBadge } from "@/components/supervisor/status";
import { formatSiteTime, requireSiteRole } from "@/lib/admin/context";
import { describeException, EXCEPTION_LABELS } from "@/lib/supervisor/board";
import { currentShift, loadExceptions, loadShiftTasks } from "@/lib/supervisor/data";

import { requestReclean, resolveException } from "../actions";

const filterSchema = z.object({
  status: z.enum(["open", "resolved", "all"]).catch("open"),
  severity: z.enum(["red", "amber", "all"]).catch("all"),
  type: z.enum(["all", ...(Object.keys(EXCEPTION_LABELS) as [keyof typeof EXCEPTION_LABELS])]).catch("all"),
});

const selectClass = "h-10 rounded-md border border-input bg-background px-3";

async function Queue({ filters }: { filters: z.infer<typeof filterSchema> }) {
  const { supabase, site, roles } = await requireSiteRole(["supervisor", "qa", "site_admin"]);
  const shift = await currentShift(supabase, site.id);
  const tasks = shift ? await loadShiftTasks(supabase, shift.id) : [];
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const all = await loadExceptions(supabase, {
    siteId: site.id,
    taskIds: tasks.map((t) => t.id),
    status: filters.status === "all" ? undefined : filters.status,
  });
  const shown = all.filter(
    (e) =>
      (filters.severity === "all" || e.severity === filters.severity) &&
      (filters.type === "all" || e.type === filters.type),
  );
  // Red first, then newest.
  shown.sort((a, b) =>
    a.severity === b.severity ? b.createdAt.localeCompare(a.createdAt) : a.severity === "red" ? -1 : 1,
  );
  const canReclean = roles.some((r) => r === "supervisor" || r === "site_admin");

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-primary">Exceptions</h1>
          <p className="text-muted-foreground">Tonight&apos;s shift · {site.name}</p>
        </div>
        <LiveRefresh siteId={site.id} />
      </div>
      <form className="flex flex-wrap items-end gap-3" aria-label="Filter exceptions">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Status</span>
          <select name="status" defaultValue={filters.status} className={selectClass}>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Severity</span>
          <select name="severity" defaultValue={filters.severity} className={selectClass}>
            <option value="all">All</option>
            <option value="red">Red</option>
            <option value="amber">Amber</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Type</span>
          <select name="type" defaultValue={filters.type} className={selectClass}>
            <option value="all">All</option>
            {Object.entries(EXCEPTION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>
      {shown.length === 0 ? <p className="text-muted-foreground">Nothing matches these filters.</p> : null}
      <ul className="flex flex-col gap-3" aria-label="Exception queue">
        {shown.map((e) => {
          const task = taskById.get(e.taskId);
          return (
            <li
              key={e.id}
              className="flex flex-col gap-2 rounded-lg border border-border p-4"
              data-exception-type={e.type}
            >
              <div className="flex flex-wrap items-center gap-2">
                <ExceptionBadge type={e.type} severity={e.severity} status={e.status} />
                <Link
                  href={`/app/supervisor/tasks/${e.taskId}`}
                  className="font-semibold text-accent underline"
                >
                  {task?.recleanOfTaskId ? "Re-clean: " : ""}
                  {task?.equipmentName ?? "Task"}
                </Link>
                {task ? <TaskStatusBadge status={task.status} /> : null}
                <span className="text-xs text-muted-foreground">
                  {formatSiteTime(e.createdAt, site.timezone)}
                </span>
              </div>
              <p className="text-sm">
                {describeException(e.type, e.detail)}
                {task?.assignedName ? ` · ${task.assignedName}` : ""}
              </p>
              {e.status === "resolved" ? (
                <p className="text-sm text-muted-foreground">
                  Resolved{e.resolvedByName ? ` by ${e.resolvedByName}` : ""}: {e.resolutionNote}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  <ResolveForm action={resolveException} exceptionId={e.id} />
                  {canReclean && task && task.status !== "reclean_required" ? (
                    <RecleanForm action={requestReclean} taskId={task.id} />
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

export default async function ExceptionsPage({ searchParams }: PageProps<"/app/supervisor/exceptions">) {
  const filters = filterSchema.parse(await searchParams);
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <Queue filters={filters} />
    </Suspense>
  );
}

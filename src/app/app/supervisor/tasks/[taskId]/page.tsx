import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { Card } from "@/components/ui/card";
import { RecleanForm, ResolveForm } from "@/components/supervisor/exception-actions";
import { SealPanel } from "@/components/seal/seal-panel";
import { LiveRefresh } from "@/components/supervisor/live-refresh";
import { NoteBlock } from "@/components/supervisor/note-block";
import { ExceptionBadge, TaskStatusBadge } from "@/components/supervisor/status";
import { formatSiteTime, requireSiteRole } from "@/lib/admin/context";
import { describeException } from "@/lib/supervisor/board";
import { loadExceptions, signPhotoUrls, type DashboardException } from "@/lib/supervisor/data";

import { requestReclean, resolveException, reviewTranslation } from "../../actions";

const RESULT_LABEL = { done: "Done", skipped: "Skipped", failed: "Failed" } as const;

function ExceptionItem({
  e,
  timezone,
  canAct,
}: {
  e: DashboardException;
  timezone: string;
  canAct: boolean;
}) {
  return (
    <li className="flex flex-col gap-2 rounded-md border border-border p-3" data-exception-type={e.type}>
      <div className="flex flex-wrap items-center gap-2">
        <ExceptionBadge type={e.type} severity={e.severity} status={e.status} />
        <span className="text-sm">{describeException(e.type, e.detail)}</span>
        <span className="text-xs text-muted-foreground">raised {formatSiteTime(e.createdAt, timezone)}</span>
      </div>
      {e.status === "resolved" ? (
        <p className="text-sm text-muted-foreground">
          Resolved{e.resolvedByName ? ` by ${e.resolvedByName}` : ""}
          {e.resolvedAt ? ` at ${formatSiteTime(e.resolvedAt, timezone)}` : ""}: {e.resolutionNote}
        </p>
      ) : canAct ? (
        <ResolveForm action={resolveException} exceptionId={e.id} />
      ) : null}
    </li>
  );
}

async function TaskDetail({ taskId }: { taskId: string }) {
  const { supabase, site, roles } = await requireSiteRole(["supervisor", "qa", "site_admin"]);
  const { data: task } = await supabase
    .from("tasks")
    .select(
      `id, status, ssop_id, reclean_of_task_id, equipment(name, zones(id, name)),
       profiles!tasks_assigned_profile_id_fkey(display_name),
       ssops(version, ssop_steps(id, step_no, title_en, step_type, dwell_minutes, atp_pass_max, photo_required))`,
    )
    .eq("id", taskId)
    .eq("site_id", site.id)
    .maybeSingle();
  if (!task) notFound();

  const [{ data: records }, exceptions, { data: recleans }, { data: seals }] = await Promise.all([
    supabase
      .from("step_records")
      .select(
        `id, ssop_step_id, result, skip_reason, note_original, note_language, atp_value, timer_started_at,
         timer_ended_at, device_completed_at, server_received_at, supersedes_id,
         profiles(display_name), photos(id, storage_path, sha256),
         note_translations(text_en, source, created_at, profiles(display_name))`,
      )
      .eq("task_id", task.id)
      .order("server_received_at"),
    loadExceptions(supabase, { siteId: site.id, taskIds: [task.id] }),
    supabase.from("tasks").select("id, status").eq("reclean_of_task_id", task.id),
    supabase
      .from("sealed_records")
      .select(
        "id, record_type, record_hash, sealed_at, anchor_batches(id, status, tx_hash, chain, block_timestamp)",
      )
      .eq("task_id", task.id)
      .order("site_seq"),
  ]);
  const photoUrls = await signPhotoUrls(
    supabase,
    (records ?? []).flatMap((r) => r.photos.map((p) => p.storage_path)),
  );

  const steps = [...(task.ssops?.ssop_steps ?? [])].sort((a, b) => a.step_no - b.step_no);
  const canAct = roles.some((r) => r === "supervisor" || r === "site_admin" || r === "qa");
  const canReview = roles.some((r) => r === "supervisor" || r === "qa");
  const canReclean = roles.some((r) => r === "supervisor" || r === "site_admin");
  const taskLevel = exceptions.filter((e) => !e.stepRecordId);
  const zone = task.equipment?.zones;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex flex-col gap-1">
          <nav className="text-sm">
            <Link href="/app/supervisor" className="text-accent underline">
              Zone board
            </Link>
            {zone ? (
              <>
                {" / "}
                <Link href={`/app/supervisor/zones/${zone.id}`} className="text-accent underline">
                  {zone.name}
                </Link>
              </>
            ) : null}
          </nav>
          <h1 className="text-2xl font-bold text-primary">
            {task.reclean_of_task_id ? "Re-clean: " : ""}
            {task.equipment?.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <TaskStatusBadge status={task.status} />
            <span>{task.profiles?.display_name ?? "Unassigned"}</span>
            <span>· SSOP v{task.ssops?.version}</span>
          </div>
          {task.reclean_of_task_id ? (
            <Link
              href={`/app/supervisor/tasks/${task.reclean_of_task_id}`}
              className="text-sm text-accent underline"
            >
              Original clean
            </Link>
          ) : null}
          {(recleans ?? []).map((r) => (
            <Link key={r.id} href={`/app/supervisor/tasks/${r.id}`} className="text-sm text-accent underline">
              Re-clean task
            </Link>
          ))}
        </div>
        <LiveRefresh siteId={site.id} />
      </div>

      <SealPanel seals={seals ?? []} timezone={site.timezone} />

      {taskLevel.length ? (
        <ul className="flex flex-col gap-2" aria-label="Task exceptions">
          {taskLevel.map((e) => (
            <ExceptionItem key={e.id} e={e} timezone={site.timezone} canAct={canAct} />
          ))}
        </ul>
      ) : null}

      {task.status === "reclean_required" ? (
        <p className="rounded-md border border-status-red bg-status-red/10 px-4 py-3 text-sm">
          This clean was sent back. The re-clean task is on the cleaner&apos;s list, and the zone tile follows
          the re-clean from now on.
        </p>
      ) : null}
      {canReclean && task.status !== "reclean_required" ? (
        <Card>
          <h2 className="mb-2 font-semibold">Re-clean</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Creates a new task for this equipment on the same cleaner&apos;s list, and closes this task&apos;s
            open exceptions with your reason.
          </p>
          <RecleanForm action={requestReclean} taskId={task.id} />
        </Card>
      ) : null}

      <ol className="flex flex-col gap-3" aria-label="Steps">
        {steps.map((s) => {
          const recs = (records ?? []).filter((r) => r.ssop_step_id === s.id);
          return (
            <li key={s.id}>
              <Card className="flex flex-col gap-2">
                <h2 className="font-semibold">
                  {s.step_no}. {s.title_en}
                </h2>
                {recs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No record received yet.</p>
                ) : null}
                {recs.map((r) => {
                  const recEx = exceptions.filter((e) => e.stepRecordId === r.id);
                  const dwell =
                    r.timer_started_at && r.timer_ended_at
                      ? Math.round((Date.parse(r.timer_ended_at) - Date.parse(r.timer_started_at)) / 1000)
                      : null;
                  return (
                    <div key={r.id} className="flex flex-col gap-2 border-t border-border pt-2 text-sm">
                      <p>
                        <strong>{RESULT_LABEL[r.result]}</strong>
                        {r.skip_reason ? ` (${r.skip_reason.replaceAll("_", " ")})` : ""} by{" "}
                        {r.profiles?.display_name ?? "?"}
                        {r.device_completed_at
                          ? ` · on device ${formatSiteTime(r.device_completed_at, site.timezone)}`
                          : ""}
                        {` · received ${formatSiteTime(r.server_received_at, site.timezone)}`}
                      </p>
                      {r.atp_value !== null ? (
                        <p>
                          ATP: <strong>{r.atp_value}</strong> RLU (limit {s.atp_pass_max ?? "none"})
                        </p>
                      ) : null}
                      {dwell !== null ? <p>Timer: {dwell} s</p> : null}
                      {r.note_original ? (
                        <NoteBlock
                          recordId={r.id}
                          original={r.note_original}
                          language={r.note_language}
                          translations={r.note_translations}
                          canReview={canReview}
                          action={reviewTranslation}
                        />
                      ) : null}
                      {r.photos.length ? (
                        <div className="flex flex-wrap gap-2">
                          {r.photos.map((p) => {
                            const url = photoUrls.get(p.storage_path);
                            return url ? (
                              <a key={p.id} href={url} target="_blank" rel="noreferrer">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={url}
                                  alt={`Photo for step ${s.step_no}`}
                                  className="h-28 w-40 rounded-md object-cover"
                                />
                              </a>
                            ) : (
                              <span key={p.id} className="text-muted-foreground">
                                Photo uploading…
                              </span>
                            );
                          })}
                        </div>
                      ) : s.photo_required ? (
                        <p className="text-muted-foreground">Photo not received yet.</p>
                      ) : null}
                      {recEx.length ? (
                        <ul className="flex flex-col gap-2">
                          {recEx.map((e) => (
                            <ExceptionItem key={e.id} e={e} timezone={site.timezone} canAct={canAct} />
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  );
                })}
              </Card>
            </li>
          );
        })}
      </ol>
    </>
  );
}

export default async function TaskPage({ params }: PageProps<"/app/supervisor/tasks/[taskId]">) {
  const { taskId } = await params;
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
      <TaskDetail taskId={taskId} />
    </Suspense>
  );
}

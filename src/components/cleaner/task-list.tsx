"use client";

import { CircleCheck, CircleDashed, RefreshCw, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

import type { RecordSummary, Task } from "./types";

const statusStyle = {
  pending: { icon: CircleDashed, cls: "border-border" },
  in_progress: { icon: RefreshCw, cls: "border-status-amber" },
  completed: { icon: CircleCheck, cls: "border-status-green" },
  verified: { icon: CircleCheck, cls: "border-status-green" },
  reclean_required: { icon: TriangleAlert, cls: "border-status-red" },
} as const;

export function doneStepIds(task: Task, records: RecordSummary[]): Set<string> {
  return new Set(records.filter((r) => r.taskId === task.id).map((r) => r.stepId));
}

function TaskCard({ task, records, onOpen }: { task: Task; records: RecordSummary[]; onOpen: () => void }) {
  const t = useTranslations("tasks");
  const done = doneStepIds(task, records).size;
  const status =
    done >= task.steps.length && task.steps.length > 0 && task.status === "pending"
      ? "completed"
      : task.status;
  const { icon: Icon, cls } = statusStyle[status];
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full items-center gap-4 rounded-xl border-4 bg-background p-4 text-left ${cls}`}
    >
      <Icon className="size-10 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        {task.isReclean ? (
          <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-status-red px-3 py-0.5 text-base font-bold text-white">
            <TriangleAlert className="size-4" aria-hidden /> {t("reclean")}
          </span>
        ) : null}
        <span className="block text-xl font-semibold">{task.equipmentName}</span>
        <span className="block text-base text-muted-foreground">
          {task.zoneName} · {t(`risk.${task.riskLevel}`)}
        </span>
        <span className="block text-base font-medium">
          {t(`status.${status}`)} · {t("stepsDone", { done, total: task.steps.length })}
        </span>
      </span>
    </button>
  );
}

export function TaskList({
  tasks,
  records,
  profileId,
  hasShift,
  onOpen,
}: {
  tasks: Task[];
  records: RecordSummary[];
  profileId: string;
  hasShift: boolean;
  onOpen: (taskId: string) => void;
}) {
  const t = useTranslations("tasks");
  const mine = tasks.filter((x) => x.assignedProfileId === profileId);
  const others = tasks.filter((x) => x.assignedProfileId !== profileId);
  return (
    <section className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold text-primary">{t("title")}</h1>
      {!hasShift ? <p className="text-lg">{t("noShift")}</p> : null}
      <h2 className="text-lg font-semibold">{t("mine")}</h2>
      {mine.length === 0 && hasShift ? <p className="text-lg">{t("none")}</p> : null}
      <ul className="flex flex-col gap-3">
        {mine.map((task) => (
          <li key={task.id}>
            <TaskCard task={task} records={records} onOpen={() => onOpen(task.id)} />
          </li>
        ))}
      </ul>
      {others.length ? (
        <details>
          <summary className="min-h-14 cursor-pointer py-3 text-lg font-semibold">{t("others")}</summary>
          <ul className="flex flex-col gap-3">
            {others.map((task) => (
              <li key={task.id}>
                <TaskCard task={task} records={records} onOpen={() => onOpen(task.id)} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

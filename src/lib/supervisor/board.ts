import type { Database } from "@/lib/database.types";

type Enums = Database["public"]["Enums"];

export interface BoardTask {
  id: string;
  status: Enums["task_status"];
}

export interface BoardException {
  taskId: string;
  severity: Enums["exception_severity"];
  status: Enums["exception_status"];
}

export type BoardColour = "green" | "amber" | "red" | "none";

export interface BoardState {
  colour: BoardColour;
  label: string;
  openRed: number;
  openAmber: number;
  done: number;
  total: number;
}

const DONE: ReadonlySet<Enums["task_status"]> = new Set(["completed", "verified"]);

/**
 * SPEC F5 colours for a zone (or one piece of equipment):
 * red: open red exceptions, or a task still unfinished after shift end;
 * green: every task finished and nothing open;
 * amber: anything else (not started, in progress, or amber exceptions only).
 * A task sent back for re-clean is replaced by its re-clean task, so it no longer counts.
 */
export function boardState(
  tasks: BoardTask[],
  exceptions: BoardException[],
  shiftEndsAt: string | null,
  now = new Date(),
): BoardState {
  const ids = new Set(tasks.map((t) => t.id));
  const open = exceptions.filter((e) => e.status === "open" && ids.has(e.taskId));
  const openRed = open.filter((e) => e.severity === "red").length;
  const openAmber = open.length - openRed;
  const live = tasks.filter((t) => t.status !== "reclean_required");
  const done = live.filter((t) => DONE.has(t.status)).length;
  const total = live.length;
  const overdue = !!shiftEndsAt && now.getTime() > Date.parse(shiftEndsAt) && done < total;
  const base = { openRed, openAmber, done, total };

  if (openRed > 0) return { ...base, colour: "red", label: "Needs attention" };
  if (overdue) return { ...base, colour: "red", label: "Overdue" };
  if (total === 0) return { ...base, colour: "none", label: "No tasks tonight" };
  if (done === total && openAmber === 0) return { ...base, colour: "green", label: "All clean" };
  if (openAmber > 0) return { ...base, colour: "amber", label: "Check exceptions" };
  const started = live.some((t) => t.status !== "pending");
  return { ...base, colour: "amber", label: started ? "In progress" : "Not started" };
}

export const EXCEPTION_LABELS: Record<Enums["exception_type"], string> = {
  missed_step: "Missed step",
  dwell_short: "Dwell too short",
  atp_fail: "ATP fail",
  reclean: "Re-clean",
  photo_flag: "Photo flag",
  clock_skew: "Device clock off",
  late_sync: "Late sync",
};

/** One line explaining an exception, from its stored detail. */
export function describeException(type: Enums["exception_type"], detail: unknown): string {
  const d = (detail && typeof detail === "object" ? detail : {}) as Record<string, unknown>;
  switch (type) {
    case "atp_fail":
      return `ATP ${d.atp_value ?? "?"} RLU, limit ${d.atp_pass_max ?? "?"}`;
    case "dwell_short":
      return `Waited ${d.actual_seconds ?? "?"} s of ${d.required_seconds ?? "?"} s`;
    case "missed_step":
      return d.reason === "not_finished_by_shift_end"
        ? "Task not finished by shift end"
        : `Step skipped: ${String(d.reason ?? "no reason").replaceAll("_", " ")}`;
    case "clock_skew":
      return `Device clock off by ${Math.round(Math.abs(Number(d.skew_seconds ?? 0)) / 60)} min`;
    default:
      return EXCEPTION_LABELS[type];
  }
}

/** "Jordan Smith" → "J. Smith", as shown on the release line (SPEC F6). */
export function shortName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return full.trim();
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

import { describe, expect, it } from "vitest";

import { boardState, describeException, type BoardException, type BoardTask } from "./board";

const end = "2026-11-25T19:00:00Z";
const during = new Date("2026-11-25T13:00:00Z");
const after = new Date("2026-11-25T20:00:00Z");

const t = (id: string, status: BoardTask["status"]): BoardTask => ({ id, status });
const ex = (
  taskId: string,
  severity: "red" | "amber",
  status: "open" | "resolved" = "open",
): BoardException => ({
  taskId,
  severity,
  status,
});

describe("boardState", () => {
  it("is amber 'Not started' before any records arrive", () => {
    expect(boardState([t("a", "pending"), t("b", "pending")], [], end, during)).toMatchObject({
      colour: "amber",
      label: "Not started",
    });
  });

  it("is amber 'In progress' once a task starts", () => {
    expect(boardState([t("a", "in_progress"), t("b", "pending")], [], end, during).label).toBe("In progress");
  });

  it("is red with an open red exception, even if all tasks are done", () => {
    const s = boardState([t("a", "completed")], [ex("a", "red")], end, during);
    expect(s).toMatchObject({ colour: "red", openRed: 1 });
  });

  it("is amber when only amber exceptions are open", () => {
    expect(boardState([t("a", "completed")], [ex("a", "amber")], end, during)).toMatchObject({
      colour: "amber",
      label: "Check exceptions",
    });
  });

  it("is green when every task is done and nothing is open", () => {
    expect(
      boardState([t("a", "completed"), t("b", "verified")], [ex("a", "red", "resolved")], end, during),
    ).toMatchObject({
      colour: "green",
      done: 2,
      total: 2,
    });
  });

  it("is red 'Overdue' after shift end with unfinished tasks", () => {
    expect(boardState([t("a", "in_progress")], [], end, after)).toMatchObject({
      colour: "red",
      label: "Overdue",
    });
    expect(boardState([t("a", "completed")], [], end, after).colour).toBe("green");
  });

  it("ignores a task sent back for re-clean; its re-clean task counts instead", () => {
    const tasks = [t("old", "reclean_required"), t("new", "pending")];
    expect(boardState(tasks, [], end, during)).toMatchObject({ colour: "amber", total: 1 });
    expect(boardState([t("old", "reclean_required"), t("new", "completed")], [], end, during).colour).toBe(
      "green",
    );
  });

  it("ignores exceptions on tasks outside the zone", () => {
    expect(boardState([t("a", "completed")], [ex("zzz", "red")], end, during).colour).toBe("green");
  });

  it("shows 'No tasks tonight' for an empty zone", () => {
    expect(boardState([], [], end, during).colour).toBe("none");
  });
});

describe("describeException", () => {
  it("explains each kind from its detail", () => {
    expect(describeException("atp_fail", { atp_value: 200, atp_pass_max: 150 })).toBe(
      "ATP 200 RLU, limit 150",
    );
    expect(describeException("dwell_short", { actual_seconds: 2, required_seconds: 10 })).toBe(
      "Waited 2 s of 10 s",
    );
    expect(describeException("missed_step", { reason: "no_chemical" })).toBe("Step skipped: no chemical");
    expect(describeException("missed_step", { reason: "not_finished_by_shift_end" })).toBe(
      "Task not finished by shift end",
    );
    expect(describeException("clock_skew", { skew_seconds: -600 })).toBe("Device clock off by 10 min");
  });
});

import type { Database } from "@/lib/database.types";

type Enums = Database["public"]["Enums"];

export type ExceptionType = Enums["exception_type"];
export type Severity = Enums["exception_severity"];

export interface StepRule {
  step_type: Enums["step_type"];
  dwell_minutes: number | null;
  atp_required: boolean;
  atp_pass_max: number | null;
}

export interface RecordFacts {
  result: Enums["step_result"];
  skip_reason: string | null;
  atp_value: number | null;
  timer_started_at: string | null;
  timer_ended_at: string | null;
}

export interface ExceptionDraft {
  type: ExceptionType;
  severity: Severity;
  detail: Record<string, string | number | null>;
}

/** Steps whose dwell time is a contact time the cleaner must wait out. */
const TIMED_STEPS: ReadonlySet<Enums["step_type"]> = new Set(["dwell", "foam", "sanitise"]);

/** Device clock may differ from the server by up to this much before it's flagged (SPEC 6, rule 4). */
export const CLOCK_SKEW_LIMIT_MS = 5 * 60 * 1000;

/**
 * SPEC F4 rules for one step record. `secondsPerDwellMinute` is 60 normally and 1 when
 * DEMO_FAST_TIMERS shortens timers for the demo.
 */
export function evaluateStepRecord(
  step: StepRule,
  record: RecordFacts,
  secondsPerDwellMinute = 60,
): ExceptionDraft[] {
  const out: ExceptionDraft[] = [];

  if (record.result === "skipped") {
    out.push({ type: "missed_step", severity: "red", detail: { reason: record.skip_reason ?? "skipped" } });
    return out;
  }

  const overLimit =
    record.atp_value !== null && step.atp_pass_max !== null && record.atp_value > step.atp_pass_max;
  if (record.result === "failed" || overLimit) {
    out.push({
      type: "atp_fail",
      severity: "red",
      detail: { atp_value: record.atp_value, atp_pass_max: step.atp_pass_max },
    });
  }

  if (
    step.dwell_minutes &&
    TIMED_STEPS.has(step.step_type) &&
    record.timer_started_at &&
    record.timer_ended_at
  ) {
    const required = step.dwell_minutes * secondsPerDwellMinute;
    const actual = Math.max(
      0,
      (Date.parse(record.timer_ended_at) - Date.parse(record.timer_started_at)) / 1000,
    );
    if (actual < required) {
      out.push({
        type: "dwell_short",
        severity: actual < required / 2 ? "red" : "amber",
        detail: { required_seconds: required, actual_seconds: Math.round(actual) },
      });
    }
  }

  return out;
}

/** The clock_skew exception for a sync batch, if the device clock is off by more than 5 minutes. */
export function clockSkew(deviceTime: string | undefined, serverTime: Date): ExceptionDraft | null {
  if (!deviceTime) return null;
  const skew = Date.parse(deviceTime) - serverTime.getTime();
  if (Number.isNaN(skew) || Math.abs(skew) <= CLOCK_SKEW_LIMIT_MS) return null;
  return {
    type: "clock_skew",
    severity: "amber",
    detail: { skew_seconds: Math.round(skew / 1000), device_time: deviceTime },
  };
}

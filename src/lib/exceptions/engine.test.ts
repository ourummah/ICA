import { describe, expect, it } from "vitest";

import { clockSkew, evaluateStepRecord, type RecordFacts, type StepRule } from "./engine";

const plain: StepRule = { step_type: "rinse", dwell_minutes: null, atp_required: false, atp_pass_max: null };
const dwell: StepRule = { step_type: "dwell", dwell_minutes: 10, atp_required: false, atp_pass_max: null };
const atp: StepRule = { step_type: "atp_check", dwell_minutes: null, atp_required: true, atp_pass_max: 150 };

function rec(overrides: Partial<RecordFacts> = {}): RecordFacts {
  return {
    result: "done",
    skip_reason: null,
    atp_value: null,
    timer_started_at: null,
    timer_ended_at: null,
    ...overrides,
  };
}

function timed(seconds: number): Partial<RecordFacts> {
  const start = Date.parse("2026-11-25T11:00:00Z");
  return {
    timer_started_at: new Date(start).toISOString(),
    timer_ended_at: new Date(start + seconds * 1000).toISOString(),
  };
}

describe("evaluateStepRecord", () => {
  it("raises nothing for a normal step", () => {
    expect(evaluateStepRecord(plain, rec())).toEqual([]);
  });

  it("raises a red missed_step for a skipped step, with the reason", () => {
    expect(evaluateStepRecord(plain, rec({ result: "skipped", skip_reason: "no_chemical" }))).toEqual([
      { type: "missed_step", severity: "red", detail: { reason: "no_chemical" } },
    ]);
  });

  it("raises a red atp_fail when the reading is over the limit", () => {
    const [ex] = evaluateStepRecord(atp, rec({ result: "failed", atp_value: 200 }));
    expect(ex).toMatchObject({
      type: "atp_fail",
      severity: "red",
      detail: { atp_value: 200, atp_pass_max: 150 },
    });
    // Over the limit is a fail even if the device said done.
    expect(evaluateStepRecord(atp, rec({ atp_value: 151 }))[0]?.type).toBe("atp_fail");
    expect(evaluateStepRecord(atp, rec({ atp_value: 150 }))).toEqual([]);
  });

  it("raises dwell_short: amber when short, red when under half", () => {
    expect(evaluateStepRecord(dwell, rec(timed(600)))).toEqual([]);
    expect(evaluateStepRecord(dwell, rec(timed(400)))[0]).toMatchObject({
      type: "dwell_short",
      severity: "amber",
    });
    expect(evaluateStepRecord(dwell, rec(timed(200)))[0]).toMatchObject({
      type: "dwell_short",
      severity: "red",
      detail: { required_seconds: 600, actual_seconds: 200 },
    });
  });

  it("scales dwell to seconds in demo fast-timer mode", () => {
    expect(evaluateStepRecord(dwell, rec(timed(10)), 1)).toEqual([]);
    expect(evaluateStepRecord(dwell, rec(timed(2)), 1)[0]?.severity).toBe("red");
  });

  it("ignores dwell when the step has no timer or no times were recorded", () => {
    expect(evaluateStepRecord(dwell, rec())).toEqual([]);
    expect(evaluateStepRecord({ ...plain, dwell_minutes: 5 }, rec(timed(1)))).toEqual([]);
  });
});

describe("clockSkew", () => {
  const server = new Date("2026-11-25T12:00:00Z");
  it("allows up to 5 minutes either way", () => {
    expect(clockSkew("2026-11-25T12:05:00Z", server)).toBeNull();
    expect(clockSkew("2026-11-25T11:55:00Z", server)).toBeNull();
    expect(clockSkew(undefined, server)).toBeNull();
  });
  it("flags an amber clock_skew beyond 5 minutes", () => {
    expect(clockSkew("2026-11-25T11:50:00Z", server)).toMatchObject({
      type: "clock_skew",
      severity: "amber",
      detail: { skew_seconds: -600 },
    });
  });
});

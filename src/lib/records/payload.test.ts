import { describe, expect, it } from "vitest";

import { canonicalJson, payloadHash, sha256Hex, type StepRecordPayload } from "./payload";

const payload: StepRecordPayload = {
  client_record_id: "6f1c8e1e-6a0e-4b8e-9a59-0d8f4b6a1c01",
  task_id: "6f1c8e1e-6a0e-4b8e-9a59-0d8f4b6a1c02",
  ssop_step_id: "6f1c8e1e-6a0e-4b8e-9a59-0d8f4b6a1c03",
  profile_id: "6f1c8e1e-6a0e-4b8e-9a59-0d8f4b6a1c04",
  result: "done",
  skip_reason: null,
  note_original: "Malinis na",
  note_language: "tl",
  atp_value: 210,
  timer_started_at: null,
  timer_ended_at: null,
  device_started_at: "2026-11-25T12:00:00.000Z",
  device_completed_at: "2026-11-25T12:01:00.000Z",
  supersedes_client_record_id: null,
};

describe("canonicalJson", () => {
  it("sorts keys at every level and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: undefined } })).toBe(
      '{"a":{"d":[2,{"y":2,"z":1}]},"b":1}',
    );
  });
});

describe("payloadHash", () => {
  it("is the same regardless of key order", async () => {
    const reversed = Object.fromEntries(Object.entries(payload).reverse()) as StepRecordPayload;
    expect(await payloadHash(reversed)).toBe(await payloadHash(payload));
  });

  it("changes when any field changes", async () => {
    expect(await payloadHash({ ...payload, atp_value: 120 })).not.toBe(await payloadHash(payload));
  });

  it("matches a known SHA-256", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

// @vitest-environment node
import canonicalize from "canonicalize";
import { describe, expect, it } from "vitest";

import { jcs as standaloneJcs } from "../../../verifier/verify-ica.mjs";

import { jcs, sha256Hex } from "./canonical";
import { buildContent, buildRecord, contentHash, currentItems, recordHash, type TaskSource } from "./record";

const STEP_A = "00000000-0000-4000-8000-00000000000a";
const STEP_B = "00000000-0000-4000-8000-00000000000b";

function source(): TaskSource {
  return {
    task: {
      task_id: "11111111-1111-4111-8111-111111111111",
      site_id: "22222222-2222-4222-8222-222222222222",
      shift_id: "33333333-3333-4333-8333-333333333333",
      shift_date: "2026-11-24",
      zone_id: "44444444-4444-4444-8444-444444444444",
      equipment_id: "55555555-5555-4555-8555-555555555555",
      ssop_id: "66666666-6666-4666-8666-666666666666",
      ssop_version: 3,
      assigned_profile_id: "77777777-7777-4777-8777-777777777777",
      status: "completed",
      reclean_of_task_id: null,
    },
    steps: [
      {
        id: STEP_B,
        step_no: 2,
        step_type: "atp_check",
        atp_pass_max: 150,
        chemical_id: null,
        chemical_name: null,
        dilution: null,
      },
      {
        id: STEP_A,
        step_no: 1,
        step_type: "foam",
        atp_pass_max: null,
        chemical_id: "88888888-8888-4888-8888-888888888888",
        chemical_name: "AlkaFoam 300 (Demo)",
        dilution: "3%",
      },
    ],
    records: [
      {
        id: "99999999-9999-4999-8999-99999999999b",
        ssop_step_id: STEP_B,
        profile_id: "77777777-7777-4777-8777-777777777777",
        device_id: null,
        result: "failed",
        skip_reason: null,
        note_original: "Malinis na — ñ 🧽",
        note_language: "tl",
        atp_value: 320,
        timer_started_at: null,
        timer_ended_at: null,
        device_started_at: "2026-11-24T22:10:00+11:00",
        device_completed_at: "2026-11-24T22:12:00+11:00",
        server_received_at: "2026-11-24T11:12:03.123456+00:00",
        payload_hash: "c".repeat(64),
        chain_hash: "d".repeat(64),
        supersedes_id: null,
        photo_sha256: null,
        photo_hashes: [],
      },
      {
        id: "99999999-9999-4999-8999-99999999999a",
        ssop_step_id: STEP_A,
        profile_id: "77777777-7777-4777-8777-777777777777",
        device_id: null,
        result: "done",
        skip_reason: null,
        note_original: null,
        note_language: null,
        atp_value: null,
        timer_started_at: "2026-11-24T11:00:00Z",
        timer_ended_at: "2026-11-24T11:15:00Z",
        device_started_at: "2026-11-24T10:59:00Z",
        device_completed_at: "2026-11-24T11:16:00Z",
        server_received_at: "2026-11-24T11:16:02Z",
        payload_hash: "e".repeat(64),
        chain_hash: "f".repeat(64),
        supersedes_id: null,
        photo_sha256: "a".repeat(64),
        photo_hashes: ["a".repeat(64), "b".repeat(64)],
      },
    ],
  };
}

const FIXED = {
  siteId: source().task.site_id,
  recordId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  nonce: "0".repeat(64),
};

function record(src = source()) {
  return buildRecord({
    content: buildContent(src),
    ...FIXED,
    prevSiteRecordHash: null,
    amendsRecordHash: null,
    sealedAt: new Date("2026-11-24T12:00:00Z"),
  });
}

/** Deep copy with object keys in reverse order at every level. */
function reverseKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(reverseKeys);
  if (v && typeof v === "object")
    return Object.fromEntries(
      Object.keys(v)
        .reverse()
        .map((k) => [k, reverseKeys((v as Record<string, unknown>)[k])]),
    );
  return v;
}

describe("canonical record hashing", () => {
  it("gives the same hash whatever the key order", () => {
    const r = record();
    expect(jcs(reverseKeys(r))).toBe(jcs(r));
    expect(recordHash(reverseKeys(r))).toBe(recordHash(r));
  });

  it("gives the same hash whatever order the rows arrive in", () => {
    const shuffled = source();
    shuffled.records.reverse();
    shuffled.steps.reverse();
    expect(recordHash(record(shuffled))).toBe(recordHash(record()));
  });

  it("matches a fixed hash, so a Node or library upgrade can't change it silently", () => {
    expect(recordHash(record())).toMatchInlineSnapshot(
      `"6add126698e43c06db7210c72b0dbc24099f894795a1a3be4ecb6ee80bec4144"`,
    );
  });

  it("is the same JCS as the canonicalize package and the standalone verifier", () => {
    const r = record();
    expect(jcs(r)).toBe(canonicalize(r));
    expect(standaloneJcs(r)).toBe(jcs(r));
    const tricky = { b: [1, -0, 1e21, 0.1, ' \u0007"\\'], a: { é: null, e: true, "": "x", "😀": 1 } };
    expect(standaloneJcs(tricky)).toBe(canonicalize(tricky));
  });

  it("matches the RFC 8785 key ordering example", () => {
    // Keys sort by UTF-16 code units, so "€" (euro) sorts before "😀".
    expect(jcs({ "😀": 1, "€": 2, "1": 3, "\r": 4 })).toBe('{"\\r":4,"1":3,"€":2,"😀":1}');
  });

  it("changes when any single character of the record changes", () => {
    const text = jcs(record());
    const base = sha256Hex(text);
    for (const i of [10, Math.floor(text.length / 2), text.length - 3]) {
      const changed = text.slice(0, i) + (text[i] === "a" ? "b" : "a") + text.slice(i + 1);
      expect(sha256Hex(changed)).not.toBe(base);
    }
  });

  it("commits to photo hashes, so one changed photo byte no longer matches", () => {
    const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const src = source();
    src.records[1].photo_sha256 = sha256Hex(photo);
    src.records[1].photo_hashes = [sha256Hex(photo)];
    const sealed = record(src);
    const hashes = sealed.items.flatMap((i) => i.photo_hashes);
    expect(hashes).toContain(sha256Hex(photo));
    const tampered = photo.slice();
    tampered[6] ^= 1;
    expect(hashes).not.toContain(sha256Hex(tampered));
  });
});

describe("record content", () => {
  it("orders items by step and stores UTC times", () => {
    const c = buildContent(source());
    expect(c.items.map((i) => i.step_no)).toEqual([1, 2]);
    expect(c.items[1].device_started_at).toBe("2026-11-24T11:10:00.000Z");
    expect(c.started_at_device).toBe("2026-11-24T10:59:00.000Z");
    expect(c.received_at_server).toBe("2026-11-24T11:16:02.000Z");
    expect(c.items[0].photo_hashes).toEqual(["a".repeat(64), "b".repeat(64)]);
    expect(c.chemicals).toEqual([
      {
        step_no: 1,
        chemical_id: "88888888-8888-4888-8888-888888888888",
        product: "AlkaFoam 300 (Demo)",
        dilution: "3%",
      },
    ]);
  });

  it("holds ids, not names", () => {
    const text = jcs(record());
    expect(text).not.toMatch(/display_name|Southern Cross|email/);
  });

  it("the content hash ignores the seal metadata but not the clean", () => {
    const a = buildContent(source());
    expect(contentHash(a)).toBe(contentHash(buildContent(source())));
    const changed = source();
    changed.records[0].atp_value = 100;
    expect(contentHash(buildContent(changed))).not.toBe(contentHash(a));
  });

  it("an amendment references the record it corrects", () => {
    const r = buildRecord({
      content: buildContent(source()),
      ...FIXED,
      prevSiteRecordHash: "1".repeat(64),
      amendsRecordHash: "2".repeat(64),
      sealedAt: new Date(),
    });
    expect(r.record_type).toBe("amendment");
    expect(r.amends_record_hash).toBe("2".repeat(64));
  });

  it("each seal gets a fresh 32-byte nonce", () => {
    const opts = {
      content: buildContent(source()),
      siteId: FIXED.siteId,
      recordId: FIXED.recordId,
      prevSiteRecordHash: null,
      amendsRecordHash: null,
      sealedAt: new Date(0),
    };
    const a = buildRecord(opts);
    const b = buildRecord(opts);
    expect(a.nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(a.nonce).not.toBe(b.nonce);
  });

  it("currentItems drops superseded results", () => {
    const c = buildContent(source());
    const fix = {
      ...c.items[1],
      step_record_id: "fix",
      result: "done" as const,
      supersedes_step_record_id: c.items[1].step_record_id,
    };
    expect(currentItems([...c.items, fix]).map((i) => i.step_record_id)).toEqual([
      c.items[0].step_record_id,
      "fix",
    ]);
  });
});

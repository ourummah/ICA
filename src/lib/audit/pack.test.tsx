// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";

import { csvField, packToCsv } from "./csv";
import { packFileName, parsePackFilter } from "./filter";
import { AuditPackDocument } from "./pdf";
import type { AuditPack } from "./types";

const photo = readFileSync(path.join(import.meta.dirname, "../../../e2e/fixtures/test-photo.png"));

function samplePack(records = 10): AuditPack {
  return {
    site: { id: "s1", name: "Riverbend Plant (Demo)", timezone: "Australia/Sydney" },
    filter: { from: "2026-11-25", to: "2026-11-25", zoneIds: null },
    zoneNames: ["Boning Room"],
    generatedAt: "2026-11-25T19:30:00Z",
    generatedBy: "Jordan Smith",
    shifts: [
      {
        id: "sh1",
        shiftDate: "2026-11-25",
        startsAt: "2026-11-25T11:00:00Z",
        endsAt: "2026-11-25T19:00:00Z",
      },
    ],
    zones: [{ id: "z1", name: "Boning Room", sortOrder: 1 }],
    tasks: [
      {
        id: "t1",
        shiftId: "sh1",
        shiftDate: "2026-11-25",
        zoneId: "z1",
        zoneName: "Boning Room",
        zoneOrder: 1,
        equipmentName: "Conveyor belt — Boning Room Line 1",
        ssopVersion: 1,
        stepCount: records,
        status: "completed",
        assignedName: "Maria Santos",
        recleanOfTaskId: null,
        records: Array.from({ length: records }, (_, i) => ({
          id: `r${i}`,
          stepNo: i + 1,
          stepTitle: i === 9 ? "ATP swab" : `Step ${i + 1}`,
          result: i === 9 ? ("failed" as const) : ("done" as const),
          skipReason: null,
          cleaner: "Maria Santos",
          deviceCompletedAt: "2026-11-25T12:00:00Z",
          serverReceivedAt: "2026-11-25T12:20:00Z",
          atpValue: i === 9 ? 200 : null,
          atpLimit: i === 9 ? 150 : null,
          timerSeconds: i === 4 ? 3 : null,
          noteOriginal: i === 2 ? 'Walang tubig sa hose 2, "ginamit" ang hose 3' : null,
          noteLanguage: i === 2 ? "tl" : null,
          noteEn: i === 2 ? "No water in hose 2, used hose 3" : null,
          noteEnSource: i === 2 ? ("ai" as const) : null,
          photos:
            i === 0 ? [{ path: "p.png", sha256: "ab".repeat(32), data: photo, format: "png" as const }] : [],
          payloadHash: "c".repeat(64),
          chainHash: "d".repeat(64),
          supersedesId: null,
        })),
      },
    ],
    exceptions: [
      {
        id: "e1",
        taskId: "t1",
        stepRecordId: "r9",
        type: "atp_fail",
        severity: "red",
        status: "resolved",
        detail: { atp_value: 200, atp_pass_max: 150 },
        createdAt: "2026-11-25T12:20:00Z",
        resolutionNote: "Re-clean requested: ATP over limit",
        resolvedAt: "2026-11-25T12:30:00Z",
        resolvedBy: "Tom Nguyen",
      },
    ],
    preops: [
      {
        zoneId: "z1",
        shiftId: "sh1",
        result: "pass",
        completedAt: "2026-11-25T18:30:00Z",
        inspector: "Jordan Smith",
        items: [],
      },
    ],
    releases: [
      {
        zoneId: "z1",
        shiftId: "sh1",
        decision: "released",
        reason: null,
        override: false,
        decidedAt: "2026-11-25T18:42:00Z",
        by: "Jordan Smith",
      },
    ],
    chain: { records: 1284, breaks: 0, firstBreakSeq: null, verified: true },
  };
}

describe("csv", () => {
  it("quotes and escapes fields, and neutralises spreadsheet formulas", () => {
    expect(csvField('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvField("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvField(-5)).toBe("-5");
    expect(csvField(null)).toBe("");
  });

  it("writes one row per step record with a header", () => {
    const lines = packToCsv(samplePack()).trimEnd().split("\r\n");
    expect(lines).toHaveLength(11);
    expect(lines[0].split(",")).toContain("note_en_source");
    expect(lines[3]).toContain('"Walang tubig sa hose 2, ""ginamit"" ang hose 3"');
    expect(lines[3]).toContain(",ai,");
    expect(lines[10]).toContain(",failed,");
  });
});

describe("filter", () => {
  it("parses dates and zones, and rejects bad ranges", () => {
    const ok = parsePackFilter(new URLSearchParams("from=2026-11-20&to=2026-11-25"));
    expect(ok).toEqual({ ok: true, filter: { from: "2026-11-20", to: "2026-11-25", zoneIds: null } });
    expect(parsePackFilter(new URLSearchParams("from=2026-11-26&to=2026-11-25")).ok).toBe(false);
    expect(parsePackFilter(new URLSearchParams("from=2026-01-01&to=2026-11-25")).ok).toBe(false);
    expect(parsePackFilter(new URLSearchParams("from=x&to=2026-11-25")).ok).toBe(false);
  });

  it("names the file after the site and period", () => {
    expect(
      packFileName("Riverbend Plant (Demo)", { from: "2026-11-25", to: "2026-11-25", zoneIds: null }, "pdf"),
    ).toBe("audit-pack-riverbend-plant-demo-2026-11-25.pdf");
  });
});

describe("pdf", () => {
  it("renders a pack with a photo thumbnail quickly", async () => {
    const started = Date.now();
    const pdf = await renderToBuffer(<AuditPackDocument pack={samplePack()} />);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(5000);
    expect(Date.now() - started).toBeLessThan(15_000);
  });

  it("renders each task's seal with a QR code to its verify page", async () => {
    const pack = samplePack();
    const verifyUrl = "https://ica.example/verify/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    pack.tasks[0].seal = {
      recordId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      recordHash: "ab".repeat(32),
      versions: 2,
      anchoredAt: "2026-11-26T03:15:00Z",
      verifyUrl,
      qrPng: await QRCode.toBuffer(verifyUrl, { margin: 1, width: 120 }),
    };
    pack.seals = { sealed: 1, anchored: 1, chain: { records: 4, verified: true } };
    const plain = await renderToBuffer(<AuditPackDocument pack={samplePack()} />);
    const pdf = await renderToBuffer(<AuditPackDocument pack={pack} />);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(plain.length);
  });

  it("renders a failed integrity check and an empty period", async () => {
    const pack = { ...samplePack(0), tasks: [], exceptions: [], preops: [], releases: [] };
    pack.chain = { records: 10, breaks: 2, firstBreakSeq: 7, verified: false };
    const pdf = await renderToBuffer(<AuditPackDocument pack={pack} />);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});

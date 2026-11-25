import { describe, expect, it } from "vitest";

import { parseCsv, parseSsopCsv, SSOP_CSV_TEMPLATE } from "./csv";

const chemicals = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Alkaline foam" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Quat sanitiser" },
];

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, CRLF and blank lines", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n\r\n1,2,3\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });
});

describe("parseSsopCsv", () => {
  it("parses the downloadable template into 9 valid steps", () => {
    const { steps, errors } = parseSsopCsv(SSOP_CSV_TEMPLATE, chemicals);
    expect(errors).toEqual([]);
    expect(steps).toHaveLength(9);
    expect(steps[3]).toMatchObject({
      step_type: "foam",
      chemical_id: chemicals[0].id,
      photo_required: true,
      icon: "spray-can",
    });
    expect(steps[4].dwell_minutes).toBe(10);
    expect(steps[8]).toMatchObject({ atp_required: true, atp_pass_max: 150 });
  });

  it("reports every bad row with its row number", () => {
    const csv = [
      "step_type,title,instructions,chemical,dilution,dwell_minutes,photo_required,atp_required,atp_pass_max",
      "mop,Mop,,,,,,,",
      "foam,Foam,,Mystery foam,,,,,",
      "atp_check,Swab,,,,,,yes,",
      "rinse,,,,,,,,",
    ].join("\n");
    const { steps, errors } = parseSsopCsv(csv, chemicals);
    expect(steps).toEqual([]);
    expect(errors).toEqual([
      'Row 2: unknown step type "mop".',
      'Row 3: chemical "Mystery foam" is not set up for this site.',
      "Row 4: ATP pass limit is required when ATP is required.",
      "Row 5: Title is required.",
    ]);
  });

  it("rejects a file without the template columns", () => {
    expect(parseSsopCsv("step,name\nfoam,Foam", chemicals).errors[0]).toMatch(/Missing column/);
  });
});

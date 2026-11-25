import { ssopStepSchema, type SsopStepInput } from "./step-schema";
import { STEP_TYPES } from "./step-types";

export const SSOP_CSV_COLUMNS = [
  "step_type",
  "title",
  "instructions",
  "chemical",
  "dilution",
  "dwell_minutes",
  "photo_required",
  "atp_required",
  "atp_pass_max",
] as const;

export const SSOP_CSV_TEMPLATE = [
  SSOP_CSV_COLUMNS.join(","),
  'prepare_isolate,Isolate and lock out,"Stop, isolate and lock out. Remove product.",,,,yes,,',
  "dry_clean,Dry clean,Remove all scraps. No water yet.,,,,,,",
  "pre_rinse,Pre-rinse,Rinse top to bottom with warm water at low pressure.,,,,,,",
  "foam,Apply foam,Foam all surfaces bottom to top.,Alkaline foam,Per label,,yes,,",
  "dwell,Let foam work,Leave foam on. Do not let it dry.,,,10,,,",
  "rinse,Rinse,Rinse top to bottom until no foam remains.,,,,,,",
  "inspect,Inspect,Check with a torch for residue.,,,,yes,,",
  "sanitise,Sanitise,Apply sanitiser at label strength.,Quat sanitiser,Per label,,,,",
  "atp_check,ATP swab,Swab the food-contact surface and enter the reading.,,,,,yes,150",
].join("\n");

/** Minimal RFC 4180 parser: commas, quoted fields, doubled quotes, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

export interface CsvImportResult {
  steps: (SsopStepInput & { icon: string })[];
  errors: string[];
}

/**
 * Turns a CSV file into validated SSOP steps. Chemicals are matched by name (case-insensitive)
 * against the site's chemicals. Returns every problem found, with row numbers, instead of stopping
 * at the first one.
 */
export function parseSsopCsv(text: string, chemicals: { id: string; name: string }[]): CsvImportResult {
  const rows = parseCsv(text);
  const errors: string[] = [];
  if (rows.length === 0) return { steps: [], errors: ["The file is empty."] };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = SSOP_CSV_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) return { steps: [], errors: [`Missing column(s): ${missing.join(", ")}.`] };
  if (rows.length === 1) return { steps: [], errors: ["The file has a header but no steps."] };
  if (rows.length > 101) return { steps: [], errors: ["An SSOP can have at most 100 steps."] };

  const col = (r: string[], name: (typeof SSOP_CSV_COLUMNS)[number]) =>
    (r[header.indexOf(name)] ?? "").trim();
  const byName = new Map(chemicals.map((c) => [c.name.trim().toLowerCase(), c.id]));

  const steps: CsvImportResult["steps"] = [];
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    const chemicalName = col(r, "chemical");
    const chemicalId = chemicalName ? byName.get(chemicalName.toLowerCase()) : null;
    if (chemicalName && !chemicalId) {
      errors.push(`Row ${line}: chemical "${chemicalName}" is not set up for this site.`);
      return;
    }
    const parsed = ssopStepSchema.safeParse({
      step_type: col(r, "step_type").toLowerCase(),
      title_en: col(r, "title"),
      instructions_en: col(r, "instructions"),
      chemical_id: chemicalId ?? null,
      dilution: col(r, "dilution"),
      dwell_minutes: col(r, "dwell_minutes"),
      photo_required: col(r, "photo_required").toLowerCase(),
      atp_required: col(r, "atp_required").toLowerCase(),
      atp_pass_max: col(r, "atp_pass_max"),
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path.join(".") || "row";
        errors.push(
          `Row ${line}: ${field === "step_type" ? `unknown step type "${col(r, "step_type")}"` : issue.message}.`,
        );
      }
      return;
    }
    steps.push({ ...parsed.data, icon: STEP_TYPES[parsed.data.step_type].icon });
  });
  return { steps, errors };
}

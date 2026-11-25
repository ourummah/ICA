import { z } from "zod";

import type { PackFilter } from "./types";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-11-25");
const MAX_DAYS = 93;

const filterSchema = z
  .object({
    from: date,
    to: date,
    zones: z.array(z.uuid()).default([]),
  })
  .refine((f) => f.from <= f.to, { message: "The start date must be on or before the end date." })
  .refine((f) => (Date.parse(f.to) - Date.parse(f.from)) / 86_400_000 <= MAX_DAYS, {
    message: `Choose a period of at most ${MAX_DAYS} days.`,
  });

/** Reads ?from=&to=&zones=a&zones=b. No zones means all zones. */
export function parsePackFilter(
  params: URLSearchParams,
): { ok: true; filter: PackFilter } | { ok: false; error: string } {
  const parsed = filterSchema.safeParse({
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    zones: params.getAll("zones").filter(Boolean),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join(" ") };
  const { from, to, zones } = parsed.data;
  return { ok: true, filter: { from, to, zoneIds: zones.length ? zones : null } };
}

export function packFileName(siteName: string, filter: PackFilter, ext: "pdf" | "csv"): string {
  const slug = siteName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `audit-pack-${slug}-${filter.from}${filter.to === filter.from ? "" : `-to-${filter.to}`}.${ext}`;
}

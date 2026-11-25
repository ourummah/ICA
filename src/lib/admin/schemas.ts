import { z } from "zod";

const name = z.string().trim().min(1, "Name is required").max(120);
const id = z.uuid();

export const zoneSchema = z.object({
  name,
  risk_level: z.enum(["high", "medium", "low"]),
  sort_order: z.coerce.number().int().min(0).max(999).default(0),
});

export const chemicalSchema = z.object({
  name,
  type: z.enum(["alkaline", "acid", "chlorinated", "sanitiser", "other"]),
  default_dilution: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((v) => v || null),
  sds_url: z
    .union([z.literal(""), z.url().max(500)])
    .optional()
    .transform((v) => v || null),
});

export const equipmentSchema = z.object({
  name,
  zone_id: id,
  teardown_notes: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => v || null),
});

export const pinSchema = z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits");

export const cleanerSchema = z.object({
  display_name: name,
  preferred_language: z.enum(["en", "tl", "id"]),
  pin: pinSchema,
});

export const staffSchema = z.object({
  display_name: name,
  email: z.email().max(254),
  role: z.enum(["supervisor", "qa", "site_admin"]),
  password: z.string().min(10, "Temporary password must be at least 10 characters").max(200),
});

export const deviceLabelSchema = z.object({ label: z.string().trim().min(1).max(80) });

export const assignTaskSchema = z.object({
  equipment_id: id,
  assigned_profile_id: z.preprocess((v) => (v === "" ? null : v), id.nullable()),
});

export const idSchema = id;

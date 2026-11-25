import { z } from "zod";

import { STEP_TYPE_VALUES } from "./step-types";

const optionalInt = (max: number) =>
  z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : v),
    z.coerce.number().int().min(0).max(max).nullable(),
  );

const checkbox = z.preprocess(
  (v) => v === true || v === "on" || v === "true" || v === "yes" || v === "1",
  z.boolean(),
);

/** One SSOP step as entered in the builder or a CSV row. */
export const ssopStepSchema = z
  .object({
    step_type: z.enum(STEP_TYPE_VALUES),
    title_en: z.string().trim().min(1, "Title is required").max(80),
    instructions_en: z.string().trim().max(1000).default(""),
    chemical_id: z.preprocess((v) => (v === "" ? null : v), z.uuid().nullable()).default(null),
    dilution: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(80).nullable()).default(null),
    dwell_minutes: optionalInt(600).default(null),
    photo_required: checkbox.default(false),
    atp_required: checkbox.default(false),
    atp_pass_max: optionalInt(100000).default(null),
  })
  .refine((s) => !s.atp_required || s.atp_pass_max !== null, {
    message: "ATP pass limit is required when ATP is required",
    path: ["atp_pass_max"],
  })
  .refine((s) => s.dwell_minutes === null || s.dwell_minutes > 0, {
    message: "Dwell minutes must be more than 0",
    path: ["dwell_minutes"],
  });

export type SsopStepInput = z.infer<typeof ssopStepSchema>;

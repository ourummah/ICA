import { z } from "zod";

export const staffSignInSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(8).max(200),
  next: z
    .string()
    .regex(/^\/app(\/[\w\-/]*)?$/)
    .optional()
    .catch(undefined),
});

export type StaffSignInInput = z.infer<typeof staffSignInSchema>;

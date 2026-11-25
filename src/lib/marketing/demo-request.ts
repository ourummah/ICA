import { z } from "zod";

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

/** The website's "Book a demo" form (SPEC F9). `website` is a honeypot that people never see. */
export const demoRequestSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(120),
  company: optional(160),
  email: z.email("Please enter a valid email").max(254),
  phone: optional(40),
  message: optional(2000),
  website: z.string().max(200).optional(),
});

export interface DemoRequestInput {
  name: string;
  email: string;
  company?: string;
  phone?: string;
  message?: string;
}

/** The first address in X-Forwarded-For (set by Vercel), for rate limiting only. */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

export function notificationText(r: DemoRequestInput): string {
  return [
    "New demo request from the ICA website",
    "",
    `Name: ${r.name}`,
    `Company: ${r.company ?? "-"}`,
    `Email: ${r.email}`,
    `Phone: ${r.phone ?? "-"}`,
    "",
    r.message ?? "(no message)",
  ].join("\n");
}

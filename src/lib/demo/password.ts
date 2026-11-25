import "server-only";

export const LOCAL_DEMO_PASSWORD = "ica-demo-local";

/** The demo staff password: DEMO_STAFF_PASSWORD, or the local default against a local Supabase only. */
export function demoStaffPassword(): string | undefined {
  const fromEnv = process.env.DEMO_STAFF_PASSWORD;
  if (fromEnv && fromEnv.length >= 8) return fromEnv;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url) ? LOCAL_DEMO_PASSWORD : undefined;
}

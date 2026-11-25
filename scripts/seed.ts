/**
 * Loads the demo tenant. Usage: `npm run seed` (reads .env.local if present).
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Against a non-local Supabase
 * project, DEMO_STAFF_PASSWORD must also be set.
 */
import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/lib/database.types.ts";
import { demoCleaners, demoStaff, seedDemo } from "../src/lib/demo/seed.ts";

const LOCAL_DEFAULT_PASSWORD = "ica-demo-local";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (for example in .env.local).");
  process.exit(1);
}

const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(url);
const staffPassword = process.env.DEMO_STAFF_PASSWORD ?? (isLocal ? LOCAL_DEFAULT_PASSWORD : undefined);
if (!staffPassword || staffPassword.length < 8) {
  console.error("Set DEMO_STAFF_PASSWORD (8+ characters) when seeding a hosted Supabase project.");
  process.exit(1);
}

const admin = createClient<Database>(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const result = await seedDemo(admin, { staffPassword });

console.log(`Seeded Southern Cross Meats (Demo): ${result.taskCount} tasks on tonight's shift.`);
console.log("Staff sign-in (password from DEMO_STAFF_PASSWORD, or the local default):");
for (const s of demoStaff) console.log(`  ${s.role.padEnd(12)} ${s.email}`);
console.log("Cleaner PINs:");
for (const c of demoCleaners) console.log(`  ${c.name.padEnd(16)} ${c.pin}`);

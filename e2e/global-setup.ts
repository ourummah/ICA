import { createClient } from "@supabase/supabase-js";

import type { Database } from "../src/lib/database.types";
import { seedDemo } from "../src/lib/demo/seed";

/** Resets the demo tenant before the e2e run so tests start from known data. */
export default async function globalSetup() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  const admin = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await seedDemo(admin, { staffPassword: process.env.DEMO_STAFF_PASSWORD ?? "ica-demo-local" });
}

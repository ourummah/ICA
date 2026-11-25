import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { sealPendingRecords } from "./seal";

/** Seals a site's finished cleans after a sync. Errors are logged; the nightly job retries. */
export async function sealInBackground(siteId: string): Promise<void> {
  try {
    await sealPendingRecords(createAdminClient(), { siteId, limit: 50 });
  } catch (e) {
    console.error("background sealing failed", e instanceof Error ? e.message : e);
  }
}

import "server-only";

import { createClient } from "@/lib/supabase/server";

export interface DeviceContext {
  supabase: Awaited<ReturnType<typeof createClient>>;
  device: { id: string; siteId: string; label: string; siteName: string; timezone: string };
}

/** The registered device behind this request, or null if the caller isn't one. */
export async function getDevice(): Promise<DeviceContext | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_device");
  const row = data?.[0];
  if (!row) return null;
  return {
    supabase,
    device: {
      id: row.device_id,
      siteId: row.site_id,
      label: row.label,
      siteName: row.site_name,
      timezone: row.site_timezone,
    },
  };
}

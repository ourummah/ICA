"use server";

import { randomBytes, randomUUID } from "node:crypto";

import { redirect } from "next/navigation";
import { z } from "zod";

import type { ActionState } from "@/lib/admin/action-result";
import { requireSiteAdmin } from "@/lib/admin/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const labelSchema = z.string().trim().min(1, "Give the device a name, e.g. Boning Room phone").max(80);

/**
 * Registers the browser this runs in as a shared cleaner device for the admin's site. The device
 * gets its own auth user with a random password, and the browser is signed in as it (the admin's
 * own session on this browser ends).
 */
export async function registerThisDevice(_: ActionState, fd: FormData): Promise<ActionState> {
  const { site, profileId } = await requireSiteAdmin();
  const label = labelSchema.safeParse(fd.get("label"));
  if (!label.success) return { errors: label.error.issues.map((i) => i.message) };

  const admin = createAdminClient();
  const deviceId = randomUUID();
  const email = `device-${deviceId}@devices.ica.invalid`;
  const password = randomBytes(24).toString("base64url");
  const { data: user, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { kind: "device", site_id: site.id },
  });
  if (error || !user.user) return { errors: [error?.message ?? "Could not create the device."] };

  const { error: insertErr } = await admin.from("devices").insert({
    id: deviceId,
    site_id: site.id,
    label: label.data,
    auth_user_id: user.user.id,
    registered_by: profileId,
  });
  if (insertErr) {
    await admin.auth.admin.deleteUser(user.user.id);
    return { errors: [insertErr.message] };
  }

  // Sign out on this browser only: the admin stays signed in on their laptop.
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signInErr) return { errors: [signInErr.message] };

  redirect("/app/cleaner");
}

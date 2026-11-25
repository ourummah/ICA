"use server";

import { redirect } from "next/navigation";

import type { ActionState } from "@/lib/admin/action-result";
import { requireSiteAdmin } from "@/lib/admin/context";
import { demoStaffPassword } from "@/lib/demo/password";
import { seedDemo } from "@/lib/demo/seed";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * SPEC F10 "Reset demo": wipes the demo tenant and seeds it again with tonight's shift. Only for a
 * site admin of a demo organisation (is_demo), and only after typing RESET. Every demo account is
 * recreated, so everyone (including the caller) is signed out and phones must be registered again.
 */
export async function resetDemoTenant(_: ActionState, fd: FormData): Promise<ActionState> {
  const { site } = await requireSiteAdmin();
  if (String(fd.get("confirm") ?? "").trim() !== "RESET") return { errors: ["Type RESET to confirm."] };

  const admin = createAdminClient();
  const { data: org } = await admin.from("organisations").select("is_demo").eq("id", site.orgId).single();
  if (!org?.is_demo) return { errors: ["Only the demo organisation can be reset."] };

  const staffPassword = demoStaffPassword();
  if (!staffPassword) return { errors: ["DEMO_STAFF_PASSWORD is not set on the server."] };

  try {
    await seedDemo(admin, { staffPassword });
  } catch (e) {
    console.error("demo reset failed", e instanceof Error ? e.message : e);
    return { errors: ["The reset failed part-way. Try again; it starts from scratch each time."] };
  }
  redirect("/app/login?reset=1");
}

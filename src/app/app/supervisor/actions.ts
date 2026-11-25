"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSiteRole } from "@/lib/admin/context";
import { friendlyDbError, type ActionState } from "@/lib/admin/action-result";

const resolveSchema = z.object({
  exceptionId: z.uuid(),
  note: z.string().trim().min(1, "Add a note saying how it was resolved.").max(1000),
});

const recleanSchema = z.object({
  taskId: z.uuid(),
  note: z.string().trim().min(1, "Say why the re-clean is needed.").max(1000),
});

function issues(error: z.ZodError): ActionState {
  return { errors: error.issues.map((i) => i.message) };
}

export async function resolveException(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = resolveSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return issues(parsed.error);
  const { supabase } = await requireSiteRole(["supervisor", "qa", "site_admin"]);
  const { error } = await supabase.rpc("resolve_exception", {
    p_exception_id: parsed.data.exceptionId,
    p_note: parsed.data.note,
  });
  if (error) return { errors: [friendlyDbError(error)] };
  revalidatePath("/app/supervisor", "layout");
  return { ok: true, message: "Resolved." };
}

export async function requestReclean(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = recleanSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return issues(parsed.error);
  const { supabase } = await requireSiteRole(["supervisor", "site_admin"]);
  const { error } = await supabase.rpc("request_reclean", {
    p_task_id: parsed.data.taskId,
    p_note: parsed.data.note,
  });
  if (error) return { errors: [friendlyDbError(error)] };
  revalidatePath("/app/supervisor", "layout");
  return { ok: true, message: "Re-clean requested. It's now on the cleaner's list." };
}

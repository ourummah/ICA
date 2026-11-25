"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionState } from "@/lib/admin/action-result";
import { requireSiteAdmin } from "@/lib/admin/context";
import { runConfiguredAnchorJob } from "@/lib/anchor/run";
import { rateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

function summary(r: Awaited<ReturnType<typeof runConfiguredAnchorJob>>): ActionState {
  if (r.skipped) return { errors: ["Another anchoring run is in progress. Try again in a few minutes."] };
  const parts = [
    `Sealed ${r.sealed} new record${r.sealed === 1 ? "" : "s"}${r.amended ? ` and ${r.amended} correction(s)` : ""}.`,
  ];
  parts.push(r.batchCreated ? `Created batch #${r.batchCreated}.` : "No new records to batch.");
  if (!r.configured) parts.push("Anchoring isn't configured, so batches wait as pending.");
  for (const b of r.batches) parts.push(`Batch #${b.id}: ${b.status}.`);
  return { ok: true, message: parts.join(" ") };
}

/** "Seal and anchor now": the same job as the nightly cron. */
export async function anchorNow(): Promise<ActionState> {
  const { profileId: userId } = await requireSiteAdmin();
  if (!rateLimit(`anchor-now:${userId}`, 2, 60_000))
    return { errors: ["Please wait a minute before running it again."] };
  try {
    const report = await runConfiguredAnchorJob({ waitMs: 20_000 });
    revalidatePath("/app/admin/anchoring");
    return summary(report);
  } catch (e) {
    console.error("anchor now failed", e instanceof Error ? e.message : e);
    return { errors: ["The run failed. Check the server logs, then try again."] };
  }
}

/** Retries a failed batch that holds this site's records. */
export async function retryBatch(_: ActionState, fd: FormData): Promise<ActionState> {
  const { supabase, profileId: userId } = await requireSiteAdmin();
  const id = z.coerce.number().int().positive().safeParse(fd.get("batchId"));
  if (!id.success) return { errors: ["Unknown batch."] };
  // RLS: the batch must hold at least one record this admin can see.
  const { data: batch } = await supabase
    .from("anchor_batches")
    .select("id, status")
    .eq("id", id.data)
    .maybeSingle();
  if (!batch) return { errors: ["Unknown batch."] };
  if (batch.status !== "failed") return { errors: ["Only failed batches can be retried."] };
  if (!rateLimit(`anchor-now:${userId}`, 2, 60_000))
    return { errors: ["Please wait a minute before retrying."] };
  const { error } = await createAdminClient().rpc("retry_anchor_batch", { p_batch_id: batch.id });
  if (error) return { errors: [error.message] };
  const report = await runConfiguredAnchorJob({ waitMs: 20_000 });
  revalidatePath("/app/admin/anchoring");
  return summary(report);
}

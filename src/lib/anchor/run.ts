import "server-only";

import { parseEther } from "viem";

import { createAdminClient } from "@/lib/supabase/admin";

import { sendAnchorAlert } from "./alert";
import { chainFromConfig } from "./chain";
import { anchorConfig, minBalanceEth } from "./config";
import { runAnchorJob, type AnchorJobReport } from "./service";

/** Runs the anchoring job with the deployment's settings (cron route and admin button). */
export async function runConfiguredAnchorJob(opts: { waitMs?: number } = {}): Promise<AnchorJobReport> {
  const cfg = anchorConfig();
  return runAnchorJob({
    db: createAdminClient(),
    chain: cfg ? chainFromConfig(cfg) : null,
    alert: sendAnchorAlert,
    minBalanceWei: parseEther(String(minBalanceEth())),
    waitMs: opts.waitMs,
  });
}

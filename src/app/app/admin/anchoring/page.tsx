import { privateKeyToAccount } from "viem/accounts";
import { formatEther } from "viem";

import { ActionForm } from "@/components/action-form";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatSiteTime, requireSiteAdmin } from "@/lib/admin/context";
import { chainFromConfig } from "@/lib/anchor/chain";
import {
  ANCHOR_CHAINS,
  anchorConfig,
  explorerAddressUrl,
  explorerTxUrl,
  minBalanceEth,
} from "@/lib/anchor/config";

import { anchorNow, retryBatch } from "./actions";

const TONE = { anchored: "green", pending: "amber", submitted: "amber", failed: "red" } as const;

async function walletStatus() {
  const cfg = anchorConfig();
  if (!cfg) return null;
  const address = privateKeyToAccount(cfg.privateKey).address;
  const balance = await Promise.race([
    chainFromConfig(cfg).getBalance(),
    new Promise<null>((r) => setTimeout(() => r(null), 5_000)),
  ]).catch(() => null);
  return { cfg, address, balance: balance === null ? null : Number(formatEther(balance)) };
}

/** Admin: anchoring status, batches holding this site's records, retry and "anchor now". */
export default async function AnchoringPage() {
  const { supabase, site } = await requireSiteAdmin();
  const [wallet, { data: batches }, { data: records }] = await Promise.all([
    walletStatus(),
    supabase.from("anchor_batches").select("*").order("id", { ascending: false }).limit(30),
    supabase.from("sealed_records").select("batch_id").eq("site_id", site.id),
  ]);
  const perBatch = new Map<number | null, number>();
  for (const r of records ?? []) perBatch.set(r.batch_id, (perBatch.get(r.batch_id) ?? 0) + 1);
  const minBalance = minBalanceEth();

  return (
    <>
      <div>
        <h1 className="text-2xl font-bold text-primary">Record seals and anchoring</h1>
        <p className="text-muted-foreground">
          Each finished clean is sealed with a SHA-256 fingerprint. Every night at 00:15 (Australian Eastern
          Standard Time) the day&apos;s fingerprints are combined into one Merkle root and anchored on the
          Base blockchain. Only hashes go on-chain.
        </p>
      </div>

      <Card className="flex flex-col gap-2">
        <h2 className="font-semibold">Anchoring</h2>
        {wallet ? (
          <>
            <p className="text-sm">
              Network: {ANCHOR_CHAINS[wallet.cfg.chain].name} (test network) · contract{" "}
              <a
                className="font-mono text-accent underline"
                href={explorerAddressUrl(wallet.cfg.chain, wallet.cfg.contractAddress) ?? "#"}
                target="_blank"
                rel="noreferrer"
              >
                {wallet.cfg.contractAddress}
              </a>
            </p>
            <p className="text-sm">
              Wallet <span className="font-mono">{wallet.address}</span>:{" "}
              {wallet.balance === null ? "balance unavailable right now" : `${wallet.balance.toFixed(5)} ETH`}
            </p>
            {wallet.balance !== null && wallet.balance < minBalance ? (
              <p
                role="alert"
                className="rounded-md border-2 border-status-red bg-status-red/10 px-3 py-2 text-sm font-semibold"
              >
                Wallet balance is below {minBalance} ETH. Top it up so tonight&apos;s batch can be anchored.
              </p>
            ) : null}
          </>
        ) : (
          <p className="rounded-md border border-status-amber bg-status-amber/10 px-3 py-2 text-sm">
            Anchoring is not configured yet (no wallet key or contract address on the server). Records are
            still sealed and batched; batches wait as pending until it is set up. See docs/DEPLOY.md.
          </p>
        )}
        <ActionForm action={anchorNow} className="flex flex-wrap items-center gap-3">
          <Button type="submit">Seal and anchor now</Button>
          <span className="text-sm text-muted-foreground">
            {perBatch.get(null) ?? 0} of this site&apos;s records are waiting for the next batch.
          </span>
        </ActionForm>
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Batches with this site&apos;s records</h2>
        {!batches?.length ? <p className="text-muted-foreground">No batches yet.</p> : null}
        <ul className="flex flex-col gap-2">
          {(batches ?? []).map((b) => (
            <li key={b.id}>
              <Card className="flex flex-col gap-1 text-sm" data-batch-status={b.status}>
                <div className="flex flex-wrap items-center gap-2">
                  <strong>Batch #{b.id}</strong>
                  <Badge tone={TONE[b.status as keyof typeof TONE] ?? "neutral"}>{b.status}</Badge>
                  <span>{perBatch.get(b.id) ?? 0} of your records</span>
                  <span className="text-muted-foreground">
                    created {formatSiteTime(b.created_at, site.timezone)}
                  </span>
                </div>
                <p className="break-all font-mono text-xs">root {b.merkle_root}</p>
                {b.block_timestamp ? (
                  <p>Anchored {formatSiteTime(b.block_timestamp, site.timezone)}</p>
                ) : null}
                {b.tx_hash ? (
                  <a
                    href={explorerTxUrl(b.chain, b.tx_hash) ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-accent underline"
                  >
                    {b.status === "anchored" ? "Transaction" : "Latest transaction"} {b.tx_hash}
                  </a>
                ) : null}
                {b.attempts ? <p>Attempts: {b.attempts}</p> : null}
                {b.last_error ? <p className="text-status-red">Last error: {b.last_error}</p> : null}
                {b.status === "failed" ? (
                  <ActionForm action={retryBatch} inlineStatus className="flex items-center gap-2">
                    <input type="hidden" name="batchId" value={b.id} />
                    <Button type="submit" size="sm">
                      Retry
                    </Button>
                  </ActionForm>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

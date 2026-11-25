import Link from "next/link";

import { Badge, Card } from "@/components/ui/card";
import { explorerTxUrl } from "@/lib/anchor/config";

export interface SealRow {
  id: string;
  record_type: string;
  record_hash: string;
  sealed_at: string;
  anchor_batches: {
    id: number;
    status: string;
    tx_hash: string | null;
    chain: string;
    block_timestamp: string | null;
  } | null;
}

function siteDate(iso: string, timezone: string) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: timezone,
  }).format(new Date(iso));
}

/** Verification badge and history for a task's sealed records (docs/AUDIT_TRAIL.md). */
export function SealPanel({ seals, timezone }: { seals: SealRow[]; timezone: string }) {
  if (!seals.length) {
    return (
      <Card data-seal="none">
        <h2 className="font-semibold">Record seal</h2>
        <p className="text-sm text-muted-foreground">
          Not sealed yet. A clean is sealed when it is finished (or its shift has ended) and its records have
          synced.
        </p>
      </Card>
    );
  }
  const latest = seals[seals.length - 1];
  const anchored = latest.anchor_batches?.status === "anchored" ? latest.anchor_batches : null;
  const sealedOn = siteDate(anchored?.block_timestamp ?? latest.sealed_at, timezone);
  return (
    <Card className="flex flex-col gap-2" data-seal={anchored ? "verified" : "pending"}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">Record seal</h2>
        {anchored ? (
          <Badge tone="green" title={`Sealed on ${sealedOn}, independently verifiable`}>
            Verified ✓
          </Badge>
        ) : (
          <Badge tone="amber" title="Sealed. Anchored on the blockchain in the next daily batch.">
            Sealed · pending anchoring
          </Badge>
        )}
      </div>
      <p className="text-sm">
        {anchored
          ? `Sealed on ${sealedOn} and anchored on the blockchain. Independently verifiable.`
          : "Sealed and can no longer change. It is anchored on the blockchain in the next daily batch (within 24 hours)."}{" "}
        Record hash <span className="font-mono">{latest.record_hash.slice(0, 16)}…</span>
      </p>
      <div className="flex flex-wrap gap-3 text-sm">
        <Link href={`/verify/${latest.id}`} className="text-accent underline">
          Public verify page
        </Link>
        <a href={`/api/verify/${latest.id}/bundle`} className="text-accent underline">
          Download verification bundle
        </a>
        {anchored?.tx_hash ? (
          <a
            href={explorerTxUrl(anchored.chain, anchored.tx_hash) ?? "#"}
            target="_blank"
            rel="noreferrer"
            className="text-accent underline"
          >
            Transaction
          </a>
        ) : null}
      </div>
      {seals.length > 1 ? (
        <details className="text-sm">
          <summary className="cursor-pointer">History ({seals.length} versions)</summary>
          <ol className="mt-2 flex flex-col gap-1">
            {seals.map((s, i) => (
              <li key={s.id}>
                {i === 0 ? "Original" : `Correction ${i}`} · sealed {siteDate(s.sealed_at, timezone)} ·{" "}
                <Link href={`/verify/${s.id}`} className="font-mono text-accent underline">
                  {s.record_hash.slice(0, 12)}…
                </Link>{" "}
                {s.anchor_batches?.status === "anchored" ? "✓" : "(pending)"}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </Card>
  );
}

/** Site-level indicator: every seal linked, no gaps (verify_seal_chain). */
export function SealChainIndicator({
  result,
}: {
  result: { records: number; breaks: number; first_break_seq: number | null; verified: boolean } | null;
}) {
  if (!result) return null;
  if (result.verified) {
    return (
      <p className="text-sm text-status-green" data-seal-chain="ok">
        <span aria-hidden>🔒</span> Record seals: {result.records} linked, no gaps
      </p>
    );
  }
  return (
    <p
      role="alert"
      data-seal-chain="broken"
      className="rounded-md border-2 border-status-red bg-status-red/10 px-4 py-2 text-sm font-semibold"
    >
      Record seal chain broken
      {result.first_break_seq ? ` at seal #${result.first_break_seq}` : ""}: a sealed record is missing or was
      changed. Report this to your ICA administrator.
    </p>
  );
}

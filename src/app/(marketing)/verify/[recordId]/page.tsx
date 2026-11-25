import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { loadPublicVerification, type PublicVerification } from "@/lib/anchor/public";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = {
  title: "Verify a record · Intelligent Cleaning Audit",
  robots: { index: false },
};

function utc(t: string | null) {
  if (!t) return "";
  return `${new Date(t).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

const STATUS = {
  verified: {
    label: "Verified ✓",
    tone: "border-status-green bg-status-green/10",
    text: "This record is sealed and its fingerprint is anchored on a public blockchain. It has not been changed since it was sealed.",
  },
  pending: {
    label: "Sealed, pending anchoring",
    tone: "border-status-amber bg-status-amber/10",
    text: "This record is sealed. Its fingerprint goes into the next daily batch on the blockchain, usually within 24 hours.",
  },
  mismatch: {
    label: "❌ Mismatch",
    tone: "border-status-red bg-status-red/10",
    text: "The stored record no longer matches its fingerprint. Contact the site that shared this link.",
  },
} as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-2 sm:flex-row sm:gap-4">
      <dt className="w-44 shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-all font-mono text-sm">{children}</dd>
    </div>
  );
}

function Outcome({ v }: { v: PublicVerification }) {
  const o = v.outcome;
  const parts = [`${o.done} done`];
  if (o.failed) parts.push(`${o.failed} failed`);
  if (o.skipped) parts.push(`${o.skipped} skipped`);
  return (
    <>
      {o.steps} steps: {parts.join(", ")}
    </>
  );
}

/** Public verify page (QR code on audit packs). Shows only non-identifying summary fields. */
export default async function VerifyPage({ params }: PageProps<"/verify/[recordId]">) {
  const id = z.uuid().safeParse((await params).recordId);
  if (!id.success) notFound();
  const v = await loadPublicVerification(createAdminClient(), id.data);
  if (!v) notFound();
  const s = STATUS[v.status];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-bold text-primary">Cleaning record verification</h1>
      <section role="status" className={`rounded-md border-2 px-4 py-4 ${s.tone}`} data-status={v.status}>
        <p className="text-2xl font-bold">{s.label}</p>
        <p className="mt-1">{s.text}</p>
      </section>

      {v.superseded_by.length ? (
        <p className="rounded-md border border-border px-4 py-3 text-sm">
          This record was later corrected. Corrections are new sealed records; this one stays unchanged.{" "}
          {v.superseded_by.map((s, i) => (
            <Link key={s.record_id} href={`/verify/${s.record_id}`} className="text-accent underline">
              {i === v.superseded_by.length - 1 ? "Latest version" : `Version ${i + 2}`}
            </Link>
          ))}
        </p>
      ) : null}

      <section>
        <h2 className="mb-2 text-xl font-semibold">Summary</h2>
        <dl>
          <Row label="Site">{v.site_alias}</Row>
          <Row label="Shift date">{v.shift_date}</Row>
          <Row label="Result">
            <Outcome v={v} />
          </Row>
          <Row label="Record type">
            {v.record_type === "amendment" ? (
              <>
                Correction of{" "}
                <Link href={`/verify/${v.amends_record_id}`} className="text-accent underline">
                  an earlier record
                </Link>
              </>
            ) : (
              "Original"
            )}
          </Row>
          <Row label="Sealed">{utc(v.sealed_at)}</Row>
        </dl>
      </section>

      <section>
        <h2 className="mb-2 text-xl font-semibold">Proof</h2>
        <dl>
          <Row label="Record hash (SHA-256)">{v.record_hash}</Row>
          <Row label="Batch">{v.batch ? `#${v.batch.id}` : "Not batched yet"}</Row>
          <Row label="Merkle root">{v.batch?.merkle_root ?? "—"}</Row>
          <Row label="Anchored">{v.batch?.anchored_at ? utc(v.batch.anchored_at) : "Pending"}</Row>
          <Row label="Transaction">
            {v.batch?.tx_url ? (
              <a href={v.batch.tx_url} target="_blank" rel="noreferrer" className="text-accent underline">
                {v.batch.tx_hash}
              </a>
            ) : (
              "—"
            )}
          </Row>
          <Row label="Network">
            {v.batch?.chain === "base-sepolia" ? "Base Sepolia (test network)" : (v.batch?.chain ?? "—")}
          </Row>
        </dl>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Check it yourself</h2>
        <p className="text-sm">
          The verification bundle holds the full sealed record, its Merkle proof and the transaction. Anyone
          can check it with ICA&apos;s open-source verifier, using only a public blockchain node, or upload it
          on the{" "}
          <Link href="/verify" className="text-accent underline">
            bundle checker
          </Link>
          . The bundle contains the record&apos;s details, so downloading it needs a staff sign-in at the
          site; ask the site for a copy.
        </p>
        <p>
          <a
            href={`/api/verify/${v.record_id}/bundle`}
            className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 font-semibold text-primary-foreground"
          >
            Download verification bundle
          </a>
        </p>
      </section>
    </main>
  );
}

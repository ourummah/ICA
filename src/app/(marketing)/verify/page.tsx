import type { Metadata } from "next";

import { BundleChecker } from "@/components/verify/bundle-checker";

export const metadata: Metadata = { title: "Check a verification bundle · Intelligent Cleaning Audit" };

export default function VerifyIndexPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-3xl font-bold text-primary">Check a verification bundle</h1>
      <p>
        Every ICA cleaning record is sealed with a SHA-256 fingerprint, and each day&apos;s fingerprints are
        anchored on the Base blockchain. Choose a bundle file (<code>ica-verification-….json</code>) to
        recheck the fingerprint, the Merkle proof and the on-chain transaction. Nothing is stored.
      </p>
      <BundleChecker />
      <p className="text-sm text-muted-foreground">
        Prefer not to trust this page? Run the standalone verifier (<code>verify-ica.mjs</code>), which needs
        only Node.js and a public Base node.
      </p>
    </main>
  );
}

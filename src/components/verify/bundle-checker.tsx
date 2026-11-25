"use client";

import { useState } from "react";

interface Result {
  result?: "pass" | "fail" | "pending";
  checks?: { name: string; ok: boolean; detail: string }[];
  block_timestamp?: string | null;
  ica_holds_record?: boolean;
  error?: string;
}

const LABEL = { pass: "PASS ✓", fail: "FAIL ✗", pending: "Pending anchoring" } as const;

/** Uploads a bundle to /api/verify/bundle and shows each check. */
export function BundleChecker() {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/verify/bundle", { method: "POST", body: await file.text() });
      setResult((await res.json()) as Result);
    } catch {
      setResult({ error: "Could not check the bundle. Try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 font-semibold">
        Verification bundle
        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) => onFile(e.target.files?.[0])}
          className="font-normal"
        />
      </label>
      {busy ? <p role="status">Checking…</p> : null}
      {result?.error ? <p role="alert">{result.error}</p> : null}
      {result?.result ? (
        <section role="status" className="rounded-md border border-border p-4" data-result={result.result}>
          <p className="text-xl font-bold">{LABEL[result.result]}</p>
          {result.block_timestamp ? <p>Anchored in a block at {result.block_timestamp}</p> : null}
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {result.checks?.map((c) => (
              <li key={c.name}>
                {c.ok ? "✓" : "✗"} <span className="font-mono">{c.name}</span>: {c.detail}
              </li>
            ))}
            <li>
              {result.ica_holds_record
                ? "✓ ICA still holds a record with this hash"
                : "✗ ICA holds no record with this hash"}
            </li>
          </ul>
        </section>
      ) : null}
    </div>
  );
}

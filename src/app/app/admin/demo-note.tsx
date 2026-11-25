import { Info } from "lucide-react";

/** SPEC.md section 9: seeded values are placeholders, not real chemical or SSOP guidance. */
export function DemoValuesNote() {
  return (
    <p className="flex items-start gap-2 rounded-md border border-status-amber/40 bg-status-amber/10 px-3 py-2 text-sm">
      <Info className="mt-0.5 size-4 shrink-0 text-status-amber" aria-hidden />
      Demo values — use your site&apos;s SSOP and chemical labels.
    </p>
  );
}
